/**
 * A SUBJECT THAT CANNOT COMPOSE MUST NOT UNMOUNT ITS COHORT.
 *
 * THE DEFECT THIS PINS WAS LIVE, ON THE CERTIFIED TENANT (measured 2026-09-15, Firefly). Proven at
 * the API layer with no UI involved:
 *
 *     GET …/work-units/all/provisioning-answer                        → terminal "operational", 7 rows
 *     GET …/work-units/all/provisioning-answer?subject_id=8baf8418…   → terminal "error", cohort gone
 *
 * Same Work Unit, same Work View. Only `subject_id` differs. The Work View was never in question —
 * but `fail()` is scope-blind, and SIX refusal sites fire after the Work Unit, the lens set and the
 * evaluated page have all resolved successfully. Selecting either `decision`-stage row in "All"
 * therefore replaced a seven-row queue and a six-card panel with a configuration banner.
 *
 * This is the sibling of `provisioningRefusalStaysNavigable.test.ts`, and deliberately so. That file
 * pins the lens set surviving a refusal, for the reason "a refusal must not also remove the way out".
 * The lens set survived and the ROWS did not — `queueFrame` is that same sentence one level deeper.
 *
 * Three invariants, deliberately separate:
 *   1. CONTAINMENT — a refusal raised after the cohort resolved renders the cohort, not a banner.
 *   2. HONESTY — a refusal raised BEFORE it resolved still replaces the surface. There is no cohort,
 *      and inventing one would be the false affordance this whole shape exists to prevent.
 *   3. OWNERSHIP — the refusal is not discarded. It moves to the Focus Panel, which owns the subject.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { OperationalPresentation } from "@/lib/runtime/provisioning/operationalPresentation";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";

const TIMINGS = {
    authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, presentation_ms: 0,
    records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 0,
};

const presentation = {
    header: { title: "New Leads", subtitle: null, identityIcon: null, identityAccent: null, kpiSlots: [] },
    queue: {
        rowVariant: "crm_compact",
        rowSlots: { subject: {}, status: {}, contact: {}, attention: {}, work: {}, groupCount: {} },
        rowVariants: [],
        fallbackSlots: [],
        published: true,
    },
    focusPanel: {
        situation: { subjectPlacement: "panel_header", businessStatePlacement: "panel_header" },
        decision: { purposePlacement: "panel_body" },
        action: { primaryActionPlacement: "panel_header" },
        contextFramePlacement: "panel_header",
        scopeStatePlacement: "panel_boundary",
    },
    provenance: { queueLayoutId: "ql", focusPanelLayoutId: "fp", headerSource: "published", queueRowSource: "published" },
} as unknown as OperationalPresentation;

const FRAME = {
    lensSet: [
        { id: "new_leads", label: "New", displayOrder: 1 },
        { id: "new_work_view_6", label: "All", displayOrder: 6 },
    ],
    activeWorkView: { id: "new_work_view_6", label: "All" },
};

/** The seven-row cohort the measured specimen resolved before it refused. */
const COHORT = [
    "1a132b7f", "eb5394c7", "8baf8418", "d097e1a8", "468a5a95", "68094bbd", "e56e72d5",
].map((id) => ({ id, stageKey: "lead", statusKey: null, updatedAt: null, title: id, context: {} }));

const refusalWithCohort = (
    code: ProvisioningAnswer extends { terminal: "error"; code: infer C } ? C : never,
    message: string,
    requestedSubjectId: string | null,
): ProvisioningAnswer =>
    ({
        terminal: "error",
        code,
        message,
        orgId: "org",
        workUnit: { id: "wu", key: "lifecycle_wu_lead", name: "New Leads" },
        navigationFrame: FRAME,
        queueFrame: {
            rows: COHORT,
            rowGrain: "family",
            subjectGrain: { grain: "family", subjectType: "opportunity" },
            presentation,
            businessProcess: { key: "enrollment", name: "Enrollment" },
            actionsProjection: { count: 0, actions: [], departmentId: null },
            requestedSubjectId,
        },
        timings: TIMINGS,
    }) as unknown as ProvisioningAnswer;

const refusalWithoutCohort = (code: string, message: string): ProvisioningAnswer =>
    ({
        terminal: "error", code, message, orgId: "org",
        workUnit: { id: "wu", key: "lifecycle_wu_lead", name: "New Leads" },
        navigationFrame: FRAME, timings: TIMINGS,
    }) as unknown as ProvisioningAnswer;

describe("1. CONTAINMENT — a post-cohort refusal keeps its cohort", () => {
    /**
     * EVERY refusal reachable after the cohort resolves. The measured specimen is one row of this
     * table; the defect was never specific to `decision`, and pinning only that stage would leave
     * the other five doors open — `subject_unavailable` among them, which a deep link reaches.
     */
    const POST_COHORT_DOORS: Array<[string, string]> = [
        ["no_truthful_primary_action", 'stage "decision" offers no reachable primary action — the answer will not claim operational on identity alone'],
        ["no_truthful_primary_action", 'subject holds no resolvable Mission stage (context="decision", epp=[])'],
        ["no_truthful_primary_action", 'stage "decision" offers no work templates — the answer will not claim operational on identity alone'],
        ["no_truthful_primary_action", "a child surface cannot describe a position the Business Process does not define"],
        ["subject_unavailable", "the requested subject is not present in this work unit's evaluated page — refusing to substitute a different subject"],
        ["subject_unavailable", "the configured strategy resolved no subject from the evaluated page"],
    ];

    it.each(POST_COHORT_DOORS)("%s keeps all seven rows and does not banner the queue", (code, message) => {
        const m = workUnitSurfaceModelFromSnapshot(
            refusalWithCohort(code as never, message, "8baf8418"),
        );
        // The cohort survives, in full, in order.
        expect(m.queue.rows).toHaveLength(7);
        expect(m.queue.rows.map((r) => r.entityId)).toEqual(COHORT.map((r) => r.id));
        // QueueRegion selects its render state on `error` — null is what makes it render rows.
        expect(m.queue.error).toBeNull();
        expect(m.queue.errorKind).toBeUndefined();
        // The Work View is not collapsed: pills survive, and the active one is still active.
        expect(m.workViews).toHaveLength(2);
        expect(m.activeWorkViewId).toBe("new_work_view_6");
    });

    it("keeps the operator's selection lit while its panel refuses", () => {
        const m = workUnitSurfaceModelFromSnapshot(
            refusalWithCohort("no_truthful_primary_action" as never, "stage \"decision\" …", "8baf8418"),
        );
        expect(m.selectedRecordId).toBe("8baf8418");
        expect(m.selectedSubject).toEqual({ selectedRecordId: "8baf8418", source: "url" });
    });
});

describe("2. HONESTY — a pre-cohort refusal still replaces the surface", () => {
    it("banners the queue when there is genuinely no cohort", () => {
        const m = workUnitSurfaceModelFromSnapshot(
            refusalWithoutCohort("grain_ambiguous", 'Work View "Active Pipeline": lens spans 2 Row Grains'),
        );
        expect(m.queue.rows).toHaveLength(0);
        expect(m.queue.error).toBe('Work View "Active Pipeline": lens spans 2 Row Grains');
        expect(m.queue.errorKind).toBe("configuration");
        expect(m.selectedRecordId).toBeNull();
        // No cohort means no subject-level owner to hand it to — the surface IS the refusal.
        expect(m.subjectRefusal ?? null).toBeNull();
    });
});

describe("3. OWNERSHIP — the refusal moves, it is not dropped", () => {
    it("hands a contained refusal to the Focus Panel with its message verbatim", () => {
        const message = 'stage "decision" offers no reachable primary action — the answer will not claim operational on identity alone';
        const m = workUnitSurfaceModelFromSnapshot(
            refusalWithCohort("no_truthful_primary_action" as never, message, "8baf8418"),
        );
        expect(m.subjectRefusal).toEqual({ kind: "configuration", message });
    });

    it("classifies an unavailable subject as a subject problem, not a configuration one", () => {
        const m = workUnitSurfaceModelFromSnapshot(
            refusalWithCohort("subject_unavailable" as never, "not present in this work unit's evaluated page", "00000000"),
        );
        expect(m.subjectRefusal?.kind).toBe("subject");
    });
});

/**
 * SOURCE LOCKS. The invariants above are properties of the COMPOSER's control flow, and a seventh
 * refusal site added later would reintroduce the defect while every test above still passed. These
 * two locks are what make that a build failure instead of a regression.
 */
describe("4. LOCKS — the composer cannot grow a scope-blind refusal again", () => {
    const SRC = readFileSync(
        join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
        "utf-8",
    );

    it("routes every post-cohort refusal through cohortRefusal", () => {
        // Six sites, no more and no fewer. A new one must state which side of the cohort it is on.
        expect(SRC.split("cohortRefusal(").length - 1).toBe(6);
    });

    it("does not serialise the operational path to preserve the refusal path", () => {
        /*
         * CONCURRENCY, LOCKED AS AN ORDERING FACT.
         *
         * `cohortRefusal` awaits enrichment, which is already in flight. That is only free because
         * every refusal site sits ABOVE the point where the operational path starts its own
         * independent work — the stage-work read. If a future edit moved a refusal below it, the
         * refusal path would begin awaiting work the operational path had already started, and this
         * assertion is what catches it.
         */
        const lastRefusal = SRC.lastIndexOf("cohortRefusal(");
        const stageWorkStart = SRC.indexOf("const focusPanelStageWorkPromise");
        expect(lastRefusal).toBeGreaterThan(0);
        expect(stageWorkStart).toBeGreaterThan(lastRefusal);
    });
});
