/**
 * Source-scan guards for the Brain Assistant truncation warning UX.
 *
 * #222 — Make the 'start a new conversation' truncation warning actually clickable.
 *
 *   The inline context-truncation note is rendered as plain text OR as a span
 *   containing a <button> when the note text includes "start a new conversation".
 *   This test pins that the button wiring exists and calls startNewSession so a
 *   restyle cannot accidentally revert the phrase back to inert text.
 *
 * #223 — Prevent old truncation warnings from accumulating across a long conversation.
 *
 *   Before appending a new truncation note, the message list is filtered to
 *   remove all prior isContextNote messages. Only the most-recent note is
 *   meaningful; stale ones confuse the user about which send was affected.
 *   This test pins that the cleanup filter is in place.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const BRAIN_ASSISTANT = "client/src/pages/sections/BrainAssistant.tsx";

// ─── #222: Clickable truncation warning ──────────────────────────────────────

describe("Truncation warning is clickable (#222)", () => {
  it("startNewSession function exists in BrainAssistant", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    expect(src, "startNewSession must be defined").toMatch(/const startNewSession\s*=/);
  });

  it("context-truncation-note testid is present so QA can locate the note", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    expect(src).toMatch(/data-testid=["'`]context-truncation-note["'`]/);
  });

  it("the truncation note renders a <button> (not just plain text) when text contains 'start a new conversation'", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    // Find the truncation-note block and confirm it has a button with onClick.
    const noteIdx = src.indexOf("context-truncation-note");
    expect(noteIdx, "context-truncation-note block not found").toBeGreaterThan(-1);
    // The button must be inside the note block (within 2000 chars of the testid).
    const noteBlock = src.slice(noteIdx, noteIdx + 2000);
    expect(noteBlock, "note block must contain a <button>").toMatch(/<button/);
    expect(noteBlock, "button must call startNewSession on click").toMatch(
      /onClick=\{startNewSession\}/,
    );
  });

  it("the button covers exactly the 'start a new conversation' phrase — not the whole note", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    // The ACTION constant pins the phrase that becomes the button label.
    expect(src, 'ACTION constant must equal "start a new conversation"').toMatch(
      /const ACTION\s*=\s*["'`]start a new conversation["'`]/,
    );
  });

  it("startNewSession is also wired to the 'New conversation' toolbar button", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    // startNewSession must appear more than once (truncation note + toolbar button).
    const count = (src.match(/onClick=\{startNewSession(Expanded)?\}/g) ?? []).length;
    expect(count, "startNewSession must be wired to at least two UI elements").toBeGreaterThanOrEqual(2);
  });
});

// ─── #223: Old truncation warnings are cleared ───────────────────────────────

describe("Old truncation warnings are cleared before each send (#223)", () => {
  it("the message list is filtered to remove prior context notes before appending a new one", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    // The cleanup must filter out isContextNote messages from the existing list.
    // Arrow-function form: .filter((m) => !m.isContextNote)
    expect(src, "isContextNote filter must be applied before appending").toMatch(
      /\.filter\(\(m\)[^)]*!m\.isContextNote\)/,
    );
  });

  it("isContextNote is defined as an optional field on the ChatMessage type", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    expect(src, "isContextNote must be an optional field on the message type").toMatch(
      /isContextNote\s*\?:\s*boolean/,
    );
  });

  it("filterPayloadMessages strips context notes before the wire payload is built", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    // filterPayloadMessages must be called before buildChatPayload.
    const filterIdx = src.indexOf("filterPayloadMessages");
    const buildIdx = src.indexOf("buildChatPayload");
    expect(filterIdx, "filterPayloadMessages must be called").toBeGreaterThan(-1);
    expect(buildIdx, "buildChatPayload must be called").toBeGreaterThan(-1);
    // Both exist in the sendMessage flow; filter must precede build.
    const sendStart = src.indexOf("const sendMessage");
    expect(sendStart, "sendMessage function not found").toBeGreaterThan(-1);
    const sendSrc = src.slice(sendStart, sendStart + 3000);
    const filterInSend = sendSrc.indexOf("filterPayloadMessages");
    const buildInSend = sendSrc.indexOf("buildChatPayload");
    expect(filterInSend, "filterPayloadMessages must appear in sendMessage").toBeGreaterThan(-1);
    expect(buildInSend, "buildChatPayload must appear in sendMessage").toBeGreaterThan(-1);
    expect(
      filterInSend,
      "filterPayloadMessages must run before buildChatPayload",
    ).toBeLessThan(buildInSend);
  });

  it("only the most-recent note is kept — the comment names the accumulation bug it fixes", () => {
    const src = readFileSync(BRAIN_ASSISTANT, "utf8");
    // The comment that explains the accumulation fix must mention #223 so future
    // editors know why the filter exists and don't remove it as "dead code".
    expect(src, "#223 must be called out in a comment near the cleanup filter").toMatch(
      /#223/,
    );
  });
});
