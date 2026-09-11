/**
 * ENTERING AN OPERATIONAL STAGE CREATES THE WORK THAT STAGE ACTUALLY EXPECTS.
 *
 * Waitlist had stage membership, configured work templates and configured outcomes, yet every
 * subject projected its templates as `planned` with no work row — so `requires_outcome_picker` was
 * false and `Record outcome` correctly did not appear. The question these tests answer is WHERE that
 * breaks: in the entry seam, or in the data that predates it.
 *
 * The answer is the data. `resolveEffectivePrimaryWorkTemplate` — the selector every stage-entry
 * spawn path funnels through — resolves an entry template for the Waitlist plan, so a subject
 * entering Waitlist TODAY through `move_to_stage` (which calls
 * `reconcileBusinessProcessWorkAcrossStageMove`) gets work. The 17 subjects sitting in Waitlist on
 * the deployed tenant arrived before that seam existed, or by a path that did not run it.
 *
 * These lock the selector's behaviour for the Waitlist shape so a future edit cannot quietly return
 * to spawning nothing.
 */
import { describe, expect, it } from "vitest";

import { resolveEffectivePrimaryWorkTemplate } from "@/lib/lifecycle/stageOperatingPlanConvergence";
import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** The Waitlist shape: two optional templates, the first marked primary. */
const WAITLIST_TEMPLATES: StageWorkTemplateV1[] = [
    {
        template_key: "review_waitlist_position",
        label: "Review waitlist position",
        required: false,
        primary: true,
        due_policy: { kind: "offset_days", days: 3 },
        owner_strategy: "record_owner",
    } as StageWorkTemplateV1,
    {
        template_key: "offer_spot",
        label: "Offer spot",
        required: false,
        due_policy: { kind: "offset_days", days: 1 },
        owner_strategy: "record_owner",
    } as StageWorkTemplateV1,
];

describe("Waitlist entry resolves an entry work template", () => {
    it("selects the primary template, so entry spawns Review waitlist position", () => {
        const picked = resolveEffectivePrimaryWorkTemplate({ work_templates: WAITLIST_TEMPLATES });
        expect(picked?.template_key).toBe("review_waitlist_position");
    });

    it("spawns ONE template on entry, not every configured template", () => {
        // Sequencing is not invented here: the entry seam opens the effective primary only. Offer
        // spot is therefore NOT an entry work item — it has to arrive some other way, which is a
        // configuration question and deliberately not answered by widening this selector.
        const picked = resolveEffectivePrimaryWorkTemplate({ work_templates: WAITLIST_TEMPLATES });
        expect(picked?.template_key).not.toBe("offer_spot");
    });

    it("still resolves an entry template when nothing is marked primary or required", () => {
        // The Waitlist defaults ship BOTH templates optional and unmarked. Falling through to the
        // first template is what stops an all-optional stage from being silently workless — the
        // exact shape that would otherwise strand a subject with no way to act.
        const allOptional = WAITLIST_TEMPLATES.map((t) => ({ ...t, primary: false, required: false }));
        const picked = resolveEffectivePrimaryWorkTemplate({ work_templates: allOptional });
        expect(picked?.template_key).toBe("review_waitlist_position");
    });

    it("prefers an explicit primary over a required template", () => {
        const mixed = [
            { ...WAITLIST_TEMPLATES[1]!, required: true },
            { ...WAITLIST_TEMPLATES[0]!, primary: true },
        ];
        expect(resolveEffectivePrimaryWorkTemplate({ work_templates: mixed })?.template_key).toBe(
            "review_waitlist_position",
        );
    });

    it("a genuinely workless stage resolves nothing rather than inventing work", () => {
        expect(resolveEffectivePrimaryWorkTemplate({ work_templates: [] })).toBeNull();
    });
});
