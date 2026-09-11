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
import { resolveWorkDefinitionKeyFromTemplate } from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
import { resolveBusinessProcessSemanticWorkKey } from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";
import {
    getPlatformWorkDefinition,
    PLATFORM_DEFAULT_WORK_DEFINITION_STAGE_BINDINGS,
} from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { resolveDestinationStageEntryTemplates } from "@/lib/lifecycle/spawnDestinationStageEntryWork";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    buildEnrollmentTemplateStageRecords,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";

/** The department metadata the platform's own Enrollment template produces. */
function enrollmentDepartmentMetadata(): Record<string, unknown> {
    const process: LifecycleBuilderProcessRecord = {
        id: "proc-1",
        key: "enrollment",
        name: "Enrollment",
        primary_entity: "opportunity",
        is_active: true,
        sort_order: 0,
        tracks_v1: ENROLLMENT_DEFAULT_TRACKS,
        stages: buildEnrollmentTemplateStageRecords(),
    };
    return {
        lifecycle_builder_v1: { version: 1 as const, active_process_id: "proc-1", processes: [process] },
    };
}

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

    /**
     * THE SHIPPED PLAN, NOT THE FIXTURE.
     *
     * The fixture above marks `review_waitlist_position` primary; the plan the platform actually
     * ships marks NEITHER template primary or required, so the right answer there depends entirely
     * on the order-fallback. Asserting against the fixture alone would keep passing if the shipped
     * plan's template order were ever reversed — and that reversal would make entering Waitlist open
     * `offer_spot` automatically, which is the one thing the offer flow must not do.
     */
    it("resolves review_waitlist_position from the SHIPPED Waitlist plan, and never offer_spot", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("waitlist");
        expect(plan).toBeTruthy();
        expect(plan!.work_templates.map((t) => t.template_key)).toContain("offer_spot");

        const entry = resolveDestinationStageEntryTemplates({
            departmentMetadata: enrollmentDepartmentMetadata(),
            destinationStageKey: "waitlist",
        });
        // Exactly ONE entry template, and it is the review — offer spot stays operator-initiated.
        expect(entry.templates.map((t) => t.template_key)).toEqual(["review_waitlist_position"]);
    });
});

/**
 * TWO OPERATOR INTENTS CANNOT SHARE ONE WORK IDENTITY.
 *
 * Business Process work identity is `(work definition, subject)` — the catalog says so outright:
 * `dedupe_policy: "definition_subject"`, and `findOpenBusinessProcessWorkBySemanticIdentity`
 * resolves a row's semantic key as `workDefinitionKey ?? templateKey`.
 *
 * `offer_spot` used to bind to `contact_family`, which `review_waitlist_position` also binds to. So
 * with the review work open — which stage entry always creates — starting an offer would resolve to
 * the SAME semantic key on the SAME opportunity and return `deduped`, handing the operator the
 * review item back. The Process Card would still read "Review waitlist position" and the offer
 * outcomes would never be reachable. Silent, and indistinguishable from "nothing happened".
 */
describe("offer_spot is its own work identity", () => {
    it("does not share a work definition with the review work beside it", () => {
        const review = resolveWorkDefinitionKeyFromTemplate({
            template_key: "review_waitlist_position",
            work_definition_key: null,
        });
        const offer = resolveWorkDefinitionKeyFromTemplate({
            template_key: "offer_spot",
            work_definition_key: null,
        });
        expect(review.ok).toBe(true);
        expect(offer.ok).toBe(true);
        if (!review.ok || !offer.ok) return;
        expect(offer.work_definition_key).not.toBe(review.work_definition_key);
    });

    it("resolves distinct semantic work keys, which is what dedupe compares", () => {
        const keyFor = (templateKey: string) => {
            const resolved = resolveWorkDefinitionKeyFromTemplate({
                template_key: templateKey,
                work_definition_key: null,
            });
            return resolveBusinessProcessSemanticWorkKey({
                workDefinitionKey: resolved.ok ? resolved.work_definition_key : null,
                templateKey,
            });
        };
        expect(keyFor("offer_spot")).not.toBe(keyFor("review_waitlist_position"));
    });

    it("offer_spot is a real catalog definition, not an invented key", () => {
        // An unresolved template fails validation at save and rejects at runtime spawn, so a
        // dangling binding would surface as "cannot start offer" rather than anything explanatory.
        const definition = getPlatformWorkDefinition("offer_spot");
        expect(definition).toBeTruthy();
        expect(definition?.display_name).toBe("Offer spot");
        expect(definition?.dedupe_policy).toBe("definition_subject");
    });

    it("the Waitlist stage admits it", () => {
        const binding = PLATFORM_DEFAULT_WORK_DEFINITION_STAGE_BINDINGS.waitlist;
        expect(binding?.available_definition_keys).toContain("offer_spot");
        // The review work still resolves there too.
        expect(binding?.available_definition_keys).toContain("contact_family");
    });
});
