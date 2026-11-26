/**
 * A CERTIFICATION MUST NOT SILENTLY MEASURE A LOGGED-OUT BROWSER.
 *
 * The managed QA session's access token lives one hour; a Phases 5–7 pass outlives it. Reaching the
 * expiry mid-run would bounce every navigation to /login and the remaining samples would be quietly
 * wrong rather than loudly absent — the worst outcome for a measurement. These pin the decisions the
 * harness makes around that: what counts as a healthy session, what a refresh must prove before the
 * run continues, and that the refresh interval is reported so it can be excluded.
 */
import { describe, expect, it } from "vitest";

import {
    SESSION_STATE,
    readReportedIdentity,
    readSessionState,
    refreshSatisfies,
} from "../../scripts/lib/managedQaSession.mjs";

const EXPECTED = "qa-slot1-product@example.com";

describe("reading the governed command's verdict", () => {
    it("a session the governed command clears for execution is valid", () => {
        // Verbatim shape of `vac browser-auth status` on a healthy slot.
        const t = [
            "Browser session present for slot 1 — not yet verified",
            "  slot 1 · http://127.0.0.1:3011 · expected qa-slot1-product@example.com",
            "  storage: captured 2026-09-02T13:47:14.596Z mode 0600",
            "  blocks execution: false",
        ].join("\n");
        expect(readSessionState(t)).toBe(SESSION_STATE.VALID);
    });

    it("an expired session is expired, not merely 'not valid'", () => {
        const t = [
            "Browser session expired — Re-authentication required",
            "  storage: captured 2026-09-02T12:24:57.915Z mode 0600",
            "  blocks execution: true",
        ].join("\n");
        expect(readSessionState(t)).toBe(SESSION_STATE.EXPIRED);
    });

    it("an absent session is distinguished from an expired one", () => {
        expect(readSessionState("storage: absent\nblocks execution: true")).toBe(SESSION_STATE.ABSENT);
        expect(readSessionState("error: auth not ready (missing)")).toBe(SESSION_STATE.ABSENT);
    });

    it("output it cannot read is UNKNOWN, and unknown is never healthy", () => {
        // A future wording change must stall the harness, never wave it through.
        expect(readSessionState("something new nobody parsed")).toBe(SESSION_STATE.UNKNOWN);
        expect(readSessionState("")).toBe(SESSION_STATE.UNKNOWN);
    });

    it("the identity comes from the command's report", () => {
        expect(readReportedIdentity(`signed in as ${EXPECTED}`)).toBe(EXPECTED);
        expect(readReportedIdentity("no identity here")).toBeNull();
    });
});

describe("what a refresh must prove before a run continues", () => {
    it("a valid session as the expected identity is accepted", () => {
        expect(refreshSatisfies({ state: SESSION_STATE.VALID, identity: EXPECTED, expectedIdentity: EXPECTED }).ok).toBe(true);
    });

    it("case differences are not identity differences", () => {
        expect(refreshSatisfies({ state: SESSION_STATE.VALID, identity: EXPECTED.toUpperCase(), expectedIdentity: EXPECTED }).ok).toBe(true);
    });

    it("ANOTHER slot's QA account fails closed", () => {
        // One slot's certification asserting against another slot's data is the corruption this
        // check exists to prevent. Never "close enough".
        const v = refreshSatisfies({
            state: SESSION_STATE.VALID,
            identity: "qa-slot4-product@example.com",
            expectedIdentity: EXPECTED,
        });
        expect(v.ok).toBe(false);
        expect(v.reason).toBe("wrong_identity");
    });

    it("a refresh that reports no identity fails closed", () => {
        const v = refreshSatisfies({ state: SESSION_STATE.VALID, identity: null, expectedIdentity: EXPECTED });
        expect(v.ok).toBe(false);
        expect(v.reason).toBe("identity_not_reported");
    });

    it("a session still expired after refreshing fails closed, naming the state", () => {
        const v = refreshSatisfies({ state: SESSION_STATE.EXPIRED, identity: EXPECTED, expectedIdentity: EXPECTED });
        expect(v.ok).toBe(false);
        expect(v.reason).toBe("session_expired");
    });

    it("an unreadable status cannot be accepted as a working session", () => {
        expect(refreshSatisfies({ state: SESSION_STATE.UNKNOWN, identity: EXPECTED, expectedIdentity: EXPECTED }).ok).toBe(false);
    });
});
