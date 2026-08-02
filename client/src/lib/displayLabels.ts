/** Presentation casing for user-facing badges, pills, and compact labels. */
export function capitalCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          if (!part) return part;
          if (/^[A-Z0-9/&]+$/.test(part) && /[A-Z]/.test(part)) return part;
          return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
        })
        .join("-"),
    )
    .join(" ");
}