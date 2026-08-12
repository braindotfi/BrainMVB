const ASSISTANT_BULLET_LINE = /^[-*•]\s+/;

/** True when a complete assistant-response line starts a markdown-style list item. */
export function isAssistantBulletLine(line: string): boolean {
  return ASSISTANT_BULLET_LINE.test(line.trim());
}

/** Remove the list marker while preserving the item text for a rendered <li>. */
export function stripAssistantBullet(line: string): string {
  return line.trim().replace(ASSISTANT_BULLET_LINE, "");
}