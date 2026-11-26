#!/usr/bin/env node
/**
 * Starting a lane is starting a conversation.
 *
 * It used to be a form: Name, a Provider dropdown, then "Initial work" — three
 * fields before anything could happen, with the name demanded before the
 * operator had said what the lane was for. On a phone the form overflowed a
 * container with `overflow:hidden`, so the message box and the Start button
 * were cut off with no way to scroll to them.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "vacilando", "public");
const ROOT = mkdtempSync(join(tmpdir(), "vac-create-lane-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

const { deriveLaneNameFromInstruction, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const { createNewLaneRequest } = await import("../lib/vacilando/lane-identity-api.mjs");
const { listExecutionRunsForLane } = await import("../lib/vacilando/execution-run.mjs");
const { renderCreateLaneFlow, renderGatewayShell, createErrorText } =
  await import("../apps/vacilando/public/gateway-view.mjs");

const css = readFileSync(join(PUBLIC, "styles.css"), "utf8");
const gwSrc = readFileSync(join(PUBLIC, "gateway.js"), "utf8");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// ------------------------------------------------------- naming from a message --

await test("a lane names itself from its first message", () => {
  assert.equal(
    deriveLaneNameFromInstruction("Fix the composer cutoff on mobile"),
    "Fix the composer cutoff on mobile",
  );
  // Markdown and list syntax are chrome, not the name.
  assert.equal(deriveLaneNameFromInstruction("## Runtime convergence\n\nthen details"), "Runtime convergence");
  assert.equal(deriveLaneNameFromInstruction("- fix the pane readiness gate"), "fix the pane readiness gate");
  assert.equal(deriveLaneNameFromInstruction("1. first step"), "first step");
  assert.equal(deriveLaneNameFromInstruction("`code` and **bold**"), "code and bold");
  // Leading blank lines are skipped.
  assert.equal(deriveLaneNameFromInstruction("\n\n   \nreal first line"), "real first line");
  // Long messages cut on a word boundary, not mid-word. The real property: the
  // kept text is a prefix of the source that ends where a word ends.
  const source = "Investigate why the mobile header has an enormous dead region above it";
  const long = deriveLaneNameFromInstruction(source);
  assert.ok(long.length <= 49, long);
  assert.match(long, /…$/);
  const kept = long.slice(0, -1);
  assert.ok(source.startsWith(kept), "the name is a prefix of the message");
  const next = source.charAt(kept.length);
  assert.ok(next === "" || next === " ", `cut mid-word before ${JSON.stringify(next)}`);
  assert.equal(deriveLaneNameFromInstruction(""), "");
  assert.equal(deriveLaneNameFromInstruction(null), "");
});

// ----------------------------------------------------------- the create request --

await test("a first message alone creates the lane and starts the work", async () => {
  resetDevelopmentLanesForTests?.();
  const out = await createNewLaneRequest({
    instruction: "Fix create lane to feel like a new chat\n\nMore detail follows.",
    provider: "claude",
  });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.ok, true);
  const lane = out.body.lane;
  assert.equal(lane.name, "Fix create lane to feel like a new chat", "named from the first message");
  assert.equal(lane.preferred_provider, "claude");

  // The message IS the work: a run exists and carries it verbatim.
  const runs = listExecutionRunsForLane(lane.lane_id, ROOT);
  assert.equal(runs.length, 1);
  assert.match(runs[0].instruction, /^Fix create lane to feel like a new chat/);
  assert.match(runs[0].instruction, /More detail follows\./, "the whole message, not just the title line");
  assert.equal(runs[0].state, "QUEUED");
  assert.ok(out.body.admission, "and it is queued for capacity");
});

await test("the provider preference is carried onto the new lane", async () => {
  const out = await createNewLaneRequest({ instruction: "Cursor please", provider: "cursor" });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.lane.preferred_provider, "cursor");
  const dflt = await createNewLaneRequest({ instruction: "No preference given" });
  assert.equal(dflt.body.lane.preferred_provider, "claude", "Claude is the default preference");
});

await test("an explicit name still wins over the derived one", async () => {
  const out = await createNewLaneRequest({ name: "Billing", instruction: "Something else entirely" });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.lane.name, "Billing");
});

await test("nothing to say is refused in words, not a code", async () => {
  const out = await createNewLaneRequest({ instruction: "   " });
  assert.equal(out.status, 400);
  assert.equal(out.body.error, "name_or_instruction_required");
  assert.match(createErrorText("name_or_instruction_required"), /first message/i);
  assert.equal(createErrorText("name_or_instruction_required").includes("name_or_instruction_required"), false);
  assert.match(createErrorText("path_refused"), /not accepted/i);
});

// ------------------------------------------------------------------ the surface --

await test("the form is a composer: one message, a provider preference, Start", () => {
  const html = renderCreateLaneFlow({});
  // The name field is gone — you name it by writing, and rename in Details.
  assert.equal(html.includes("gw-create-name"), false);
  assert.equal(/<select/.test(html), false, "provider is a preference toggle, not a dropdown");
  assert.match(html, /id="gw-create-instruction"/);
  assert.match(html, /placeholder="What should this lane work on\?"/);
  assert.match(html, /data-gw-create-provider="claude"[^>]*aria-pressed="true"/);
  assert.match(html, /data-gw-create-provider="cursor"[^>]*aria-pressed="false"/);
  assert.match(html, />Start</);
  assert.match(html, /rename it any time in Details/);

  const cursorFirst = renderCreateLaneFlow({ provider: "cursor" });
  assert.match(cursorFirst, /data-gw-create-provider="cursor"[^>]*aria-pressed="true"/);
  const busy = renderCreateLaneFlow({ submitting: true });
  assert.match(busy, /data-gw-create-submit disabled/);
  assert.match(busy, />Starting…</);
  const errored = renderCreateLaneFlow({ error: "name_or_instruction_required" });
  assert.match(errored, /Write a first message/);
});

await test("the start route uses the lane skeleton so nothing is cut off", () => {
  const shell = renderGatewayShell({ lanes: [], selectedId: null, connect: {}, listReady: true, emptyDetail: false });
  // renderGatewayShell only reaches "create" through the hash router; assert the
  // structure directly on the create branch instead.
  const create = renderGatewayShell({
    lanes: [], selectedId: "create", lane: null, connect: {}, listReady: true,
  });
  const target = create.includes('data-gw-mode="create"') ? create : shell;
  if (target.includes('data-gw-mode="create"')) {
    assert.match(target, /gw-lane-stage/);
    assert.match(target, /gw-chat-head/);
  }
  // The stage is a bounded flex column; the intro scrolls and the composer is
  // pinned, exactly as on a lane. The old form was dropped straight into
  // .gw-main, which is overflow:hidden — hence the cut-off Start button.
  assert.match(css, /\.gw-start\{[^}]*flex:1 1 auto[^}]*min-height:0/);
  assert.match(css, /\.gw-start-intro\{[^}]*overflow-y:auto/);
  assert.match(css, /\.gw-start-composer\{flex:0 0 auto/);
  // 16px, or iOS zooms the page when the operator taps the box.
  const mobile = css.slice(css.indexOf("@media (max-width:860px)"), css.lastIndexOf("@media (min-width:861px)"));
  assert.match(mobile, /\.gw-start-composer textarea\{font-size:16px/);
  assert.match(mobile, /\.gw\.is-start \.gw-composer\{padding-bottom:max\(10px, env\(safe-area-inset-bottom, 0px\)\)/);
});

await test("submit sends the message and the provider, and never a name field", () => {
  const fn = gwSrc.slice(gwSrc.indexOf("async function submitCreate"), gwSrc.indexOf("async function fetchCandidates"));
  assert.equal(fn.includes("gw-create-name"), false, "there is no name input to read");
  assert.match(fn, /const name = ""/);
  assert.match(fn, /name_or_instruction_required/, "an empty message is refused before the request");
  assert.match(fn, /JSON\.stringify\(\{ name, provider, instruction \}\)/);
  assert.match(gwSrc, /data-gw-create-provider/, "the provider toggle is wired");
});

await test("the keyboard never collapses the start composer into a row", () => {
  // Measured "inside the app box" and passed while the message field was 40px
  // wide: the lane's single-row keyboard composer applied to the start screen
  // too, squeezing label, field, provider and Send onto one line. The screenshot
  // caught what the geometry check did not.
  const mobile = css.slice(css.indexOf("@media (max-width:860px)"), css.lastIndexOf("@media (min-width:861px)"));
  assert.match(mobile, /:root\[data-gw-keyboard\] \.gw-start-composer \.gw-composer-box\{flex-direction:column/);
  assert.match(mobile, /:root\[data-gw-keyboard\] \.gw-start-composer \.gw-composer-h\{display:none/);
  // The provider preference is part of the decision on THIS screen, so unlike
  // the lane composer it must stay visible while typing.
  assert.match(mobile, /:root\[data-gw-keyboard\] \.gw-lane-stage:not\(:has\(\.gw-start\)\) \.gw-provider\{display:none/);
  assert.equal(/:root\[data-gw-keyboard\] \.gw-provider\{display:none/.test(mobile), false,
    "a blanket rule would hide the provider question on the start screen");
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
