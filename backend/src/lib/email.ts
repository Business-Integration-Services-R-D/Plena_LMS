import { ACTIVATION_TTL_MINUTES } from "./activation";
import { PASSWORD_RESET_TTL_MINUTES } from "./password-reset";

type ActivationEmailInput = {
  to: string;
  name: string;
  code: string;
  token: string;
};

type PasswordResetEmailInput = {
  to: string;
  name: string;
  token: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function activationUrl(token: string) {
  return `${appUrl()}/activate?token=${encodeURIComponent(token)}`;
}

function passwordResetUrl(token: string) {
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

function activationText({ name, code, token }: ActivationEmailInput) {
  return `Plena LMS

Hoş Geldiniz ${name}!

Martı Denizcilik Portalı'ndaki hesabınızı aktive etmek için aşağıdaki doğrulama kodunu kullanın:

${code}

Aktivasyon bağlantısı: ${activationUrl(token)}

Bu kod ve bağlantı ${ACTIVATION_TTL_MINUTES} dakika içinde geçerliliğini yitirecektir.
Bu e-postayı siz talep etmediyseniz güvenle görmezden gelebilirsiniz.

© Martı Denizcilik — Powered by Plena LMS`;
}

function activationHtml({ name, code, token }: ActivationEmailInput) {
  const safeName = escapeHtml(name);
  const digits = code
    .split("")
    .map(
      (digit) =>
        `<span style="display:inline-block;min-width:28px;margin:0 3px">${digit}</span>`,
    )
    .join("");

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Plena LMS Hesap Aktivasyonu</title>
  </head>
  <body style="margin:0;padding:0;background:#edf4fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg,#f6f9fd 0%,#e5f3ff 55%,#f8fbff 100%)">
      <tr>
        <td align="center" style="padding:44px 18px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:rgba(255,255,255,.92);border:1px solid #d8e7f4;border-radius:22px;box-shadow:0 20px 55px rgba(14,32,51,.18)">
            <tr>
              <td align="center" style="padding:44px 38px 38px">
                <div style="font-size:40px;font-weight:300;letter-spacing:-1.5px;color:#172033;margin-bottom:34px">Plena LMS</div>
                <h1 style="font-size:27px;line-height:1.2;font-weight:400;margin:0 0 10px;color:#26374d">Hoş Geldiniz!</h1>
                <p style="font-size:15px;line-height:1.55;margin:0 0 8px;color:#334155">Merhaba ${safeName},</p>
                <p style="font-size:15px;line-height:1.55;margin:0 0 28px;color:#334155">Martı Denizcilik Portalı'na giriş yapmak için aşağıdaki doğrulama kodunu kullanın.</p>

                <div style="background:#fff;border:1px solid #e5edf5;border-radius:14px;padding:19px 12px;margin:0 0 24px;box-shadow:0 7px 20px rgba(14,32,51,.08);font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:34px;font-weight:600;letter-spacing:3px;color:#172033;white-space:nowrap">
                  ${digits}
                </div>

                <p style="font-size:13px;line-height:1.6;margin:0 0 4px;color:#526174">Bu kod ve bağlantı <strong>${ACTIVATION_TTL_MINUTES} dakika</strong> içinde geçerliliğini yitirecektir.</p>
                <p style="font-size:13px;line-height:1.6;margin:0 0 28px;color:#69778a">Bu e-postayı siz talep etmediyseniz güvenle görmezden gelebilirsiniz.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-top:1px solid #d9e5ef;width:24%">&nbsp;</td>
                    <td align="center" style="padding:0 14px">
                      <a href="${activationUrl(token)}" style="display:inline-block;border:2px solid #1f76a2;border-radius:9px;padding:11px 20px;color:#155f83;text-decoration:none;font-size:14px;font-weight:600;white-space:nowrap">HESABI AKTİVE ET</a>
                    </td>
                    <td style="border-top:1px solid #d9e5ef;width:24%">&nbsp;</td>
                  </tr>
                </table>

                <p style="font-size:12px;line-height:1.5;margin:28px 0 0;color:#536276">© Martı Denizcilik — Powered by Plena LMS</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY tanımlı değil");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.EMAIL_FROM ||
        "Plena LMS <noreply@bislabs.tech>",
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.name || "E-posta gönderilemedi",
    );
  }

  return { id: payload?.id ?? null };
}

export async function sendActivationEmail(input: ActivationEmailInput) {
  return sendEmail({
    to: input.to,
    subject: "Plena LMS - Hesabınızı Aktive Edin",
    html: activationHtml(input),
    text: activationText(input),
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  const safeName = escapeHtml(input.name);
  const resetUrl = passwordResetUrl(input.token);
  const text = `Plena LMS\n\nMerhaba ${input.name},\n\nŞifrenizi yenilemek için aşağıdaki bağlantıyı kullanın:\n\n${resetUrl}\n\nBu bağlantı ${PASSWORD_RESET_TTL_MINUTES} dakika boyunca geçerlidir ve yalnızca bir kez kullanılabilir. Bu talebi siz oluşturmadıysanız e-postayı görmezden gelebilirsiniz.`;
  const html = `<!doctype html>
<html lang="tr">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Şifre Yenileme</title></head>
  <body style="margin:0;padding:0;background:#edf4fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:44px 18px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#fff;border:1px solid #d8e7f4;border-radius:22px;box-shadow:0 20px 55px rgba(14,32,51,.14)"><tr><td align="center" style="padding:44px 38px">
        <div style="font-size:34px;font-weight:300;color:#172033;margin-bottom:28px">Plena LMS</div>
        <h1 style="font-size:25px;font-weight:500;margin:0 0 12px">Şifrenizi yenileyin</h1>
        <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 8px">Merhaba ${safeName},</p>
        <p style="font-size:14px;line-height:1.6;color:#64748b;margin:0 0 26px">Şifrenizi değiştirmek için aşağıdaki güvenli bağlantıyı kullanın.</p>
        <a href="${resetUrl}" style="display:inline-block;border-radius:999px;padding:13px 24px;background:#0e2033;color:#fff;text-decoration:none;font-size:14px;font-weight:600">ŞİFREMİ YENİLE</a>
        <p style="font-size:12px;line-height:1.6;color:#64748b;margin:26px 0 0">Bağlantı ${PASSWORD_RESET_TTL_MINUTES} dakika geçerlidir ve yalnızca bir kez kullanılabilir. Talebi siz oluşturmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
      </td></tr></table>
    </td></tr></table>
  </body>
</html>`;

  return sendEmail({
    to: input.to,
    subject: "Plena LMS - Şifrenizi Yenileyin",
    html,
    text,
  });
}
