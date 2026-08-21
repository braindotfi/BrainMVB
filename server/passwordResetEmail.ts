export type PasswordResetEmail = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

type PasswordResetEmailSender = (message: PasswordResetEmail) => Promise<void>;

const MAILERSEND_ENDPOINT = "https://api.mailersend.com/v1/email";

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

function resetEmailCopy(message: PasswordResetEmail) {
  const url = htmlEscape(message.resetUrl);
  return {
    subject: "Reset your Brain Finance password",
    text: [
      "A password reset was requested for your Brain Finance account.",
      "",
      `Reset your password: ${message.resetUrl}`,
      "",
      `This link expires in ${message.expiresInMinutes} minutes and can be used once.`,
      "If this was not requested, no action is needed.",
    ].join("\n"),
    html: `<p>A password reset was requested for your Brain Finance account.</p>
<p><a href="${url}">Reset your password</a></p>
<p>This link expires in ${message.expiresInMinutes} minutes and can be used once.</p>
<p>If this was not requested, no action is needed.</p>`,
  };
}

async function sendWithMailerSend(message: PasswordResetEmail): Promise<void> {
  const token = process.env.MAILERSEND_API_TOKEN;
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL;
  if (!token || !fromEmail) {
    throw new Error("Password-reset email is not configured");
  }

  const copy = resetEmailCopy(message);
  const response = await fetch(MAILERSEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: process.env.MAILERSEND_FROM_NAME || "Brain Finance" },
      to: [{ email: message.to }],
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    }),
  });
  if (!response.ok) {
    throw new Error(`MailerSend rejected password-reset email (${response.status})`);
  }
}

let sender: PasswordResetEmailSender = sendWithMailerSend;

export function sendPasswordResetEmail(message: PasswordResetEmail): Promise<void> {
  return sender(message);
}

/** Test-only seam. Never logs or stores the raw reset link in production. */
export function setPasswordResetEmailSenderForTests(next: PasswordResetEmailSender | null): void {
  sender = next ?? sendWithMailerSend;
}