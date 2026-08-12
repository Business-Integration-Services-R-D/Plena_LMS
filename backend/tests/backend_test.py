"""EduFlow LMS backend integration tests.
Covers auth, users, groups, questions, trainings, video upload/stream,
assignments, employee learn flow (heartbeat anti-cheat, checkpoints,
video-complete, quiz), and reports.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EDUFLOW_BASE_URL"].rstrip("/")
ADMIN_TOKEN = os.environ["ADMIN_TOKEN"]
EMP_TOKEN = os.environ["EMP_TOKEN"]
EMP_UID = os.environ["EMP_UID"]
SAMPLE_VIDEO = "/app/tests/sample_training.mp4"


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def admin_h():
    return _hdr(ADMIN_TOKEN)


@pytest.fixture(scope="session")
def emp_h():
    return _hdr(EMP_TOKEN)


# ---------- AUTH ----------
class TestAuth:
    def test_me_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_h)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_employee(self, emp_h):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=emp_h)
        assert r.status_code == 200
        assert r.json()["role"] == "employee"

    def test_unauthenticated_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_employee_forbidden_on_admin(self, emp_h):
        r = requests.get(f"{BASE_URL}/api/users", headers=emp_h)
        assert r.status_code == 403


# ---------- USERS ----------
_state = {}


class TestUsers:
    def test_create_user(self, admin_h):
        email = f"TEST_user_{int(time.time()*1000)}@example.com"
        r = requests.post(f"{BASE_URL}/api/users", headers=admin_h,
                          json={"email": email, "name": "TEST User", "role": "employee"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email.lower()
        assert data["status"] == "invited"
        _state["created_uid"] = data["user_id"]
        _state["created_email"] = email.lower()

    def test_activation_email_logged(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/emails", headers=admin_h)
        assert r.status_code == 200
        emails = r.json()
        assert any(e["to"] == _state["created_email"] and e["type"] == "activation" for e in emails)

    def test_duplicate_user_rejected(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/users", headers=admin_h,
                          json={"email": _state["created_email"], "name": "Dup"})
        assert r.status_code == 400

    def test_resend_activation(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/users/{_state['created_uid']}/resend-activation",
                          headers=admin_h)
        assert r.status_code == 200

    def test_delete_user(self, admin_h):
        r = requests.delete(f"{BASE_URL}/api/users/{_state['created_uid']}", headers=admin_h)
        assert r.status_code == 200


# ---------- GROUPS ----------
class TestGroups:
    def test_group_crud(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/groups", headers=admin_h,
                          json={"name": "TEST_grp", "member_ids": [EMP_UID]})
        assert r.status_code == 200
        gid = r.json()["group_id"]
        assert EMP_UID in r.json()["member_ids"]
        r = requests.put(f"{BASE_URL}/api/groups/{gid}", headers=admin_h,
                         json={"name": "TEST_grp2", "member_ids": []})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_grp2"
        r = requests.delete(f"{BASE_URL}/api/groups/{gid}", headers=admin_h)
        assert r.status_code == 200


# ---------- QUESTIONS ----------
class TestQuestions:
    def test_create_mc(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/questions", headers=admin_h, json={
            "text": "TEST_MC?", "qtype": "multiple_choice",
            "options": ["A", "B", "C"], "correct_index": 1
        })
        assert r.status_code == 200
        _state["q_mc"] = r.json()["question_id"]

    def test_create_free_text(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/questions", headers=admin_h, json={
            "text": "TEST_free?", "qtype": "free_text"
        })
        assert r.status_code == 200
        _state["q_ft"] = r.json()["question_id"]

    def test_mc_lt2_options_rejected(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/questions", headers=admin_h, json={
            "text": "bad", "qtype": "multiple_choice", "options": ["A"], "correct_index": 0
        })
        assert r.status_code == 400

    def test_create_second_mc_for_quiz(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/questions", headers=admin_h, json={
            "text": "TEST_MC2?", "qtype": "multiple_choice",
            "options": ["X", "Y"], "correct_index": 0
        })
        assert r.status_code == 200
        _state["q_mc2"] = r.json()["question_id"]


# ---------- TRAININGS + VIDEO ----------
class TestTrainings:
    def test_create_training(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/trainings", headers=admin_h,
                          json={"title": "TEST_Training", "description": "desc"})
        assert r.status_code == 200
        _state["tid"] = r.json()["training_id"]

    def test_upload_video(self, admin_h):
        with open(SAMPLE_VIDEO, "rb") as f:
            r = requests.post(f"{BASE_URL}/api/trainings/{_state['tid']}/video",
                              headers=admin_h,
                              files={"file": ("sample_training.mp4", f, "video/mp4")},
                              data={"duration": "30"})
        assert r.status_code == 200, r.text
        assert r.json()["size"] > 0

    def test_set_checkpoints_and_quiz(self, admin_h):
        r = requests.put(f"{BASE_URL}/api/trainings/{_state['tid']}", headers=admin_h, json={
            "checkpoints": [{
                "time": 10, "question_id": _state["q_mc"],
                "timeout_seconds": 60, "on_fail": "start"
            }],
            "quiz": {"question_ids": [_state["q_mc"], _state["q_mc2"], _state["q_ft"]],
                     "pass_score": 50}
        })
        assert r.status_code == 200
        t = r.json()
        assert len(t["checkpoints"]) == 1 and t["checkpoints"][0]["id"]
        _state["cp_id"] = t["checkpoints"][0]["id"]

    def test_video_stream_range(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/videos/{_state['tid']}",
                         headers={**admin_h, "Range": "bytes=0-1023"})
        assert r.status_code == 206
        assert "Content-Range" in r.headers

    def test_video_stream_unauth(self):
        r = requests.get(f"{BASE_URL}/api/videos/{_state['tid']}")
        assert r.status_code == 401


# ---------- ASSIGNMENTS ----------
class TestAssignments:
    def test_create_future_assignment(self, admin_h):
        # future assignment first (won't be visible)
        from datetime import datetime, timezone, timedelta
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r = requests.post(f"{BASE_URL}/api/assignments", headers=admin_h, json={
            "training_id": _state["tid"], "user_ids": [EMP_UID],
            "start_at": tomorrow, "reminder_days": 0
        })
        assert r.status_code == 200
        assert r.json()["created"] == 1
        _state["future_asg"] = r.json()["assignments"][0]["assignment_id"]

    def test_future_not_visible_to_employee(self, emp_h):
        r = requests.get(f"{BASE_URL}/api/my/assignments", headers=emp_h)
        assert r.status_code == 200
        ids = [a["assignment_id"] for a in r.json()]
        assert _state["future_asg"] not in ids

    def test_create_immediate_assignment(self, admin_h):
        # delete future to allow immediate for same user
        requests.delete(f"{BASE_URL}/api/assignments/{_state['future_asg']}", headers=admin_h)
        r = requests.post(f"{BASE_URL}/api/assignments", headers=admin_h, json={
            "training_id": _state["tid"], "user_ids": [EMP_UID], "reminder_days": 0
        })
        assert r.status_code == 200, r.text
        assert r.json()["created"] == 1
        _state["asg"] = r.json()["assignments"][0]["assignment_id"]

    def test_immediate_visible_to_employee(self, emp_h):
        r = requests.get(f"{BASE_URL}/api/my/assignments", headers=emp_h)
        assert r.status_code == 200
        assert any(a["assignment_id"] == _state["asg"] for a in r.json())

    def test_assignment_email_logged(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/emails", headers=admin_h)
        assert any(e["type"] == "assignment" for e in r.json())


# ---------- LEARN FLOW ----------
class TestLearn:
    def test_learn_detail_no_correct_index(self, emp_h):
        r = requests.get(f"{BASE_URL}/api/learn/{_state['asg']}", headers=emp_h)
        assert r.status_code == 200
        data = r.json()
        for cp in data["training"]["checkpoints"]:
            assert "correct_index" not in cp["question"]
        for q in data["training"]["quiz"]["questions"]:
            assert "correct_index" not in q

    def test_heartbeat_clamp_antichea(self, emp_h):
        # jump immediately to 25 -> must be clamped down significantly
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/heartbeat",
                          headers=emp_h, json={"position": 25, "playing": True})
        assert r.status_code == 200
        data = r.json()
        assert data["max_position"] < 20, f"anti-cheat failed, max={data['max_position']}"

    def test_checkpoint_gate_max_position(self, emp_h):
        # continue heartbeats — max_position must not exceed 10 + 1.5
        for _ in range(4):
            requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/heartbeat",
                          headers=emp_h, json={"position": 30, "playing": True})
            time.sleep(1.1)
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/heartbeat",
                          headers=emp_h, json={"position": 30, "playing": True})
        assert r.json()["max_position"] <= 11.5 + 0.001

    def test_checkpoint_wrong_answer(self, emp_h):
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/checkpoint",
                          headers=emp_h,
                          json={"checkpoint_id": _state["cp_id"], "answer_index": 0})
        assert r.status_code == 200
        assert r.json()["passed"] is False
        assert r.json()["rewind_to"] == 0.0

    def test_checkpoint_timed_out(self, emp_h):
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/checkpoint",
                          headers=emp_h,
                          json={"checkpoint_id": _state["cp_id"], "timed_out": True})
        assert r.json()["passed"] is False

    def test_video_complete_rejected_before_done(self, emp_h):
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/video-complete", headers=emp_h)
        assert r.status_code == 400

    def test_checkpoint_correct_answer(self, emp_h):
        # need to be near checkpoint time first; heartbeat multiple times
        for _ in range(10):
            requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/heartbeat",
                          headers=emp_h, json={"position": 11, "playing": True})
            time.sleep(1.1)
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/checkpoint",
                          headers=emp_h,
                          json={"checkpoint_id": _state["cp_id"], "answer_index": 1})
        assert r.status_code == 200
        assert r.json()["passed"] is True

    def test_quiz_blocked_before_video_complete(self, emp_h):
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/quiz",
                          headers=emp_h, json={"answers": []})
        assert r.status_code == 400

    def test_video_complete_success_after_progress(self, emp_h):
        # push heartbeats until max_position >= duration - 5 = 25
        for _ in range(20):
            r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/heartbeat",
                              headers=emp_h, json={"position": 30, "playing": True})
            if r.json()["max_position"] >= 25:
                break
            time.sleep(1.2)
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/video-complete", headers=emp_h)
        assert r.status_code == 200, r.text
        assert r.json()["has_quiz"] is True

    def test_quiz_submit_pass(self, emp_h):
        r = requests.post(f"{BASE_URL}/api/learn/{_state['asg']}/quiz", headers=emp_h, json={
            "answers": [
                {"question_id": _state["q_mc"], "answer_index": 1},   # correct
                {"question_id": _state["q_mc2"], "answer_index": 0},  # correct
                {"question_id": _state["q_ft"], "answer_text": "hello"},
            ]
        })
        assert r.status_code == 200
        data = r.json()
        assert data["score"] == 100
        assert data["passed"] is True
        # free text should be graded as None
        ft = next(a for a in data["answers"] if a["qtype"] == "free_text")
        assert ft["correct"] is None


# ---------- REPORTS ----------
class TestReports:
    def test_overview(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/overview", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_users", "total_trainings", "total_assignments",
                  "completed", "completion_rate"]:
            assert k in d

    def test_training_report(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/trainings/{_state['tid']}", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        assert d["rows"] and "watch_pct" in d["rows"][0]

    def test_assignment_detail(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/reports/assignments/{_state['asg']}/detail",
                         headers=admin_h)
        assert r.status_code == 200
        events = r.json()["events"]
        types = {e["type"] for e in events}
        assert "quiz_submitted" in types
        assert "checkpoint_passed" in types or "checkpoint_failed" in types
