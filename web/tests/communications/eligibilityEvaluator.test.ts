/**
 * Phase 0 / P0-1 — canonical eligibility evaluator.
 *
 * The matrix required by the Phase 0 contract: category × channel × preference
 * state × audience × quiet hours, plus every fail-closed path.
 *
 * The four bypasses that made the PREVIOUS gate inert are each pinned by a
 * named test, so none can silently return.
 */
import { describe, expect, it } from "vitest";

import {
    evaluateEligibility,
    isWithinQuietHours,
    ELIGIBILITY_POLICY_VERSION,
} from "@/lib/communications/eligibility/evaluateEligibility";
import {
    MESSAGE_CATEGORIES,
    type EligibilityInput,
    type MessageCategory,
    type QuietHoursWindow,
} from "@/lib/communications/eligibility/types";

const PERSON = "11111111-0000-4000-8000-000000000001";

const QUIET: QuietHoursWindow = {
    start: "21:00",
    end: "08:00",
    timezone: "America/Los_Angeles",
    basis: "location",
};

/** 2026-08-01 23:30 America/Los_Angeles — inside a 21:00–08:00 window. */
const INSIDE_QUIET = "2026-08-02T06:30:00.000Z";
/** 2026-08-01 12:00 America/Los_Angeles — outside. */
const OUTSIDE_QUIET = "2026-08-01T19:00:00.000Z";

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
    return {
        audience: "external",
        category: "operational",
        channel: "email",
        recipientPersonId: PERSON,
        preferenceState: "unset",
        channelUsable: true,
        ...over,
    };
}

describe("eligibility — structural validity (fail closed)", () => {
    it("blocks a message with no category", () => {
        const d = evaluateEligibility(input({ category: undefined as unknown as MessageCategory }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("CATEGORY_MISSING");
    });

    it("blocks an unknown category", () => {
        const d = evaluateEligibility(input({ category: "promotional" as MessageCategory }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("CATEGORY_INVALID");
    });

    it("blocks an unknown audience", () => {
        const d = evaluateEligibility(input({ audience: "everyone" as never }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("AUDIENCE_INVALID");
    });
});

describe("eligibility — the four bypasses that made the previous gate inert", () => {
    it("BYPASS 1 — no feature flag can disable it: the function is unconditional", () => {
        // The old gate lived behind comms_v2_compliance, which defaulted OFF.
        // This evaluator takes no flag and reads no environment.
        const d = evaluateEligibility(input({ preferenceState: "opted_out" }));
        expect(d.allowed).toBe(false);
    });

    it("BYPASS 2 — an unresolved recipient blocks instead of skipping the gate", () => {
        // Previously: a free-text `to` with no recipient_person_id skipped the
        // consent check entirely, which made /send a complete bypass.
        const d = evaluateEligibility(input({ recipientPersonId: null, preferenceState: "opted_out" }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("RECIPIENT_UNRESOLVED");
    });

    it("BYPASS 3 — in_app is evaluated, not skipped", () => {
        const d = evaluateEligibility(input({ channel: "in_app", audience: "internal" }));
        expect(d.allowed).toBe(true);

        const external = evaluateEligibility(input({ channel: "in_app", preferenceState: "opted_out" }));
        expect(external.allowed).toBe(false);
        expect(external.code).toBe("OPTED_OUT");
    });

    it("BYPASS 4 — category is required input, never derived from the channel", () => {
        // Previously the category was defaulted from the channel, making every
        // send transactional-and-allowed. An opted-out operational send must block.
        const d = evaluateEligibility(input({ category: "operational", preferenceState: "opted_out" }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("OPTED_OUT");
    });
});

describe("eligibility — category × preference state", () => {
    const cases: Array<{
        category: MessageCategory;
        state: "opted_in" | "opted_out" | "unset";
        allowed: boolean;
    }> = [
        { category: "transactional", state: "opted_out", allowed: true },
        { category: "transactional", state: "unset", allowed: true },
        { category: "operational", state: "opted_out", allowed: false },
        { category: "operational", state: "unset", allowed: true },
        { category: "operational", state: "opted_in", allowed: true },
        { category: "marketing", state: "opted_in", allowed: true },
        { category: "marketing", state: "unset", allowed: false },
        { category: "marketing", state: "opted_out", allowed: false },
    ];

    for (const c of cases) {
        it(`${c.category} + ${c.state} → ${c.allowed ? "allowed" : "blocked"}`, () => {
            const d = evaluateEligibility(input({ category: c.category, preferenceState: c.state }));
            expect(d.allowed).toBe(c.allowed);
        });
    }

    it("emergency overrides an explicit opt-out when permitted", () => {
        const d = evaluateEligibility(
            input({ category: "emergency", preferenceState: "opted_out", emergencyPermitted: true })
        );
        expect(d.allowed).toBe(true);
    });
});

describe("eligibility — emergency is permissioned, not a convenience bypass", () => {
    it("blocks emergency without the permission", () => {
        const d = evaluateEligibility(input({ category: "emergency", emergencyPermitted: false }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("EMERGENCY_NOT_PERMITTED");
    });

    it("blocks emergency when the permission flag is simply absent", () => {
        const d = evaluateEligibility(input({ category: "emergency" }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("EMERGENCY_NOT_PERMITTED");
    });
});

describe("eligibility — audience", () => {
    it("internal never evaluates recipient consent", () => {
        const d = evaluateEligibility(
            input({ audience: "internal", channel: "in_app", preferenceState: "opted_out", recipientPersonId: null })
        );
        expect(d.allowed).toBe(true);
    });

    it("internal may never use a provider channel", () => {
        for (const channel of ["email", "sms"] as const) {
            const d = evaluateEligibility(input({ audience: "internal", channel }));
            expect(d.allowed).toBe(false);
            expect(d.code).toBe("INTERNAL_TO_PROVIDER");
        }
    });
});

describe("eligibility — suppression and channel usability", () => {
    it("blocks a suppressed recipient", () => {
        const d = evaluateEligibility(input({ suppressed: true }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("SUPPRESSED");
    });

    it("emergency overrides suppression", () => {
        const d = evaluateEligibility(input({ category: "emergency", suppressed: true, emergencyPermitted: true }));
        expect(d.allowed).toBe(true);
    });

    it("blocks an unusable channel for EVERY category, including transactional and emergency", () => {
        for (const category of MESSAGE_CATEGORIES) {
            const d = evaluateEligibility(input({ category, channelUsable: false, emergencyPermitted: true }));
            expect(d.allowed, `${category} should block on an unusable channel`).toBe(false);
            expect(d.code).toBe("CHANNEL_UNAVAILABLE");
        }
    });
});

describe("eligibility — quiet hours", () => {
    it("suppresses operational inside the window", () => {
        const d = evaluateEligibility(input({ category: "operational", quietHours: QUIET, nowIso: INSIDE_QUIET }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("QUIET_HOURS");
    });

    it("permits operational outside the window", () => {
        const d = evaluateEligibility(input({ category: "operational", quietHours: QUIET, nowIso: OUTSIDE_QUIET }));
        expect(d.allowed).toBe(true);
    });

    it("exempts transactional and emergency", () => {
        for (const category of ["transactional", "emergency"] as const) {
            const d = evaluateEligibility(
                input({ category, quietHours: QUIET, nowIso: INSIDE_QUIET, emergencyPermitted: true })
            );
            expect(d.allowed, `${category} must not be suppressed by quiet hours`).toBe(true);
        }
    });

    it("fails closed when the window cannot be evaluated", () => {
        const bad: QuietHoursWindow = { ...QUIET, timezone: "Not/AZone" };
        const d = evaluateEligibility(input({ quietHours: bad, nowIso: INSIDE_QUIET }));
        expect(d.allowed).toBe(false);
        expect(d.code).toBe("QUIET_HOURS");
    });

    it("handles overnight windows correctly", () => {
        expect(isWithinQuietHours(QUIET, INSIDE_QUIET)).toBe(true);
        expect(isWithinQuietHours(QUIET, OUTSIDE_QUIET)).toBe(false);
    });

    it("treats a zero-length window as suppressing nothing", () => {
        expect(isWithinQuietHours({ ...QUIET, start: "09:00", end: "09:00" }, INSIDE_QUIET)).toBe(false);
    });
});

describe("eligibility — policy version", () => {
    it("is recorded so a snapshot can be interpreted later", () => {
        expect(ELIGIBILITY_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    });
});
