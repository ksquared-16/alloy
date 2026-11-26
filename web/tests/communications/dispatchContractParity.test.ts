/**
 * Phase 0 commit 4 — dispatch contract parity (TypeScript side).
 *
 * The Python dispatcher revalidates live state against the snapshot this
 * runtime writes. Both load contracts/communications/dispatch-decisions.json.
 * This test drives the real TypeScript implementations through the contract, so
 * a change on either side that is not reflected in the contract fails the build.
 *
 * Mirror test: backend/tests/test_dispatch_eligibility.py::TestCrossRuntimeParity
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

import { preferenceCategoryFor } from "@/lib/communications/eligibility/loadEligibilityContext";
import { evaluateEligibility } from "@/lib/communications/eligibility/evaluateEligibility";
import {
    ELIGIBILITY_SNAPSHOT_VERSION,
    type MessageCategory,
    type MessageChannel,
} from "@/lib/communications/eligibility/types";

type Contract = {
    version: string;
    snapshot_schema_versions_supported: number[];
    snapshot_required_fields: string[];
    outcomes: string[];
    lifecycle_states: Record<string, string>;
    block_reasons: string[];
    defer_reasons: string[];
    preference_mapping: Record<string, Record<string, string | null>>;
    opt_out_exempt_categories: string[];
    quiet_hours_exempt_categories: string[];
    suppression_exempt_categories: string[];
    suppressing_delivery_events: string[];
};

const contract: Contract = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../contracts/communications/dispatch-decisions.json"), "utf8")
);

describe("dispatch contract parity — preference mapping", () => {
    it("maps every (category, channel) pair exactly as the contract declares", () => {
        for (const [category, perChannel] of Object.entries(contract.preference_mapping)) {
            for (const [channel, expected] of Object.entries(perChannel)) {
                expect(
                    preferenceCategoryFor(category as MessageCategory, channel as MessageChannel),
                    `${category}/${channel}`
                ).toBe(expected);
            }
        }
    });
});

describe("dispatch contract parity — snapshot schema", () => {
    it("emits a snapshot version the dispatcher supports", () => {
        expect(contract.snapshot_schema_versions_supported).toContain(ELIGIBILITY_SNAPSHOT_VERSION);
    });

    it("declares every field the dispatcher requires", () => {
        const typesSrc = readFileSync(
            path.resolve(__dirname, "../../lib/communications/eligibility/types.ts"),
            "utf8"
        );
        for (const field of contract.snapshot_required_fields) {
            expect(typesSrc, `${field} missing from EligibilitySnapshot`).toContain(field);
        }
    });
});

describe("dispatch contract parity — category policy", () => {
    const base = {
        audience: "external" as const,
        channel: "sms" as MessageChannel,
        recipientPersonId: "11111111-0000-4000-8000-000000000001",
        channelUsable: true,
    };

    it("agrees on which categories an opt-out cannot suppress", () => {
        for (const category of ["transactional", "operational", "marketing", "emergency"] as MessageCategory[]) {
            const decision = evaluateEligibility({
                ...base,
                category,
                preferenceState: "opted_out",
                emergencyPermitted: true,
            });
            const exempt = contract.opt_out_exempt_categories.includes(category);
            expect(decision.allowed, `${category} opt-out exemption`).toBe(exempt);
        }
    });

    it("agrees on which categories quiet hours cannot suppress", () => {
        const quiet = {
            start: "21:00",
            end: "08:00",
            timezone: "America/Los_Angeles",
            basis: "location" as const,
        };
        const insideQuiet = "2026-08-02T06:30:00.000Z";

        for (const category of ["transactional", "operational", "marketing", "emergency"] as MessageCategory[]) {
            const decision = evaluateEligibility({
                ...base,
                category,
                preferenceState: category === "marketing" ? "opted_in" : "unset",
                quietHours: quiet,
                nowIso: insideQuiet,
                emergencyPermitted: true,
            });
            const exempt = contract.quiet_hours_exempt_categories.includes(category);
            if (exempt) {
                expect(decision.allowed, `${category} must be quiet-hours exempt`).toBe(true);
            } else {
                expect(decision.code, `${category} must be quiet-hours suppressed`).toBe("QUIET_HOURS");
            }
        }
    });

    it("agrees on which categories suppression cannot block", () => {
        for (const category of ["transactional", "operational", "marketing", "emergency"] as MessageCategory[]) {
            const decision = evaluateEligibility({
                ...base,
                category,
                preferenceState: category === "marketing" ? "opted_in" : "unset",
                suppressed: true,
                emergencyPermitted: true,
            });
            const exempt = contract.suppression_exempt_categories.includes(category);
            expect(decision.allowed, `${category} suppression exemption`).toBe(exempt);
        }
    });
});

describe("dispatch contract parity — reasons and lifecycle", () => {
    it("every enqueue-gate block code is a known dispatch block reason", () => {
        // The two layers must speak one vocabulary, so an operator sees the same
        // reason whether a send was refused at enqueue or at dispatch.
        const codes = [
            "CATEGORY_MISSING",
            "CATEGORY_INVALID",
            "AUDIENCE_INVALID",
            "RECIPIENT_UNRESOLVED",
            "OPTED_OUT",
            "MARKETING_REQUIRES_OPT_IN",
            "SUPPRESSED",
            "INTERNAL_TO_PROVIDER",
        ];
        for (const code of codes) {
            expect(contract.block_reasons, code).toContain(code);
        }
    });

    it("distinguishes a policy outcome from a provider failure", () => {
        expect(contract.lifecycle_states).toHaveProperty("blocked");
        expect(contract.lifecycle_states).toHaveProperty("deferred");
        expect(contract.lifecycle_states.failed).toMatch(/TRANSPORT/);
    });

    it("declares exactly three dispatch outcomes", () => {
        expect(contract.outcomes.sort()).toEqual(["blocked", "defer_until", "send_now"]);
    });

    it("suppresses only on hard bounce and complaint", () => {
        // A transient delivery failure is a retry concern, not a consent concern.
        expect(contract.suppressing_delivery_events.sort()).toEqual(["bounced", "complaint"]);
    });
});
