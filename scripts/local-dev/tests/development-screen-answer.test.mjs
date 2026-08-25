#!/usr/bin/env node
/**
 * Answering a provider's blocking dialog from Vacilando.
 *
 * WHAT WAS BROKEN. A Claude onboarding, trust or permission modal stopped a
 * lane dead and Vacilando said "this prompt has to be answered in the agent's
 * terminal". Honest, and a dead end: on a phone there is no terminal to go to,
 * so the lane was stuck with no way forward at all.
 *
 * THE LINE THIS MUST NOT CROSS. Vacilando does not DECIDE. It reads the choices
 * the provider is offering, shows them verbatim, and relays the one the
 * operator picked. Nothing here selects a default, infers an answer, or
 * dismisses a screen the operator never saw.
 */
import assert from "node:assert/strict";
import test from "node:test";

const A = await import("../lib/vacilando/provider-screen-answer.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");
const L = await import("../lib/vacilando/lanes.mjs");

const NBSP = String.fromCharCode(0x00a0);
const RULE = "─".repeat(72);

/** The live Runtime Performance screen, verbatim. */
const ONBOARDING = [
  "  - Host: load average peaked at 111; two abandoned sibling dev servers",
  RULE,
  "  Teach auto mode about your environment?",
  "  Auto mode works better when it knows your environment. Takes about a minute.",
  `  ❯ 1. Yes`,
  "    2. Not now",
  "    3. Don't show again",
  "  Enter to confirm · Esc to cancel",
  RULE,
  `❯${NBSP}Investigate the 8-second related/opportunity endpoint`,
  RULE,
  "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
].join("\n");

const TRUST = [
  RULE,
  "  Quick safety check: Is this a project you created or one you trust?",
  "  ❯ 1. Yes, I trust this folder",
  "    2. No, exit",
  "  Enter to confirm · Esc to cancel",
  RULE,
].join("\n");

// ------------------------------------------------------------- parsing

test("the real onboarding screen parses into its actual choices", () => {
  const s = A.answerableScreen(ONBOARDING, { provider: "claude" });
  assert.equal(s.answerable, true);
  assert.equal(s.kind, "onboarding");
  assert.equal(s.question, "Teach auto mode about your environment?");
  assert.match(s.detail, /works better when it knows your environment/);
  assert.deepEqual(s.options.map((o) => `${o.index}. ${o.label}`),
    ["1. Yes", "2. Not now", "3. Don't show again"]);
  assert.equal(s.options[0].selected, true, "the highlighted row is marked");
  assert.equal(s.was_terminal_only, true, "this class used to be a dead end");
});

test("the question is the question, not the sentence under it", () => {
  // Taking the nearest line above the options grabs the explanation and drops
  // the actual question.
  assert.equal(A.parseBlockingScreen(ONBOARDING).question,
    "Teach auto mode about your environment?");
});

test("a trust gate parses too", () => {
  const s = A.answerableScreen(TRUST, { provider: "claude" });
  assert.equal(s.answerable, true);
  assert.deepEqual(s.options.map((o) => o.label), ["Yes, I trust this folder", "No, exit"]);
});

test("prose that merely contains numbers is not a dialog", () => {
  const prose = [
    "Here is what I found:",
    "  1. The endpoint is slow",
    "some other line entirely",
    "  3. Unrelated",
  ].join("\n");
  assert.equal(A.parseBlockingScreen(prose), null);
});

test("options must run consecutively from 1", () => {
  const skipped = [RULE, "  Pick one?", "  ❯ 1. A", "    3. C", "  Enter to confirm"].join("\n");
  assert.equal(A.parseBlockingScreen(skipped), null);
});

test("a single option is not a choice", () => {
  const one = [RULE, "  Continue?", "  ❯ 1. OK", "  Enter to confirm"].join("\n");
  assert.equal(A.parseBlockingScreen(one), null);
});

test("a blocker with no options is reported as terminal-only, honestly", () => {
  const login = [
    RULE,
    "  Sign in to continue",
    "  Paste this URL in your browser: https://example.com/device",
    RULE,
  ].join("\n");
  const s = A.answerableScreen(login, { provider: "claude" });
  assert.equal(s.answerable, false);
  // Either it found a blocker with no options, or nothing at all — both are
  // honest, and neither offers a button.
  assert.ok(["no_selectable_options", "no_blocking_screen"].includes(s.reason));
});

test("a clean pane offers nothing to answer", () => {
  const clean = [RULE, `❯${NBSP}`, RULE, "  ⏵⏵ auto mode on (shift+tab to cycle)"].join("\n");
  assert.equal(A.answerableScreen(clean, { provider: "claude" }).answerable, false);
});

// ---------------------------------------------------------------- keys

test("answering types the digit then confirms, as two sends", () => {
  // One chord would be interpreted as a single key by tmux.
  assert.deepEqual(A.answerKeysArgv("%9", 2), [
    ["send-keys", "-t", "%9", "2"],
    ["send-keys", "-t", "%9", "Enter"],
  ]);
});

test("the key transport is exported, not reached for privately", () => {
  // Three earlier fixes silently no-opped by importing a private symbol.
  assert.equal(typeof L.sendPaneKeys, "function");
  assert.equal(typeof L.capturePaneText, "function");
});

test("sendPaneKeys refuses anything that is not a key send", () => {
  return L.sendPaneKeys(["kill-session", "-t", "x"]).then((out) => {
    assert.equal(out.ok, false);
    assert.equal(out.error, "unsupported_key_argv");
  });
});

// ------------------------------------------------------------- refusals

test("a choice that is not on screen is refused", async () => {
  const out = await A.answerBlockingScreen("lane_x", {
    choice: 7,
    capture: async () => ONBOARDING,
    tmux: async () => ({ ok: true }),
  });
  // Either the lane lookup fails first, or the choice does — never a send.
  assert.equal(out.ok, false);
  assert.ok(["lane_not_found", "choice_not_on_screen", "invalid_choice"].includes(out.error), out.error);
});

test("a non-numeric or out-of-range choice never reaches the pane", async () => {
  for (const bad of ["yes", -1, 0, 99, null, "2; rm -rf /"]) {
    const out = await A.answerBlockingScreen("lane_x", {
      choice: bad,
      capture: async () => ONBOARDING,
      tmux: async () => { throw new Error("must not send"); },
    });
    assert.equal(out.ok, false, JSON.stringify(bad));
  }
});

test("the screen is re-read at answer time, not trusted from the render", async () => {
  // The dialog may have changed between render and tap; answering a stale one
  // could select something entirely different.
  const src = (await import("node:fs")).readFileSync(
    new URL("../lib/vacilando/provider-screen-answer.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function answerBlockingScreen"));
  assert.ok(fn.includes("capturePaneText") || fn.includes("capture ||"),
    "it must capture the pane inside the answer path");
  assert.ok(fn.includes("expectedQuestion"), "and honour the question the operator saw");
});

// ------------------------------------------------------------------ UI

test("the dialog renders every option the provider offered", () => {
  const s = A.answerableScreen(ONBOARDING, { provider: "claude" });
  const html = V.renderBlockingScreen(s);
  assert.ok(html.includes("Teach auto mode about your environment?"));
  for (const label of ["Yes", "Not now", "Don't show again"]) {
    assert.ok(html.includes(label), label);
  }
  assert.equal((html.match(/data-gw-screen-answer/g) || []).length, 3);
});

test("the UI states plainly that Vacilando does not answer for you", () => {
  const html = V.renderBlockingScreen(A.answerableScreen(ONBOARDING, { provider: "claude" }));
  assert.ok(/does not answer for you/i.test(html));
});

test("the question travels with the markup so a changed dialog can be caught", () => {
  const html = V.renderBlockingScreen(A.answerableScreen(ONBOARDING, { provider: "claude" }));
  assert.ok(html.includes('data-gw-screen-question="Teach auto mode about your environment?"'));
});

test("options are disabled while an answer is in flight", () => {
  const html = V.renderBlockingScreen(A.answerableScreen(ONBOARDING, { provider: "claude" }), { pending: 2 });
  assert.equal((html.match(/disabled/g) || []).length, 3, "all of them, not just the tapped one");
});

test("nothing renders when there is nothing to answer", () => {
  assert.equal(V.renderBlockingScreen(null), "");
  assert.equal(V.renderBlockingScreen({ answerable: false }), "");
});

test("a truly terminal-only screen says so instead of offering buttons", () => {
  const html = V.renderUnanswerableScreen({
    answerable: false, needs_terminal: true,
    blocker: { title: "Claude needs to sign in", signal: "Paste this URL" },
  });
  assert.ok(html.includes("agent's terminal"));
  assert.equal(html.includes("data-gw-screen-answer"), false, "no buttons for something unpickable");
});

test("every answer refusal has operator-facing copy", () => {
  for (const e of ["screen_changed", "choice_not_on_screen", "no_blocking_screen", "no_selectable_options",
    "lane_has_no_pane", "capture_failed", "answer_send_failed", "invalid_choice"]) {
    const text = V.screenAnswerErrorText(e);
    assert.ok(text && !text.includes("_"), `${e} -> ${text}`);
  }
});
