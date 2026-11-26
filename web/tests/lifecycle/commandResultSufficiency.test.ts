/**
 * Command-result sufficiency (R2) — the reusable spine for Contact Family and later
 * slices. Configuration, not code, decides whether an objective capability result
 * satisfies a Current Work requirement, and which authored outcome it maps to.
 *
 * Covers the sprint's semantic-separation and industry-agnosticism criteria at the
 * pure-logic layer (no DB): objective results are distinct from operator outcomes;
 * an unconfigured/failed result satisfies nothing; the same runtime serves a Legal
 * configuration with vocabulary-only differences.
 */
import { describe, it, expect } from "vitest";

import { normalizeCompletionPolicy } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import {
    resolveEffectiveSufficientCommandResultOutcome,
    resolveSufficientCommandResultOutcome,
} from "@/lib/lifecycle/stageWorkCompletionPolicy";
import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const tpl = (policy: unknown): Pick<StageWorkTemplateV1, "completion_policy"> => ({
    completion_policy: policy as StageWorkTemplateV1["completion_policy"],
});

// Childcare Contact Family config (mirrors defaultEnrollmentStageOperatingPlans).
const childcareContact = tpl({
    sufficient_command_results: [
        { capability: "communications_send", result: "sent", satisfies_outcome_key: "left_message" },
    ],
});

// Legal Contact Client config — SAME structure, vocabulary-only difference.
const legalContact = tpl({
    sufficient_command_results: [
        { capability: "communications_send", result: "sent", satisfies_outcome_key: "outreach_logged" },
    ],
});

describe("normalizeCompletionPolicy — sufficient_command_results parsing", () => {
    it("round-trips a valid entry", () => {
        const p = normalizeCompletionPolicy({
            sufficient_command_results: [
                { capability: "communications_send", result: "sent", satisfies_outcome_key: "left_message" },
            ],
        } as never);
        expect(p?.sufficient_command_results).toEqual([
            { capability: "communications_send", result: "sent", satisfies_outcome_key: "left_message" },
        ]);
    });

    it("drops entries missing any required field", () => {
        const p = normalizeCompletionPolicy({
            sufficient_command_results: [
                { capability: "communications_send", result: "sent" }, // no outcome
                { capability: "", result: "sent", satisfies_outcome_key: "x" }, // empty capability
                { capability: "communications_send", result: "delivered", satisfies_outcome_key: "confirmed" }, // valid
            ],
        } as never);
        expect(p?.sufficient_command_results).toEqual([
            { capability: "communications_send", result: "delivered", satisfies_outcome_key: "confirmed" },
        ]);
    });

    it("returns undefined when nothing valid is present", () => {
        expect(normalizeCompletionPolicy({ sufficient_command_results: [] } as never)).toBeUndefined();
        expect(normalizeCompletionPolicy({ sufficient_command_results: [{}] } as never)).toBeUndefined();
    });

    it("coexists with attempt-based policy fields", () => {
        const p = normalizeCompletionPolicy({
            min_attempts: 2,
            sufficient_command_results: [
                { capability: "communications_send", result: "sent", satisfies_outcome_key: "left_message" },
            ],
        } as never);
        expect(p?.min_attempts).toBe(2);
        expect(p?.sufficient_command_results).toHaveLength(1);
    });
});

describe("resolveSufficientCommandResultOutcome — config decides sufficiency", () => {
    it("maps a configured objective result to its authored outcome", () => {
        expect(resolveSufficientCommandResultOutcome(childcareContact, "communications_send", "sent"))
            .toBe("left_message");
    });

    it("returns null when configuration declares no sufficiency (unconfigured success does not complete)", () => {
        expect(resolveSufficientCommandResultOutcome(tpl(undefined), "communications_send", "sent")).toBeNull();
        expect(resolveSufficientCommandResultOutcome(tpl({}), "communications_send", "sent")).toBeNull();
    });

    it("a failed send cannot satisfy a requirement mapped only for a successful send", () => {
        // The capability publishes "failed"; only "sent" is mapped → no completion.
        expect(resolveSufficientCommandResultOutcome(childcareContact, "communications_send", "failed")).toBeNull();
    });

    it("does not match on a different capability", () => {
        expect(resolveSufficientCommandResultOutcome(childcareContact, "voice_call", "sent")).toBeNull();
    });

    it("objective results and operator outcomes occupy different spaces", () => {
        // An operator judgment ("reached_family") is not a capability result; it can
        // never resolve through the result-sufficiency path.
        expect(resolveSufficientCommandResultOutcome(childcareContact, "communications_send", "reached_family"))
            .toBeNull();
    });
});

describe("resolveEffectiveSufficientCommandResultOutcome — capability-scoped explicit → default → none", () => {
    it("uses platform default for canonical contact_family when sufficiency is absent", () => {
        const bare = {
            template_key: "contact_family",
            work_definition_key: "contact_family",
            completion_policy: { min_attempts: 3 },
        };
        expect(resolveEffectiveSufficientCommandResultOutcome(bare, "communications_send", "sent")).toBe(
            "left_message",
        );
        expect(resolveEffectiveSufficientCommandResultOutcome(bare, "communications_send", "failed")).toBeNull();
    });

    it("preserves no inference for unknown/custom work", () => {
        const custom = {
            template_key: "custom_outreach",
            work_definition_key: "custom_outreach",
            completion_policy: undefined,
        };
        expect(resolveEffectiveSufficientCommandResultOutcome(custom, "communications_send", "sent")).toBeNull();
    });

    it("explicit reply-required overrides the platform default for communications_send", () => {
        const replyRequired = {
            template_key: "contact_family",
            work_definition_key: "contact_family",
            completion_policy: {
                sufficient_command_results: [
                    { capability: "communications_send", result: "replied", satisfies_outcome_key: "reached_family" },
                ],
            },
        };
        expect(resolveEffectiveSufficientCommandResultOutcome(replyRequired, "communications_send", "sent")).toBeNull();
        expect(resolveEffectiveSufficientCommandResultOutcome(replyRequired, "communications_send", "replied")).toBe(
            "reached_family",
        );
    });

    it("partial explicit list (tour only) does not wipe platform communications_send default", () => {
        const tourOnly = {
            template_key: "contact_family",
            work_definition_key: "contact_family",
            completion_policy: {
                min_attempts: 3,
                window_days: 7,
                sufficient_command_results: [
                    {
                        capability: "schedule_tour",
                        result: "confirmed",
                        satisfies_outcome_key: "tour_scheduled",
                    },
                ],
            },
        };
        expect(resolveEffectiveSufficientCommandResultOutcome(tourOnly, "communications_send", "sent")).toBe(
            "left_message",
        );
        expect(resolveEffectiveSufficientCommandResultOutcome(tourOnly, "schedule_tour", "confirmed")).toBe(
            "tour_scheduled",
        );
        expect(resolveEffectiveSufficientCommandResultOutcome(tourOnly, "communications_send", "failed")).toBeNull();
    });
});

describe("industry-agnosticism — same runtime, configuration-only difference", () => {
    it("Legal Contact Client resolves through the identical code path with different vocabulary", () => {
        expect(resolveSufficientCommandResultOutcome(legalContact, "communications_send", "sent"))
            .toBe("outreach_logged");
    });

    it("childcare and legal share the resolver; only the mapped outcome differs", () => {
        const cc = resolveSufficientCommandResultOutcome(childcareContact, "communications_send", "sent");
        const lg = resolveSufficientCommandResultOutcome(legalContact, "communications_send", "sent");
        expect(cc).not.toBe(lg);
        expect([cc, lg]).toEqual(["left_message", "outreach_logged"]);
    });
});
