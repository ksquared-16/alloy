/**
 * IF THE EXECUTION RUNTIME SUPPORTS A CHILD-GRAIN OUTCOME, SETTINGS MUST BE ABLE TO AUTHOR IT.
 *
 * `update_child_enrollment_status` and `update_candidate_status` are executed by
 * `stageOutcomeRuleTargetExecutor` and authored by the platform's own default Waitlist plan, but the
 * Settings writer modelled neither. The runtime was more capable than the configuration product, and
 * the stage that needed those consequences — Waitlist, journey_segment `child` — could not express
 * them. It sat at "2 work items · 0 outcomes · 0 ways out" on the deployed tenant, which the config
 * UI itself flagged as "no ways out".
 *
 * The other half of the defect was placement: `StagePerChildPathsEditor` CAN emit a child status
 * target, but `StageEditorV2` renders it only for `grain === "family"` — correctly, since per-child
 * paths exist to split a family stage into child tracks. A stage that is already child-grain has
 * nothing to split, so the composable outcome editor is the right owner.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveOutcomeStatusOptions } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import {
    candidateStatusOperatorLabel,
    OUTCOME_CANDIDATE_STATUS_VALUES,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import { ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const BEHAVIOR_EDITOR = "components/adminV2/settings/lifecycle/LifecycleStageOutcomeBehaviorEditor.tsx";
const DEFINITIONS_EDITOR = "components/adminV2/settings/lifecycle/LifecycleStageOutcomeDefinitionsEditor.tsx";

/** Two domains, deliberately distinct: the family case track and the child enrollment track. */
const CONFIGURED: OutcomeStatusConfiguredRow[] = [
    { entity_type: "opportunities", status_key: "open", status_label: "Open" } as OutcomeStatusConfiguredRow,
    { entity_type: "opportunities", status_key: "closed", status_label: "Closed" } as OutcomeStatusConfiguredRow,
    {
        entity_type: "opportunity_customer_members",
        status_key: "enrolling",
        status_label: "Enrolling",
    } as OutcomeStatusConfiguredRow,
    {
        entity_type: "opportunity_customer_members",
        status_key: "waitlisted",
        status_label: "Waitlisted",
    } as OutcomeStatusConfiguredRow,
];

describe("child status options come from the child's own domain", () => {
    it("resolves child enrollment statuses, not case statuses", () => {
        const options = resolveOutcomeStatusOptions({
            configuredStatuses: CONFIGURED,
            purpose: "status_effect",
            entityType: "opportunity_customer_members",
        }).options;
        const keys = options.map((o) => o.status_key);
        expect(keys).toContain("enrolling");
        expect(keys).toContain("waitlisted");
    });

    it("a family status cannot leak into the child picker", () => {
        const options = resolveOutcomeStatusOptions({
            configuredStatuses: CONFIGURED,
            purpose: "status_effect",
            entityType: "opportunity_customer_members",
        }).options;
        const keys = options.map((o) => o.status_key);
        // `open`/`closed` belong to `opportunities`. An outcome on ONE child must never be able to
        // write the family's case state by picking the wrong entry from a merged list.
        expect(keys).not.toContain("open");
        expect(keys).not.toContain("closed");
    });

    it("uses status_effect, not close_record — enrolling is a state change, not a closure", () => {
        // `close_record` filters to terminal statuses. Resolving the child picker that way would
        // hide `enrolling`, which is precisely the option Waitlist needs.
        const asClose = resolveOutcomeStatusOptions({
            configuredStatuses: CONFIGURED,
            purpose: "close_record",
            entityType: "opportunity_customer_members",
        }).options.map((o) => o.status_key);
        const asEffect = resolveOutcomeStatusOptions({
            configuredStatuses: CONFIGURED,
            purpose: "status_effect",
            entityType: "opportunity_customer_members",
        }).options.map((o) => o.status_key);
        expect(asEffect).toContain("enrolling");
        expect(asEffect.length).toBeGreaterThanOrEqual(asClose.length);
    });

    it("the definitions editor resolves the child catalog against the child entity type", () => {
        const src = read(DEFINITIONS_EDITOR);
        expect(src).toContain("childEnrollmentStatusOptions");
        expect(src).toMatch(/entityType:\s*"opportunity_customer_members"/);
        expect(src).toMatch(/purpose:\s*"status_effect"/);
    });
});

describe("candidate status uses the code-owned vocabulary", () => {
    it("offers exactly the closed union the plan parser accepts", () => {
        // `StageOutcomeRuleTargetV1.candidate_status` is a closed union. Offering anything else
        // would offer a choice that cannot be saved.
        expect([...OUTCOME_CANDIDATE_STATUS_VALUES]).toEqual(["active", "paused", "withdrawn", "placed"]);
    });

    it("renders operator labels, never raw keys", () => {
        for (const value of OUTCOME_CANDIDATE_STATUS_VALUES) {
            const label = candidateStatusOperatorLabel(value);
            expect(label).not.toBe(value);
            expect(label[0]).toBe(label[0]?.toUpperCase());
        }
        expect(candidateStatusOperatorLabel("paused")).toBe("Paused");
    });
});

describe("consequence controls follow the stage's grain", () => {
    it("child consequences render only for a child-grain stage", () => {
        const src = read(BEHAVIOR_EDITOR);
        expect(src).toContain('stageGrain === "child"');
        expect(src).toContain("stage-outcome-child-status-");
        expect(src).toContain("stage-outcome-candidate-status-");
    });

    it("the grain is supplied by the stage's own journey segment", () => {
        const src = read(DEFINITIONS_EDITOR);
        expect(src).toContain("stageGrain=");
        expect(src).toMatch(/draft\.journey_segment === "child"/);
    });

    it("family case-status authoring is untouched", () => {
        // The close panel and its catalog remain exactly as they were; this change is additive.
        const src = read(BEHAVIOR_EDITOR);
        expect(src).toContain("stage-outcome-close-status-");
        expect(src).toContain("closedStatusOptions");
    });

    it("does not render StagePerChildPathsEditor for child-grain stages", () => {
        // Per-child paths split a FAMILY stage into child tracks. A child-grain stage has nothing to
        // split, so the fix belongs in the composable editor rather than by relaxing this gate.
        const stageEditor = read("components/adminV2/settings/lifecycle/StageEditorV2.tsx");
        expect(stageEditor).toMatch(/stageRecord\?\.grain === "family"[\s\S]{0,400}StagePerChildPathsEditor/);
    });
});

describe("a Result Definition can be shared by more than one Work Template", () => {
    /*
     * The stage OWNS result definitions; a work template REFERENCES the ones that can happen while
     * doing that work. The editor could already remove a reference ("Remove from work") but had no
     * way to add one, so the only route to a result on a second template was "+ Add outcome" —
     * which mints a NEW definition. A stage wanting one result on two work items had to duplicate
     * it, and duplicated definitions drift: two keys, two behaviours, one operator word.
     *
     * Waitlist is exactly that shape: "Candidate paused" follows from reviewing a candidate OR from
     * the conversation around an offer, and it is one result either way.
     */
    it("offers the stage's unreferenced results for attachment", () => {
        const src = read(DEFINITIONS_EDITOR);
        expect(src).toContain("attachableOutcomes");
        expect(src).toContain("work-template-outcome-attach-");
    });

    it("attaches by reference, never by copying the definition", () => {
        const src = read(DEFINITIONS_EDITOR);
        const attachBlock = src.slice(src.indexOf("attachableOutcomes.length ?"));
        const handler = attachBlock.slice(0, attachBlock.indexOf("</div>"));
        expect(handler).toContain("setWorkTemplateOutcomeRefs");
        expect(handler).not.toContain("newOutcomeDraft");
        expect(handler).not.toMatch(/outcomes:\s*\[/);
    });

    it("only offers results not already referenced by this work template", () => {
        const src = read(DEFINITIONS_EDITOR);
        expect(src).toMatch(/attachableOutcomes\s*=\s*work[\s\S]{0,200}!scopedRefs\.includes/);
    });
});

describe("the child picker falls back to the platform's own child vocabulary", () => {
    /*
     * `record_status_vocabulary` — the catalog the builder is handed — carries only `opportunities`
     * rows on the deployed tenant (open/closed/inactive/archived). Resolving the child domain from
     * it correctly finds nothing, so the picker sat empty over a stage whose stored configuration
     * already used child statuses, showing a raw key with no way to change it.
     *
     * The child track is platform-owned, and so is its vocabulary.
     */
    it("the canonical child vocabulary carries the dispositions Waitlist needs", () => {
        const keys = ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY.map((row) => row.status_key);
        expect(keys).toContain("enrolling");
        expect(keys).toContain("waitlisted");
        for (const row of ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY) {
            expect(row.entity_type).toBe("opportunity_customer_members");
            // Operator-facing label, never the raw key.
            expect(row.status_label).not.toBe(row.status_key);
        }
    });

    it("prefers a configured catalog and falls back only when it is empty", () => {
        const src = read(DEFINITIONS_EDITOR);
        expect(src).toContain("ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY");
        // The fallback must be conditional: a tenant that configures its own child statuses wins.
        expect(src).toMatch(/if\s*\(fromCatalog\.length\)\s*return fromCatalog;/);
    });

    it("never falls back to family statuses", () => {
        const keys = ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY.map((row) => row.status_key);
        expect(keys).not.toContain("open");
        expect(keys).not.toContain("closed");
        expect(keys).not.toContain("archived");
    });
});
