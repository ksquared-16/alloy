/**
 * THE MAPPING THAT NOBODY OWNED.
 *
 * `lane-app-url` could always report `no_serve_mapping_for_port`, and the
 * Gateway rendered it as "port not published to the tailnet". Nothing could act
 * on it: no code in this repository ran `tailscale serve`, so which lanes a
 * remote Director could reach was decided by whichever ports an operator had
 * once typed a command for. On the execution host that was 3011, 3014, 3015,
 * 3016 and 3021 out of a managed range of 3011-3022 — so Financials (slot 2)
 * and Payments (slot 7), among others, told the Director to go and sign in and
 * offered no address to do it at.
 *
 * These tests pin the reconciler that closes it, and the two properties that
 * make it safe to run unattended: tailnet only, and additive only.
 */
import assert from "node:assert/strict";

const S = await import("../lib/vacilando/tailnet-serve.mjs");

const ENV = { ALLOY_FIRST_AGENT_PORT: "3011", ALLOY_MAX_AGENTS: "12" };

/** The shape `tailscale serve status` prints, trimmed to what is parsed. */
const SERVE = `
https://mini.tail2aa1af.ts.net:3011 (tailnet only)
|-- / proxy http://127.0.0.1:3011

https://mini.tail2aa1af.ts.net:3015 (tailnet only)
|-- / proxy http://127.0.0.1:3015

https://mini.tail2aa1af.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3030
`;

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

await test("the ports to publish come from topology, not from a list", async () => {
  assert.deepEqual(S.desiredServePorts(ENV), [3011, 3012, 3013, 3014, 3015, 3016, 3017, 3018, 3019, 3020, 3021, 3022]);
  // A host that raises the ceiling gets the new ports with no code change —
  // which is the whole reason a hardcoded six was a defect and not a style
  // preference.
  assert.deepEqual(S.desiredServePorts({ ...ENV, ALLOY_MAX_AGENTS: "6" }),
    [3011, 3012, 3013, 3014, 3015, 3016]);
});

await test("THE DEFECT: the gap between managed ports and published ones is named", async () => {
  const missing = S.missingServePorts({ serveStatus: SERVE, env: ENV });
  assert.ok(missing.includes(3012), "slot 2 — Financials — was unreachable and must be in the gap");
  assert.ok(missing.includes(3017), "slot 7 — Payments — was unreachable and must be in the gap");
  assert.ok(!missing.includes(3011), "an already-published port is not re-published");
  assert.ok(!missing.includes(3015), "an already-published port is not re-published");
  // The Gateway's own root mapping is not a lane port and must not be counted.
  assert.ok(!missing.includes(3030));
});

await test("TAILNET ONLY. The command is serve, and never funnel", async () => {
  const args = S.serveCommandArgs(3012);
  assert.deepEqual(args, ["serve", "--bg", "--https=3012", "http://127.0.0.1:3012"]);
  assert.ok(!args.includes("funnel"), "funnel publishes to the public internet");
  assert.ok(args.every((a) => !/funnel/i.test(a)));
  // The proxy target is loopback, always: this host may only publish what it
  // is itself serving.
  assert.match(args[3], /^http:\/\/127\.0\.0\.1:\d+$/);
});

await test("only a managed slot port is ever published", async () => {
  const calls = [];
  const out = await S.reconcileTailnetServe({
    serveStatus: SERVE,
    env: ENV,
    run: async (args) => { calls.push(args); return { ok: true }; },
  });
  const ports = calls.map((a) => Number(String(a[2]).replace("--https=", "")));
  for (const p of ports) {
    assert.ok(p >= 3011 && p <= 3022, `${p} is outside the managed agent range`);
  }
  // The control plane's port can never be claimed, which is the failure that
  // would take the Gateway down rather than merely leaving a lane dark.
  assert.ok(!ports.includes(3030), "the Gateway's port must never be published as a lane");
  assert.equal(out.ok, true);
  assert.equal(out.failed.length, 0);
});

await test("ADDITIVE ONLY: nothing is ever withdrawn", async () => {
  const calls = [];
  await S.reconcileTailnetServe({
    serveStatus: SERVE,
    env: ENV,
    run: async (args) => { calls.push(args.join(" ")); return { ok: true }; },
  });
  for (const c of calls) {
    assert.ok(!/--remove|reset|off\b/.test(c), `withdrawal is not this module's business: ${c}`);
  }
  // A host that is already complete does no work at all.
  const full = S.desiredServePorts(ENV)
    .map((p) => `https://mini.ts.net:${p} (tailnet only)\n|-- / proxy http://127.0.0.1:${p}\n`).join("\n");
  const quiet = [];
  const out = await S.reconcileTailnetServe({
    serveStatus: full, env: ENV, run: async (a) => { quiet.push(a); return { ok: true }; },
  });
  assert.equal(quiet.length, 0, "a healthy host must not shell out at all");
  assert.equal(out.ok, true);
  assert.equal(out.already_published, 12);
});

await test("a failure is reported, never thrown — the Gateway stays up", async () => {
  const out = await S.reconcileTailnetServe({
    serveStatus: SERVE,
    env: ENV,
    run: async () => ({ ok: false, error: "tailscale_cli_not_found" }),
  });
  assert.equal(out.ok, false);
  assert.ok(out.failed.length > 0);
  assert.equal(out.published.length, 0);
  // A host with no Tailscale at all is a host reached some other way, not a
  // reason to fail a boot.
  assert.ok(out.failed.every((f) => typeof f.port === "number"));
});

await test("the audit names the slots a Director cannot reach", async () => {
  const a = S.auditTailnetServe({ serveStatus: SERVE, env: ENV });
  assert.equal(a.ok, false);
  assert.ok(a.missing_slots.includes(2), "Financials");
  assert.ok(a.missing_slots.includes(7), "Payments");
  assert.ok(!a.missing_slots.includes(1));
  assert.equal(a.tailscale_configured, true);
  // No Tailscale on the host is stated, not guessed at.
  assert.equal(S.auditTailnetServe({ serveStatus: "", env: ENV }).tailscale_configured, false);
});

await test("a dry run says what it would do and does nothing", async () => {
  let ran = 0;
  const out = await S.reconcileTailnetServe({
    serveStatus: SERVE, env: ENV, dryRun: true, run: async () => { ran += 1; return { ok: true }; },
  });
  assert.equal(ran, 0);
  assert.equal(out.dry_run, true);
  assert.ok(out.published.every((p) => p.dry_run === true));
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
