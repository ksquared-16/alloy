/**
 * THE VERIFIER MUST BE ABLE TO SEE AN IDENTITY THAT EXISTS.
 *
 * `browser-auth` treats `alloy-agent-verify` as the one definition of "authenticated" on this
 * machine, and `classifyVerification` needs an IDENTITY so another slot's QA account reads as
 * `wrong_identity` rather than "close enough". But the verifier only ever reported whether the route
 * bounced to /login — it never said WHO — so the consumer scraped its output for an email that was
 * never printed, and every restore of a perfectly valid session verified as
 * "no authenticated identity was reported".
 *
 * That was an instrument defect, not an auth defect: /workspace 307s to /login when anonymous, yet a
 * fresh context restored from the managed storage state loaded /workspace with no redirect and the
 * application reported the expected operator in its own auth payload.
 *
 * These cases pin the contract between the two halves: the probe names the identity, and the
 * consumer reads the named field.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyVerification, verifyBrowserAuthSync } from "../lib/vacilando/browser-auth.mjs";

const EXPECTED = "qa-slot1-product@example.com";
const validated = { slot: 1, expected_identity: EXPECTED };
const run = (stdout, stderr = "") => () => ({ ok: true, stdout, stderr, error: null });

test("the named identity line verifies a genuinely authenticated session", () => {
    // Byte-for-byte what the patched verifier prints.
    const out = `summary: /tmp/verify.json\nidentity: ${EXPECTED}\nresult: PASS\n`;
    const v = verifyBrowserAuthSync(validated, { spawnSyncImpl: run(out) });
    assert.equal(v.ok, true);
    assert.equal(v.state, "restored");
    assert.equal(v.actual_identity, EXPECTED);
});

test("a verifier that reports no identity still fails closed", () => {
    // The pre-fix output. It must NOT start passing just because the consumer got smarter.
    const out = "summary: /tmp/verify.json\nresult: PASS\n";
    const v = verifyBrowserAuthSync(validated, { spawnSyncImpl: run(out) });
    assert.equal(v.ok, false);
    assert.equal(v.state, "verification_failed");
    assert.equal(v.actual_identity, null);
});

test("another slot's QA account is wrong_identity, never close enough", () => {
    const out = `summary: /tmp/verify.json\nidentity: qa-slot4-product@example.com\nresult: PASS\n`;
    const v = verifyBrowserAuthSync(validated, { spawnSyncImpl: run(out) });
    assert.equal(v.ok, false);
    assert.equal(v.state, "wrong_identity");
});

test("an email in unrelated output cannot be mistaken for the operator", () => {
    /*
     * The reason the named field is preferred over a loose scan. A console error or a failed-request
     * URL carrying an address must not be reported as the signed-in identity — that would turn a
     * healthy session into a false `wrong_identity`.
     */
    const out = `summary: /tmp/verify.json\nidentity: ${EXPECTED}\nresult: PASS\n`;
    const stderr = "warn: mail delivery to parent-contact@example.org failed\n";
    const v = verifyBrowserAuthSync(validated, { spawnSyncImpl: run(out, stderr) });
    assert.equal(v.actual_identity, EXPECTED);
    assert.equal(v.ok, true);
});

test("an older verifier without the named field keeps its previous behaviour", () => {
    // Fallback path: the loose scan still resolves an identity, so this is not a breaking change.
    const out = `summary: /tmp/verify.json\nsigned in as ${EXPECTED}\nresult: PASS\n`;
    const v = verifyBrowserAuthSync(validated, { spawnSyncImpl: run(out) });
    assert.equal(v.ok, true);
    assert.equal(v.actual_identity, EXPECTED);
});

test("a /workspace bounce to /login still outranks any reported identity", () => {
    assert.equal(
        classifyVerification({
            expectedIdentity: EXPECTED,
            actualIdentity: EXPECTED,
            workspaceRedirectsToLogin: true,
        }).state,
        "verification_failed",
    );
});
