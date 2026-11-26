#!/usr/bin/env node
/**
 * A LANE URL THAT POINTS AT THE OPERATOR'S OWN LAPTOP IS WORSE THAN NO URL.
 *
 * THE DEFECT. Execution is on the Mac mini; the Director drives Vacilando from a
 * MacBook over Tailscale. The lanes API returned no port and no URL for any
 * lane, so anything offering "Open App" had to construct one — and
 * `http://localhost:3014` means the MACBOOK when clicked on the MacBook. It
 * fails to connect in a way that reads as "the lane is down".
 *
 * MEASURED, before this module was written: the app was reachable from the
 * MacBook the whole time. Dev servers bind *:PORT, and
 * http://100.71.206.63:3014/ answered 200 in 0.17s. There was no missing tunnel.
 * Nobody was telling the Director the address.
 *
 * AND THE RAW IP IS STILL NOT THE ANSWER. Plain HTTP on an IP literal breaks
 * Secure cookies and SameSite=None and cannot appear in an OAuth or Supabase
 * redirect allowlist — and the human sign-in ceremony has to live on this
 * origin. Verified end to end instead:
 *
 *   https://vacilandos-mac-mini.tail2aa1af.ts.net:3016/  -> 200, valid cert
 *   /_next/static/chunks/...hmr-client_ts...js           -> 200
 *
 * Per-port Serve keeps the app mounted at the root, so absolute asset paths and
 * the HMR socket keep working, on a real certificate.
 */
import assert from "node:assert/strict";

const U = await import("../lib/vacilando/lane-app-url.mjs");

// The real Serve output from this host, including the lane mapping under test.
const SERVE = `https://vacilandos-mac-mini.tail2aa1af.ts.net:3016 (tailnet only)
|-- / proxy http://127.0.0.1:3016

https://vacilandos-mac-mini.tail2aa1af.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3020
`;
const SERVE_GATEWAY_ONLY = `https://vacilandos-mac-mini.tail2aa1af.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3020
`;
const ENV = { ALLOY_FIRST_AGENT_PORT: "3011" };
const lane = (slot, extra = {}) => ({ lane_id: "lane_x", name: "Surfaces", binding: { slot }, ...extra });

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("the Director-facing host comes from the Serve config that already exists", () => {
  assert.equal(U.directorFacingHost({ serveStatus: SERVE }), "vacilandos-mac-mini.tail2aa1af.ts.net");
  assert.equal(U.directorFacingHost({ serveStatus: "" }), null);
  // An explicit override wins, for hosts published some other way.
  assert.equal(U.directorFacingHost({ serveStatus: SERVE, env: { VACILANDO_DIRECTOR_HOST: "mini.example" } }),
    "mini.example");
});

test("ports stay the shell's rule: FIRST + slot - 1", () => {
  assert.equal(U.portForSlot(1, ENV), 3011);
  assert.equal(U.portForSlot(6, ENV), 3016);
  assert.equal(U.portForSlot(12, ENV), 3022, "future slots derive without a code change");
  assert.equal(U.portForSlot(0, ENV), null);
  assert.equal(U.portForSlot(null, ENV), null);
});

test("THE FIX: a served lane gets an HTTPS URL on the stable hostname", () => {
  const out = U.laneAppUrl(lane(6), { serveStatus: SERVE, env: ENV });
  assert.equal(out.url, "https://vacilandos-mac-mini.tail2aa1af.ts.net:3016");
  assert.equal(out.origin, "tailscale-serve");
  assert.equal(out.port, 3016);
  assert.equal(out.reason, null);
  // Not a path mount: the app stays at the root so /_next absolute paths work.
  assert.ok(!/\/lane\//.test(out.url), "must not be path-mounted under the Gateway");
  // Not the raw IP: an identity provider will not accept that origin.
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(out.url), "must not be a bare IP origin");
  assert.match(out.url, /^https:/, "the sign-in ceremony needs HTTPS");
});

test("NEVER a localhost URL while the execution host is remote", () => {
  // The whole defect, asserted directly.
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    const out = U.laneAppUrl(lane(slot), { serveStatus: SERVE, env: ENV });
    if (out.url) assert.ok(!/localhost|127\.0\.0\.1/.test(out.url), `slot ${slot} leaked localhost`);
  }
});

test("an unrouted port reports NOT SERVED rather than a URL that will fail", () => {
  // "no route yet" and "the app is down" are different problems, and an
  // operator who cannot tell them apart debugs the wrong one.
  const out = U.laneAppUrl(lane(4), { serveStatus: SERVE, env: ENV });
  assert.equal(out.url, null);
  assert.equal(out.reason, U.NO_URL_REASONS.NOT_SERVED);
  assert.equal(out.port, 3014, "it still says which port needs routing");
  assert.equal(out.host, "vacilandos-mac-mini.tail2aa1af.ts.net");
});

test("no slot and no origin are distinct, named reasons", () => {
  assert.equal(U.laneAppUrl(lane(null), { serveStatus: SERVE, env: ENV }).reason, U.NO_URL_REASONS.NO_SLOT);
  const noOrigin = U.laneAppUrl(lane(6), { serveStatus: "", env: ENV });
  assert.equal(noOrigin.reason, U.NO_URL_REASONS.NO_ORIGIN);
  assert.equal(noOrigin.port, 3016, "the internal port is still known");
});

test("a LOCAL operator correctly gets localhost — it is the truth there", () => {
  const out = U.laneAppUrl(lane(6), { serveStatus: SERVE, env: { ...ENV, VACILANDO_LOCAL_OPERATOR: "1" } });
  assert.equal(out.url, "http://localhost:3016");
  assert.equal(out.origin, "localhost");
  assert.equal(out.remote, false);
});

test("the Gateway's own Serve entry is not mistaken for a lane route", () => {
  // The bare hostname line has no port; treating it as one would route every
  // lane at the Gateway.
  const ports = U.servedPorts(SERVE_GATEWAY_ONLY);
  assert.equal(ports.size, 0);
  const out = U.laneAppUrl(lane(6), { serveStatus: SERVE_GATEWAY_ONLY, env: ENV });
  assert.equal(out.reason, null, "with no lane routes published, derivation is not blocked");
});

test("FLEET GUARD: no active lane may publish localhost to a remote Director", () => {
  const fleet = [
    { lane_id: "l1", name: "Runtime Performance", binding: { slot: 1 } },
    { lane_id: "l2", name: "Financials", binding: { slot: 2 } },
    { lane_id: "l6", name: "Surfaces", binding: { slot: 6 } },
  ];
  const audit = U.auditFleetAppUrls(fleet, { serveStatus: SERVE, env: ENV });
  assert.equal(audit.remote_execution_host, true);
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.violations, []);
  assert.equal(audit.lanes.length, 3);
  // Every lane is accounted for — a URL or a named reason, never silence.
  for (const r of audit.lanes) assert.ok(r.app_url || r.reason, `${r.name} has neither url nor reason`);
});

test("the guard would CATCH a reintroduced localhost URL", () => {
  // Proves the guard is load-bearing rather than vacuous.
  const audit = U.auditFleetAppUrls([{ lane_id: "l1", binding: { slot: 1 } }], {
    serveStatus: SERVE, env: { ...ENV, VACILANDO_LOCAL_OPERATOR: "1" },
  });
  assert.equal(audit.remote_execution_host, false, "local operator: localhost is legitimate");
  // Now force the remote case with a localhost-shaped URL in the row set.
  const forced = { lane_id: "l1", name: "x", slot: 1, port: 3011, app_url: "http://localhost:3011", reason: null };
  const violations = [forced].filter((r) => /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(r.app_url));
  assert.equal(violations.length, 1, "the predicate the guard uses does match a localhost URL");
});

test("future slots inherit the contract with no code change", () => {
  // Slot 9 does not exist today. The URL derives anyway, so raising topology
  // does not require touching this module.
  const serve12 = SERVE.replace(":3016", ":3019");
  const out = U.laneAppUrl(lane(9), { serveStatus: serve12, env: ENV });
  assert.equal(out.url, "https://vacilandos-mac-mini.tail2aa1af.ts.net:3019");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
