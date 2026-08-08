#!/usr/bin/env bash

set -u
set -o pipefail

max_attempts="${NPM_CI_MAX_ATTEMPTS:-3}"
retry_delay="${NPM_CI_RETRY_DELAY_SECONDS:-15}"
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

is_transient_failure() {
  grep -Eiq \
    'npm error code (EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|ENOTFOUND|EAI_FAIL|EPIPE|ECONNABORTED|ERR_SOCKET_TIMEOUT|E502|E503|E504|E429)|'\
'(fetch failed|socket timeout|HTTP (502|503|504|429))' \
    "$1"
}

for attempt in $(seq 1 "$max_attempts"); do
  : >"$log_file"
  echo "npm ci attempt ${attempt}/${max_attempts}"

  npm ci --no-audit --no-fund 2>&1 | tee "$log_file"
  status=${PIPESTATUS[0]}
  if [ "$status" -eq 0 ]; then
    exit 0
  fi

  if ! is_transient_failure "$log_file"; then
    echo "npm ci failed with a deterministic error; not retrying." >&2
    exit "$status"
  fi

  if [ "$attempt" -lt "$max_attempts" ]; then
    echo "npm ci hit a transient network failure; retrying in ${retry_delay} seconds..." >&2
    sleep "$retry_delay"
  fi
done

echo "npm ci failed after ${max_attempts} transient-failure attempts." >&2
exit 1