const INVITE_RETURN_TO_PATTERN = /^\/invite\/[A-Za-z0-9._~-]+$/;

/**
 * An auth continuation can only point to one of our own invite routes. Keeping
 * this narrow prevents password-reset and sign-in links from becoming open
 * redirects while preserving the explicit Join company boundary.
 */
export function validInviteReturnTo(value: unknown): string | undefined {
  return typeof value === "string" && INVITE_RETURN_TO_PATTERN.test(value)
    ? value
    : undefined;
}

export function inviteReturnToFromSearch(search: string): string | undefined {
  return validInviteReturnTo(new URLSearchParams(search).get("return_to"));
}