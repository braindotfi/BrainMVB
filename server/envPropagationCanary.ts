import { createHash } from "node:crypto";

export const ENV_PROPAGATION_CANARY_NAME = "NORTHSTAR_SECRET_PROPAGATION_CANARY";

export function envPropagationCanaryWitness(value: string | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    return `[env-propagation-canary] name=${ENV_PROPAGATION_CANARY_NAME} present=false fingerprint=none`;
  }

  const fingerprint = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return (
    `[env-propagation-canary] name=${ENV_PROPAGATION_CANARY_NAME} ` +
    `present=true fingerprint=sha256:${fingerprint}`
  );
}