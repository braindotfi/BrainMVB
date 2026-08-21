export type PasswordResetEmail = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

type PasswordResetEmailSender = (message: PasswordResetEmail) => Promise<void>;

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_FAILURE_CATEGORIES = new Set([
  "configuration_missing",
  "credential_rejected",
  "permission_rejected",
  "sender_rejected",
  "validation_rejected",
  "rate_limited",
  "provider_unavailable",
  "http_rejected",
  "network_error",
  "unknown",
]);
const SAFE_FAILURE_FIELDS = new Set(["api_key", "from_email", "from", "from.email"]);

export type PasswordResetEmailFailure = {
  category: string;
  status?: number;
  fields?: string[];
};

/**
 * Carries only diagnostics safe to retain in server logs. The Resend
 * response body is intentionally discarded because it may contain a recipient
 * address or other request data.
 */
export class PasswordResetEmailDeliveryError extends Error {
  readonly failure: PasswordResetEmailFailure;

  constructor(failure: PasswordResetEmailFailure) {
    super("Password-reset email delivery failed");
    this.name = "PasswordResetEmailDeliveryError";
    this.failure = failure;
  }
}

function knownProviderFailureFields(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const errors = (payload as { errors?: unknown }).errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return [];
  return Object.keys(errors).filter((field) => SAFE_FAILURE_FIELDS.has(field));
}

export function classifyResendFailure(status: number, payload: unknown): PasswordResetEmailFailure {
  const fields = knownProviderFailureFields(payload);
  const base = { status, ...(fields.length > 0 ? { fields } : {}) };
  if (status === 401) return { ...base, category: "credential_rejected" };
  if (status === 403) return { ...base, category: "permission_rejected" };
  if (status === 422 && fields.some((field) => field === "from" || field === "from.email")) {
    return { ...base, category: "sender_rejected" };
  }
  if (status === 422) return { ...base, category: "validation_rejected" };
  if (status === 429) return { ...base, category: "rate_limited" };
  if (status >= 500) return { ...base, category: "provider_unavailable" };
  return { ...base, category: "http_rejected" };
}

/**
 * Deliberately formats a fixed, allowlisted diagnostic. It must never render an
 * arbitrary error message, provider response, recipient, reset token, or link.
 */
export function formatPasswordResetEmailFailure(error: unknown): string {
  if (!(error instanceof PasswordResetEmailDeliveryError)) return "category=unknown";
  const category = RESEND_FAILURE_CATEGORIES.has(error.failure.category)
    ? error.failure.category
    : "unknown";
  const parts = [
    typeof error.failure.status === "number" ? `status=${error.failure.status}` : null,
    `category=${category}`,
  ];
  const fields = error.failure.fields?.filter((field) => SAFE_FAILURE_FIELDS.has(field)) ?? [];
  if (fields.length > 0) parts.push(`fields=${fields.join(",")}`);
  return parts.filter((part): part is string => part !== null).join(" ");
}

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
      `This link expires ${message.expiresInMinutes} minutes after it was requested and can be used once.`,
      "If this was not requested, no action is needed.",
    ].join("\n"),
    html: `<p>A password reset was requested for your Brain Finance account.</p>
<p><a href="${url}">Reset your password</a></p>
<p>This link expires ${message.expiresInMinutes} minutes after it was requested and can be used once.</p>
<p>If this was not requested, no action is needed.</p>`,
  };
}

async function sendWithResend(message: PasswordResetEmail): Promise<void> {
  const token = process.env.RESEND_API_KEY;
  // Keep the existing verified sender as the default during the provider
  // migration; RESEND_FROM_EMAIL can override it when the new provider uses
  // a different verified address.
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim()
    || process.env.MAILERSEND_FROM_EMAIL?.trim();
  const fromName = process.env.RESEND_FROM_NAME?.trim()
    || process.env.MAILERSEND_FROM_NAME?.trim()
    || "Brain Finance";
  if (!token || !fromEmail) {
    throw new PasswordResetEmailDeliveryError({
      category: "configuration_missing",
      fields: [
        ...(!token ? ["api_key"] : []),
        ...(!fromEmail ? ["from_email"] : []),
      ],
    });
  }

  const copy = resetEmailCopy(message);
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [message.to],
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
      }),
    });
  } catch {
    throw new PasswordResetEmailDeliveryError({ category: "network_error" });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new PasswordResetEmailDeliveryError(classifyResendFailure(response.status, payload));
  }
}

let sender: PasswordResetEmailSender = sendWithResend;

export function sendPasswordResetEmail(message: PasswordResetEmail): Promise<void> {
  return sender(message);
}

/** Test-only seam. Never logs or stores the raw reset link in production. */
export function setPasswordResetEmailSenderForTests(next: PasswordResetEmailSender | null): void {
  sender = next ?? sendWithResend;
}