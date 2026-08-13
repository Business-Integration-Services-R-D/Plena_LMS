"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
      className="rounded-full border border-sea-200 px-3 py-1.5 text-sea-800 hover:bg-sea-50"
    >
      Çıkış
    </button>
  );
}
