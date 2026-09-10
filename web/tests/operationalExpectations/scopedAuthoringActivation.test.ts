/**
 * Scoped activation of the Expectations authoring intake.
 *
 * `oe.ledger.author` is OFF by default and holds "Facts-only compatibility" for
 * every domain at once. Thread 4 needs to author, and flipping the env flag
 * globally would enable authoring for every consumer simultaneously — the exact
 * thing the flag exists to prevent, on a ledger that has never held a production
 * row.
 *
 * So a ratified PURPOSE opens one narrow door. These tests pin the two properties
 * that make that safe: generic authoring is still gated, and a tenant's opt-out
 * still wins.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isOeLedgerAuthorEnabledForOrg,
    isOeLedgerAuthorEnvEnabled,
} from "@/lib/operationalExpectations/intake/ledgerAuthoringFeatureFlag";
import {
    isActivatedAuthoringPurpose,
    ACTIVATED_AUTHORING_PURPOSES,
} from "@/lib/operationalExpectations/intake/activatedAuthoringPurposes";
import { ATTENDANCE_EXPECTATION_PURPOSE } from "@/lib/childcareOperational/attendance/serviceDayExpectations";

const ORG = "org-1";

/** org_settings stub; `metadata` null means no feature_flags recorded. */
function supa(metadata: Record<string, unknown> | null, fail = false): SupabaseClient {
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = () => api;
    api.maybeSingle = async () =>
        fail ? { data: null, error: { message: "boom" } } : { data: { metadata }, error: null };
    return { from: vi.fn(() => api) } as unknown as SupabaseClient;
}

const ORIGINAL = process.env.OE_LEDGER_AUTHOR_ENABLED;
beforeEach(() => {
    delete process.env.OE_LEDGER_AUTHOR_ENABLED;
});
afterEach(() => {
    if (ORIGINAL == null) delete process.env.OE_LEDGER_AUTHOR_ENABLED;
    else process.env.OE_LEDGER_AUTHOR_ENABLED = ORIGINAL;
});

describe("the env flag still governs generic authoring", () => {
    it("is off by default", () => {
        expect(isOeLedgerAuthorEnvEnabled()).toBe(false);
    });

    it("refuses authoring with no purpose while the flag is off", async () => {
        expect(await isOeLedgerAuthorEnabledForOrg(supa(null), ORG)).toBe(false);
    });

    it("refuses an unactivated purpose while the flag is off", async () => {
        // A caller cannot invent a purpose string to get through the door.
        expect(await isOeLedgerAuthorEnabledForOrg(supa(null), ORG, "something.invented")).toBe(false);
    });

    it("still allows generic authoring when the flag is deliberately on", async () => {
        process.env.OE_LEDGER_AUTHOR_ENABLED = "true";
        expect(await isOeLedgerAuthorEnabledForOrg(supa(null), ORG)).toBe(true);
    });
});

describe("an activated purpose opens one narrow door", () => {
    it("lets Attendance author with the flag still off", async () => {
        expect(await isOeLedgerAuthorEnabledForOrg(supa(null), ORG, ATTENDANCE_EXPECTATION_PURPOSE)).toBe(true);
    });

    it("opens only that door — other domains stay gated", async () => {
        const s = supa(null);
        expect(await isOeLedgerAuthorEnabledForOrg(s, ORG, ATTENDANCE_EXPECTATION_PURPOSE)).toBe(true);
        expect(await isOeLedgerAuthorEnabledForOrg(s, ORG)).toBe(false);
    });

    it("registers the attendance purpose as activated", () => {
        expect(isActivatedAuthoringPurpose(ATTENDANCE_EXPECTATION_PURPOSE)).toBe(true);
        // Thread 4 is the first and only consumer; a growing set is a review signal.
        expect(ACTIVATED_AUTHORING_PURPOSES.size).toBe(1);
    });
});

describe("a tenant's opt-out is not a door a purpose can walk through", () => {
    it("refuses an activated purpose when the org switched the ledger off", async () => {
        const optedOut = supa({ feature_flags: { "oe.ledger.author": false } });
        expect(await isOeLedgerAuthorEnabledForOrg(optedOut, ORG, ATTENDANCE_EXPECTATION_PURPOSE)).toBe(false);
    });

    it("honours the string and numeric spellings of the opt-out", async () => {
        for (const off of ["false", 0, "0"]) {
            const s = supa({ feature_flags: { "oe.ledger.author": off } });
            expect(await isOeLedgerAuthorEnabledForOrg(s, ORG, ATTENDANCE_EXPECTATION_PURPOSE)).toBe(false);
        }
    });
});

describe("a failed flag read never authorizes", () => {
    it("fails closed even for an activated purpose", async () => {
        // An unreadable setting is not an absent restriction.
        expect(await isOeLedgerAuthorEnabledForOrg(supa(null, true), ORG, ATTENDANCE_EXPECTATION_PURPOSE)).toBe(false);
    });
});
