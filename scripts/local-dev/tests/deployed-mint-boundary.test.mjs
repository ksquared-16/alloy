/**
 * The mint's cookie domain is the THIRD reason a deployed session could not exist.
 *
 * Even with a deployed base URL and a deployed-aware validator, this file wrote
 * cookies for the literal domains "localhost" and "127.0.0.1", so the storage
 * was scoped to loopback and could never authenticate a deployed host. All
 * three assumptions had to go; any one remaining kept deployed sessions broken.
 *
 * The boundary is widened by exactly ONE paired shape, not opened. A deployed
 * base is accepted only when it matches the cookie domain the governed executor
 * resolved from the trusted registry, so the mint cannot be aimed at an
 * arbitrary host by supplying a base URL alone — the two would disagree.
 *
 * These run the real CLI against a readable but empty trusted env, so every
 * refusal below happens BEFORE any magic link could be created.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MINT = new URL("../vac-qa-session-mint.mjs", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "mint-boundary-"));
const ENV = join(dir, "env");
writeFileSync(ENV, "PLACEHOLDER=1\n");

function mint(args) {
  let out = "";
  try {
    out = String(execFileSync("node", [MINT, "--identity", "q@e.com", "--storage",
      join(dir, "s.json"), "--env-source", ENV, ...args], { encoding: "utf8" }));
  } catch (e) {
    out = String(e?.stdout || "");
  }
  try { return JSON.parse(out.trim().split("\n")[0]); } catch { return { error: "unparseable" }; }
}

/** Past the boundary: the env is deliberately empty, so this is how success looks here. */
const PAST_BOUNDARY = "trusted_env_incomplete";

test("a deployed base with its matching cookie domain passes the boundary", () => {
  const r = mint(["--base-url", "https://staging.workwithalloy.com",
    "--cookie-domain", "staging.workwithalloy.com"]);
  assert.equal(r.error, PAST_BOUNDARY, "the pairing is the accepted deployed shape");
});

test("a deployed base cannot be aimed without the resolved cookie domain", () => {
  const r = mint(["--base-url", "https://staging.workwithalloy.com"]);
  assert.equal(r.error, "not_loopback_base",
    "supplying a base URL alone must not reach a deployed host");
});

test("base and cookie domain must agree", () => {
  const r = mint(["--base-url", "https://evil.example",
    "--cookie-domain", "staging.workwithalloy.com"]);
  assert.equal(r.error, "base_cookie_domain_mismatch");
});

test("a loopback base may not write a deployed cookie domain", () => {
  // That would be a localhost session wearing a deployed domain — the original
  // defect in its most dangerous form, because it would LOOK like deployed proof.
  const r = mint(["--base-url", "http://127.0.0.1:3011",
    "--cookie-domain", "staging.workwithalloy.com"]);
  assert.equal(r.error, "base_cookie_domain_mismatch");
});

test("a deployed base must be https — a Secure cookie cannot ride plaintext", () => {
  const r = mint(["--base-url", "http://staging.workwithalloy.com",
    "--cookie-domain", "staging.workwithalloy.com"]);
  assert.equal(r.error, "deployed_base_not_https");
});

test("LOCAL REGRESSION — the loopback path is unchanged", () => {
  const r = mint(["--base-url", "http://127.0.0.1:3011"]);
  assert.equal(r.error, PAST_BOUNDARY, "no cookie domain means exactly the old behaviour");
});

test("a malformed cookie domain is refused", () => {
  for (const bad of ["https://staging.workwithalloy.com", "sta ging.com", "a/b"]) {
    const r = mint(["--base-url", "http://127.0.0.1:3011", "--cookie-domain", bad]);
    assert.equal(r.error, "bad_arguments", `"${bad}" is not a hostname`);
  }
});
