/**
 * BILLING PREVIEW MOUNTS AT COMMIT — because nothing it needs comes from settlement.
 *
 * Measured: billing_preview (DOM name `assignment_tuition`) was the completion-setting card, and its
 * finality tracked drawer settlement exactly. Source then showed why that was accidental:
 * AssignmentTuitionCard reads only `context.subject.type` and `context.subject.id` and issues its own
 * `loadFinancialConfig(opportunityId)`. It consumes no children, entity, shell, scheduling or
 * activity output — BILLING_PREVIEW_REQUIRED_PHASES is empty. It waited solely because it was absent
 * from MOUNTABLE_CARD_SPECS and therefore ENRICHED_ONLY.
 *
 * These gates hold the repair to identity-only, and hold the grain narrowing that keeps an
 * unloadable card from mounting.
 */
import { describe, expect, it } from "vitest";

import {
    MOUNTABLE_CARD_SPECS,
    PARTICIPANT_IDENTITY_TRUTH_KEYS,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const spec = () => MOUNTABLE_CARD_SPECS.find((s) => s.key === "billing_preview");
const ctx = (truth: Record<string, unknown>, subject?: Record<string, unknown>) =>
    ({ truth, ...(subject ? { subject } : {}) }) as unknown as OperationalContext;

describe("billing_preview is commit-mountable (defect A)", () => {
    it("is declared in the one existing mountability registry", () => {
        expect(spec(), "billing_preview must be admitted to MOUNTABLE_CARD_SPECS").toBeDefined();
    });

    it("mounts on the subject id alone", () => {
        expect(spec()!.identityKnowable(ctx({ id: "opp-1" }))).toBe(true);
        expect(spec()!.identityKnowable(ctx({ id: "opp-1" }, { type: "opportunity", id: "opp-1" }))).toBe(true);
    });

    it("stays reserved when the subject id is absent or blank (defect G)", () => {
        for (const t of [{}, { id: "" }, { id: "   " }]) {
            expect(spec()!.identityKnowable(ctx(t)), "no id, no mount").toBe(false);
        }
    });
});

describe("identity only — no borrowed requirements (defect B)", () => {
    it("does not require participant, household or any other identity", () => {
        expect(spec()!.identityTruthKeys).toEqual(["id"]);
        expect(spec()!.identityTruthKeys).not.toContain(PARTICIPANT_IDENTITY_TRUTH_KEYS[0]);
        expect(spec()!.identityTruthKeys).not.toContain("customer.id");
        // The subject id alone admits, with no participant identity anywhere in truth.
        expect(spec()!.identityKnowable(ctx({ id: "opp-1" }))).toBe(true);
    });

    it("does not claim commit-critical CONTENT (defect C)", () => {
        // Mountable means "identity is known"; ready would mean "content is known". Billing content
        // is the ledger's answer and can never be commit-knowable.
        expect(COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === "billing_preview")).toBeUndefined();
    });
});

describe("the grain narrowing keeps an unloadable card from mounting (defect H)", () => {
    it("refuses a non-opportunity subject", () => {
        // The card resolves opportunityId only for an opportunity subject; on any other grain it
        // holds null, never requests, and falls through to "No assignment on this record to price."
        // Mounting it there would make that authoritative-sounding empty its first frame.
        for (const type of ["customer_member", "person", "staff"]) {
            expect(
                spec()!.identityKnowable(ctx({ id: "child-1" }, { type, id: "child-1" })),
                `${type} must not mount billing_preview`,
            ).toBe(false);
        }
    });

    it("admits a subject-less context, which is the registry guard's own fixture shape", () => {
        expect(spec()!.identityKnowable(ctx({ id: "opp-1" }))).toBe(true);
    });
});

describe("no settlement prerequisite remains (defect F)", () => {
    it("the predicate reads nothing produced by the drawer VM", () => {
        // Settled-only truth must neither help nor be required.
        const settledOnly = ctx({ _inquiry_children: [{ id: "c1" }], _household_children: [{ id: "c1" }] });
        expect(spec()!.identityKnowable(settledOnly), "settled truth alone must not admit").toBe(false);
        // …and the subject id admits WITHOUT any settled truth present.
        expect(spec()!.identityKnowable(ctx({ id: "opp-1" })), "no settled truth needed").toBe(true);
    });
});
