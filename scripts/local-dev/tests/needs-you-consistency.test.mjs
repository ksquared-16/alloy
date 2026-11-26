/**
 * Needs You: one committed collection behind all four surfaces.
 *
 * WHY THIS FILE IS STRUCTURAL. The implementation that landed (staging
 * 51ce6788d, from the ui-vac lane) commits the actionable set once per revision
 * inside gateway.js, and every surface paints from that object. Its behaviour is
 * already covered by that lane's fixtures. What is NOT covered, and what
 * regressed once already, is the SHAPE of the wiring: a surface quietly going
 * back to its own count, or a falsy-zero guard creeping back in.
 *
 * The original defect was exactly that shape:
 *
 *     Number(G.attentionCount) || (G.home?.approvals?.length || 0)
 *
 * A genuine loaded ZERO is falsy, so an authoritative empty state fell through
 * to a stale snapshot count from a different collection. Steady state always
 * converged, which is what made it easy to miss and worthless as a guarantee.
 *
 * These assertions are cheap and they fail loudly if any surface starts
 * answering "how much needs you" on its own again.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Comments are stripped before matching.
 *
 * A structural guard must read CODE, not prose. The first version of this file
 * failed against a tree that had already been fixed, because the fix's own
 * comment quoted the forbidden pattern verbatim to explain it. That is the same
 * trap as a read-only banner containing the word "MODIFY": if you scan the
 * explanation along with the implementation, documenting a defect looks
 * identical to committing one.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

const GW = stripComments(
  readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8"),
);

test("the actionable set is committed once per revision", () => {
  assert.match(GW, /function commitNeedsYou/,
    "one owner must commit the collection; surfaces do not each recompute it");
});

test("no surface falls back to a second collection with ||", () => {
  // The exact regression: `Number(<count>) || (<other collection>.length || 0)`.
  // A loaded zero is falsy, so this pattern cannot express "authoritatively none".
  assert.doesNotMatch(GW, /Number\(G\.attentionCount\)\s*\|\|\s*\(G\.home/,
    "the original falsy-zero fallback must not return");
  assert.doesNotMatch(GW, /G\.home\?\.approvals\?\.length/,
    "the navigation must not read a different collection than the rows");
});

test("the badge does not count the approvals array itself", () => {
  // The earlier form of the same bug: the badge counted a list this file had
  // just fetched, while the notification store counted separately. Two answers
  // to one question, disagreeing whenever a request produced more than one
  // lifecycle event.
  assert.doesNotMatch(GW, /badge\.textContent\s*=\s*String\(\s*\(?G\.approvals/,
    "the badge reads the committed collection, not a raw fetched list");
});

test("gateway-view renders the approvals bar count from the rows it is given", () => {
  // Heading and rows cannot disagree if the heading is derived from the rows.
  const V = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url), "utf8");
  assert.match(V, /export function renderPendingApprovalsBar/);
  assert.match(V, /const rows = Array\.isArray\(approvals\)/,
    "the renderer takes the rows as its only input");
  assert.match(V, /const n = rows\.length;/,
    "and derives its heading count from them, rather than accepting a separate number");
});
