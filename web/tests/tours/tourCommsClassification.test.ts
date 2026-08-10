/**
 * Every tour send is explicitly classified, and the classification is policy.
 *
 * `tourCommsOrchestrator` enqueued with no `category` and no `audience`, so every
 * tour message took the counted `canonicalOutboundEnqueue:unspecified` fallback.
 * That fallback exists as a bounded compatibility ramp — it is not a
 * classification, and category is not a label: `evaluateEligibility` reads it to
 * decide whether a recipient's opt-out and quiet hours apply at all.
 *
 * These tests pin two things: that no tour send relies on the fallback, and what
 * the chosen classification actually costs a parent. The second half is the
 * opted-out / suppressed coverage the sprint asked for — it exists so that
 * changing tour comms to `transactional` shows up here as a deliberate reversal
 * rather than passing silently.
 */
import { describe, expect, it } from "vitest";
import {
    TOUR_COMMS_CLASSIFICATION,
    TOUR_COMMS_CALL_SITE,
    classifyTourComms,
} from "@/lib/tours/comms/tourCommsClassification";
import { TOUR_COMMS_EVENT_KEYS } from "@/lib/tours/comms/tourCommsConfig";
import { evaluateEligibility } from "@/lib/communications/eligibility/evaluateEligibility";
import type { EligibilityInput } from "@/lib/communications/eligibility/types";
import { findPurpose } from "@/lib/communications/purpose/purposeRegistry";

describe("tour comms classification", () => {
    it("classifies every tour event kind", () => {
        // Total by construction, asserted so a new notification kind forces a
        // decision instead of inheriting one.
        const unclassified = TOUR_COMMS_EVENT_KEYS.filter((key) => TOUR_COMMS_CLASSIFICATION[key] == null);
        expect(unclassified).toEqual([]);
    });

    it("declares no classification the eligibility gate would reject outright", () => {
        for (const key of TOUR_COMMS_EVENT_KEYS) {
            const { audience, category } = classifyTourComms(key);
            const decision = evaluateEligibility(baseInput({ audience, category }));
            expect(decision.code, `${key} must not be structurally invalid`).not.toBe("CATEGORY_INVALID");
            expect(decision.code, `${key} must not be structurally invalid`).not.toBe("AUDIENCE_INVALID");
            expect(decision.code, `${key} must not be unclassified`).not.toBe("CATEGORY_MISSING");
        }
    });

    it("attributes the enqueue to this orchestrator", () => {
        // A fallback that cannot name its caller cannot be migrated away.
        expect(TOUR_COMMS_CALL_SITE).toBe("tours.comms_orchestrator");
    });
});

function baseInput(over: Partial<EligibilityInput> = {}): EligibilityInput {
    return {
        audience: "external",
        category: "operational",
        channel: "email",
        recipientPersonId: "person-1",
        suppressed: false,
        channelUsable: true,
        preferenceState: "unset",
        ...over,
    } as EligibilityInput;
}

// --- what the chosen classification costs a parent --------------------------

describe("tour comms honour recipient state under the current classification", () => {
    it("does NOT reach a parent who opted out", () => {
        // True only because tour comms are `operational`. `transactional` is
        // opt-out exempt, so this assertion is the tripwire for that change.
        const { category } = classifyTourComms("tour_invitation");
        const decision = evaluateEligibility(baseInput({ category, preferenceState: "opted_out" }));

        expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("OPTED_OUT");
    });

    it("does NOT reach a suppressed address", () => {
        // Suppression binds every category except emergency, so this holds
        // whatever the classification becomes.
        const { category } = classifyTourComms("tour_invitation");
        const decision = evaluateEligibility(baseInput({ category, suppressed: true }));

        expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("SUPPRESSED");
    });

    it("does NOT send inside the recipient's quiet hours", () => {
        const { category } = classifyTourComms("tour_confirmation");
        const decision = evaluateEligibility(
            baseInput({
                category,
                quietHours: { timezone: "America/Los_Angeles", start: "21:00", end: "08:00" },
                nowIso: "2026-08-10T06:00:00.000Z", // 23:00 local — inside the window
            })
        );

        expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("QUIET_HOURS");
    });

    it("still refuses an unresolved recipient", () => {
        const { category } = classifyTourComms("tour_invitation");
        const decision = evaluateEligibility(baseInput({ category, recipientPersonId: null }));

        expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("RECIPIENT_UNRESOLVED");
    });

    it("sends when nothing blocks", () => {
        const { audience, category } = classifyTourComms("tour_invitation");
        expect(evaluateEligibility(baseInput({ audience, category })).allowed).toBe(true);
    });
});

// --- the unresolved conflict, held visible ----------------------------------

describe("the tour_coordination purpose still contradicts this classification", () => {
    it("names this call site while declaring a category we do not send", () => {
        // Documented, not silently reconciled: resolving it means deciding whether
        // a tour invitation may override a parent's opt-out. Until that decision,
        // the orchestrator passes NO purpose — validatePurpose would reject every
        // tour send the moment purpose validation reaches this path.
        const purpose = findPurpose("tour_coordination");

        expect(purpose?.source).toBe("tours.comms_orchestrator");
        expect(purpose?.categories).toEqual(["transactional"]);
        expect(purpose?.allowsExternalOperational).toBe(false);
        expect(classifyTourComms("tour_invitation").category).toBe("operational");
    });
});
