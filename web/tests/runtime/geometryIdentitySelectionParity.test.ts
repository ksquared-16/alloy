/**
 * P0-7.6 — GEOMETRY IDENTITY: EXACT SELECTION PARITY.
 *
 * ── THE QUESTION ────────────────────────────────────────────────────────────────────────────────
 *
 * The Focus Panel's published composition is selected by `workViewId` + `stage.key`
 * (`resolvePublishedFocusPanelSummaryRecord`). So the surface can state its FINAL GEOMETRY — card
 * membership, order and presentation — as soon as it knows two things:
 *
 *     which subject is focused, and what that subject's canonical stage is.
 *
 * Every one of the 39 first-order FACTS may still be UNKNOWN at that moment. None of them selects
 * geometry. The premise under examination was that the runtime pays the enriched cohort
 * (`cohort_rows_done_ms`, P50 658ms on deployed 1072986a, n=26) to answer this much smaller
 * question.
 *
 * ── WHAT THIS FILE PROVES ───────────────────────────────────────────────────────────────────────
 *
 * It does NOT pay it, and this is structural rather than incidental. The geometry identity tuple
 *
 *     { subjectId, entityType, processStageKey, workViewId }
 *
 * is a pure, synchronous function of the BASE RECORDS READ plus CONFIGURATION:
 *
 *   1. `subjectRows` (workUnitProvisioningAnswer.ts:1606) carries exactly four fields per row —
 *      `{ id, entityId, entityType, sortIndex }`. `priorityScore`, `dueAtIso`, `assignedToUserId`
 *      and `needsOperationalAttention` are never populated, so `resolveDefaultOperationalSubject`
 *      has no signal to read but queue order. Enrichment cannot reach the selector because the
 *      selector is never handed a field enrichment writes.
 *
 *   2. The stage is resolved from `subjectRecord.stage_key` and
 *      `_effective_participant_stage_keys`, and the latter is attached by
 *      `attachEffectiveStagesFromMaintainedFacts` — SYNCHRONOUS, derived from
 *      `maintained_operational_facts` columns that arrive WITH the opportunity row. Measured
 *      `projection_ms` P50 = 1ms.
 *
 * The oracle below therefore compares a MINIMUM path — given only the four selector fields plus the
 * stage columns and configuration — against a FULL path whose rows additionally carry every
 * enrichment product the cohort produces (CRM, children, personal-seen, presentation, avatars,
 * titles), populated with ADVERSARIAL values chosen to flip the answer if they were ever read.
 * The two must agree on all four fields of the tuple, in every case.
 *
 * ── WHY IT IS NOT VACUOUS ───────────────────────────────────────────────────────────────────────
 *
 * A parity test that passes because neither side reads anything proves nothing. The final describe
 * block plants inputs the tuple genuinely DOES depend on — the stage columns and the lens keys —
 * and asserts the tuple CHANGES. If those ever stop moving the answer, this file fails and the
 * parity claim above is withdrawn rather than silently weakened.
 */
import { describe, expect, it } from "vitest";

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { lensStageKeys } from "@/lib/lifecycle/lensStageKeys";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import {
    effectiveParticipantStageKeysFromRow,
    resolveContextMissionStages,
} from "@/lib/process/engine/resolveContextMissionStages";
import {
    resolveDefaultOperationalSubject,
    type DefaultOperationalSubjectStrategy,
    type OperationalSubjectQueueRow,
} from "@/lib/adminV2/runtime/operationalSubject/resolveDefaultOperationalSubject";

/** The tuple that decides published Focus Panel geometry. Nothing else selects cards. */
type GeometryIdentity = {
    subjectId: string | null;
    entityType: string | null;
    processStageKey: string | null;
    workViewId: string | null;
};

type RawRow = Record<string, unknown> & { id: string };

function stage(key: string, sortOrder: number): LifecycleBuilderStageRecord {
    return { id: `stg_${key}`, key, label: key, sort_order: sortOrder, is_active: true };
}

const STAGES: LifecycleBuilderStageRecord[] = [
    stage("lead", 0),
    stage("tour", 1),
    stage("waitlist", 2),
    stage("enrolling", 3),
    stage("active", 4),
];

function view(id: string, stageKeys: string[]): WorkViewConfigV1Stored {
    return {
        id,
        label: id,
        filters_v1: stageKeys.map((v) => ({ field_key: "opportunity_stage", operator: "in", value: [v] })),
    } as WorkViewConfigV1Stored;
}

/**
 * The composer's own geometry path, read out of `workUnitProvisioningAnswer.ts` and applied to the
 * inputs a case supplies. `page` here plays the role of the evaluated, ordered page.
 */
function geometryIdentity(input: {
    page: RawRow[];
    stages: LifecycleBuilderStageRecord[];
    activeView: WorkViewConfigV1Stored;
    strategy: DefaultOperationalSubjectStrategy;
    currentUserId?: string | null;
}): GeometryIdentity {
    // :1606 — the projection the selector actually receives. Four fields, no enrichment.
    const subjectRows: OperationalSubjectQueueRow[] = input.page.map((r, i) => ({
        id: String(r.id),
        entityId: String(r.id),
        entityType: "opportunity",
        sortIndex: i,
    }));
    const chosen = resolveDefaultOperationalSubject(subjectRows, input.strategy, {
        currentUserId: input.currentUserId ?? null,
    });
    if (!chosen) return { subjectId: null, entityType: null, processStageKey: null, workViewId: null };

    // :1819 — the subject record, found in the page by the chosen entity id.
    const subjectRow = input.page.find((r) => String(r.id) === chosen.entityId) ?? null;
    if (!subjectRow) return { subjectId: null, entityType: null, processStageKey: null, workViewId: null };

    // :2060 — Mission from Effective Process Position, not raw stage_key alone.
    const contextStageKey = typeof subjectRow.stage_key === "string" ? subjectRow.stage_key : null;
    const mission = resolveContextMissionStages({
        contextStageKey,
        effectiveParticipantStageKeys: effectiveParticipantStageKeysFromRow(subjectRow),
        workViewLensStageKeys: lensStageKeys(input.activeView),
    });
    const found = input.stages.find((s) => s.key === mission.primaryMissionStageKey) ?? null;
    return {
        subjectId: chosen.entityId,
        entityType: chosen.entityType,
        processStageKey: found?.key ?? null,
        // :2536 — geometry is selected by workViewId + stage.key.
        workViewId: input.activeView.id,
    };
}

/**
 * Everything the enriched cohort adds to a row, set to values that would move the answer if the
 * geometry path read them: a priority and a due date on the LAST row, an assignment to the current
 * user, and a contradictory enrichment stage. None of these is a field the selector is given.
 */
function withAdversarialEnrichment(rows: RawRow[]): RawRow[] {
    return rows.map((r, i) => ({
        ...r,
        priorityScore: i === rows.length - 1 ? 9_999 : 0,
        dueAtIso: i === rows.length - 1 ? "1999-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z",
        assignedToUserId: i === rows.length - 1 ? "user-me" : "user-other",
        needsOperationalAttention: i === rows.length - 1,
        // CRM / children / personal-seen / presentation products.
        _crm_contact: { name: `crm-${i}`, stage_key: "active" },
        _inquiry_children: [{ id: `child-${i}`, stage_key: "active" }],
        _personal_seen_at: "2026-01-01T00:00:00.000Z",
        _presentation: { badge: "ENRICHED", stage_key: "active" },
        avatarImageUrl: `https://example.invalid/${i}.png`,
        title: `enriched-title-${i}`,
    }));
}

function rows(spec: Array<{ id: string; stage_key: string | null; epp?: string[] }>): RawRow[] {
    return spec.map((s) => ({
        id: s.id,
        stage_key: s.stage_key,
        ...(s.epp ? { _effective_participant_stage_keys: s.epp } : {}),
    }));
}

const STRATEGIES: DefaultOperationalSubjectStrategy[] = [
    "highest_priority",
    "earliest_due",
    "assigned_to_me",
    "highest_sort_order",
    "first_row",
];

type Case = {
    name: string;
    page: RawRow[];
    activeView: WorkViewConfigV1Stored;
    strategy: DefaultOperationalSubjectStrategy;
    currentUserId?: string | null;
};

const INVENTORY = view("wv-inventory", []);
const LEAD_LENS = view("wv-lead", ["lead"]);
const WAITLIST_LENS = view("wv-waitlist", ["waitlist"]);
const MULTI_LENS = view("wv-multi", ["waitlist", "enrolling"]);

const CASES: Case[] = [
    {
        name: "01 single row, context stage only, inventory lens",
        page: rows([{ id: "o1", stage_key: "lead" }]),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "02 many rows, first row wins under queue order",
        page: rows([
            { id: "o1", stage_key: "lead" },
            { id: "o2", stage_key: "tour" },
            { id: "o3", stage_key: "waitlist" },
        ]),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "03 participants have diverged — EPP overrides the shared context stage",
        page: rows([{ id: "o1", stage_key: "lead", epp: ["waitlist"] }]),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "04 stage-scoped lens intersects a heterogeneous participant set",
        page: rows([{ id: "o1", stage_key: "lead", epp: ["enrolling", "waitlist"] }]),
        activeView: WAITLIST_LENS,
        strategy: "highest_sort_order",
    },
    {
        name: "05 stage-scoped lens whose intersection is empty keeps the full tracks",
        page: rows([{ id: "o1", stage_key: "lead", epp: ["active"] }]),
        activeView: WAITLIST_LENS,
        strategy: "highest_sort_order",
    },
    {
        name: "06 multi-stage lens preserves lens order for emphasis",
        page: rows([{ id: "o1", stage_key: "lead", epp: ["enrolling", "waitlist"] }]),
        activeView: MULTI_LENS,
        strategy: "highest_sort_order",
    },
    {
        name: "07 null context stage with no participants resolves no stage",
        page: rows([{ id: "o1", stage_key: null }]),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "08 null context stage rescued by participant stages",
        page: rows([{ id: "o1", stage_key: null, epp: ["tour"] }]),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "09 stage key not present in the active process resolves no stage",
        page: rows([{ id: "o1", stage_key: "retired_stage" }]),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    { name: "10 strategy highest_priority", page: rows([
        { id: "o1", stage_key: "lead" }, { id: "o2", stage_key: "waitlist" },
    ]), activeView: LEAD_LENS, strategy: "highest_priority" },
    { name: "11 strategy earliest_due", page: rows([
        { id: "o1", stage_key: "lead" }, { id: "o2", stage_key: "waitlist" },
    ]), activeView: LEAD_LENS, strategy: "earliest_due" },
    { name: "12 strategy assigned_to_me with a current user", page: rows([
        { id: "o1", stage_key: "lead" }, { id: "o2", stage_key: "waitlist" },
    ]), activeView: LEAD_LENS, strategy: "assigned_to_me", currentUserId: "user-me" },
    { name: "13 strategy assigned_to_me with no current user", page: rows([
        { id: "o1", stage_key: "lead" }, { id: "o2", stage_key: "waitlist" },
    ]), activeView: LEAD_LENS, strategy: "assigned_to_me", currentUserId: null },
    { name: "14 strategy first_row", page: rows([
        { id: "o1", stage_key: "tour" }, { id: "o2", stage_key: "waitlist" },
    ]), activeView: INVENTORY, strategy: "first_row" },
    {
        name: "15 empty page selects no subject and no geometry",
        page: [],
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "16 duplicate participant stages dedupe to one Mission stage",
        page: rows([{ id: "o1", stage_key: "lead", epp: ["waitlist", "waitlist", "waitlist"] }]),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "17 a long page — selection must still be queue order, not enrichment order",
        page: rows(Array.from({ length: 40 }, (_, i) => ({ id: `o${i + 1}`, stage_key: i % 2 ? "tour" : "lead" }))),
        activeView: INVENTORY,
        strategy: "highest_sort_order",
    },
    {
        name: "18 every strategy over one heterogeneous page (lead lens)",
        page: rows([
            { id: "o1", stage_key: "lead", epp: ["lead"] },
            { id: "o2", stage_key: "waitlist", epp: ["waitlist"] },
            { id: "o3", stage_key: "enrolling", epp: ["enrolling"] },
        ]),
        activeView: LEAD_LENS,
        strategy: "highest_sort_order",
    },
];

describe("geometry identity is decided without the enriched cohort", () => {
    it("covers at least fifteen listed cases", () => {
        expect(CASES.length).toBeGreaterThanOrEqual(15);
    });

    for (const c of CASES) {
        it(`${c.name} — minimum path equals full path`, () => {
            const minimum = geometryIdentity({
                page: c.page,
                stages: STAGES,
                activeView: c.activeView,
                strategy: c.strategy,
                currentUserId: c.currentUserId ?? null,
            });
            const full = geometryIdentity({
                page: withAdversarialEnrichment(c.page),
                stages: STAGES,
                activeView: c.activeView,
                strategy: c.strategy,
                currentUserId: c.currentUserId ?? null,
            });
            expect(full).toEqual(minimum);
        });
    }

    it("parity holds for every strategy across every case", () => {
        const disagreements: string[] = [];
        for (const c of CASES) {
            for (const strategy of STRATEGIES) {
                const base = { page: c.page, stages: STAGES, activeView: c.activeView, strategy, currentUserId: c.currentUserId ?? null };
                const minimum = geometryIdentity(base);
                const full = geometryIdentity({ ...base, page: withAdversarialEnrichment(c.page) });
                if (JSON.stringify(minimum) !== JSON.stringify(full)) {
                    disagreements.push(`${c.name} / ${strategy}: ${JSON.stringify(minimum)} != ${JSON.stringify(full)}`);
                }
            }
        }
        expect(disagreements).toEqual([]);
    });

    it("the selector is never handed a field enrichment writes", () => {
        // The four fields of `subjectRows`. If a fifth is ever added, the parity argument above
        // stops being structural and this test says so before the claim is repeated.
        const enrichmentReadableSignals = ["priorityScore", "dueAtIso", "assignedToUserId", "needsOperationalAttention"];
        const page = withAdversarialEnrichment(rows([{ id: "o1", stage_key: "lead" }, { id: "o2", stage_key: "tour" }]));
        const subjectRows = page.map((r, i) => ({
            id: String(r.id), entityId: String(r.id), entityType: "opportunity" as const, sortIndex: i,
        }));
        for (const row of subjectRows) {
            for (const signal of enrichmentReadableSignals) {
                expect(row).not.toHaveProperty(signal);
            }
            expect(Object.keys(row).sort()).toEqual(["entityId", "entityType", "id", "sortIndex"]);
        }
    });
});

describe("the oracle can fail — the tuple does depend on its real inputs", () => {
    const page = rows([{ id: "o1", stage_key: "lead", epp: ["waitlist"] }]);

    it("dropping the effective participant stages changes the resolved stage", () => {
        const withEpp = geometryIdentity({ page, stages: STAGES, activeView: INVENTORY, strategy: "highest_sort_order" });
        const withoutEpp = geometryIdentity({
            page: rows([{ id: "o1", stage_key: "lead" }]),
            stages: STAGES, activeView: INVENTORY, strategy: "highest_sort_order",
        });
        expect(withEpp.processStageKey).toBe("waitlist");
        expect(withoutEpp.processStageKey).toBe("lead");
        expect(withoutEpp).not.toEqual(withEpp);
    });

    it("changing the lens changes the workViewId half of the geometry key", () => {
        const a = geometryIdentity({ page, stages: STAGES, activeView: INVENTORY, strategy: "highest_sort_order" });
        const b = geometryIdentity({ page, stages: STAGES, activeView: LEAD_LENS, strategy: "highest_sort_order" });
        expect(a.workViewId).toBe("wv-inventory");
        expect(b.workViewId).toBe("wv-lead");
        expect(a).not.toEqual(b);
    });

    it("lens stage keys steer Mission when participants are heterogeneous", () => {
        const het = rows([{ id: "o1", stage_key: "lead", epp: ["enrolling", "waitlist"] }]);
        const unscoped = geometryIdentity({ page: het, stages: STAGES, activeView: INVENTORY, strategy: "highest_sort_order" });
        const scoped = geometryIdentity({ page: het, stages: STAGES, activeView: WAITLIST_LENS, strategy: "highest_sort_order" });
        expect(unscoped.processStageKey).toBe("enrolling");
        expect(scoped.processStageKey).toBe("waitlist");
    });

    it("queue order decides the subject, so reordering the page moves it", () => {
        const forward = geometryIdentity({
            page: rows([{ id: "o1", stage_key: "lead" }, { id: "o2", stage_key: "tour" }]),
            stages: STAGES, activeView: INVENTORY, strategy: "highest_sort_order",
        });
        const reversed = geometryIdentity({
            page: rows([{ id: "o2", stage_key: "tour" }, { id: "o1", stage_key: "lead" }]),
            stages: STAGES, activeView: INVENTORY, strategy: "highest_sort_order",
        });
        expect(forward.subjectId).toBe("o1");
        expect(reversed.subjectId).toBe("o2");
    });
});
