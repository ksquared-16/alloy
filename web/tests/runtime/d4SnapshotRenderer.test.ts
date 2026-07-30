/**
 * D4 — the snapshot renderer: the frozen D1 answer → the canonical Work Unit model.
 *
 * Pins the two things that make the cutover safe: the first frame is composed ENTIRELY from the
 * snapshot (no fetch, no readiness question), and Settlement is reserved rather than fetched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { OperationalPresentation } from "@/lib/runtime/provisioning/operationalPresentation";

const presentation = {
    header: {
        title: "New Leads",
        subtitle: "Respond before it goes cold",
        identityIcon: "user-plus",
        identityAccent: null,
        kpiSlots: [
            { slot: 1, label: "Needs attention", icon: "users", accent: null, sourceKey: "ctx.wu.attention" },
            { slot: 2, label: "Lead count", icon: "chart", accent: null, sourceKey: "ctx.wu.leads" },
        ],
    },
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

const base = {
    orgId: "org-1",
    workUnit: { id: "wu-1", key: "new_leads", name: "New Leads" },
    businessProcess: { key: "enrollment", name: "Enrollment" },
    activeWorkView: { id: "new_leads", label: "New Leads" },
    lensSet: [
        { id: "new_leads", label: "New Leads", displayOrder: 1 },
        { id: "tours", label: "Tours", displayOrder: 2 },
    ],
    rowGrain: "family",
    recordOfTruth: { entityType: "opportunity", id: "opp-1" },
    contextFrame: { workViewId: "new_leads", workViewLabel: "New Leads" },
    focusPanelScopeState: "in_scope",
    currentBusinessState: { stageKey: "lead", stageLabel: "New Lead", purpose: "p", workTemplateKey: "contact_family", workTemplateLabel: "Contact Family", required: true },
    primaryAction: { actionRef: "quick_message", label: "Contact Family", workTemplateKey: "contact_family" },
    presentation,
    actionsProjection: { count: 0, actions: [], departmentId: null },
    timings: { authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, presentation_ms: 0, records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 1 },
};

const operational = {
    ...base,
    terminal: "operational",
    rows: [
        { id: "opp-1", stageKey: "lead", statusKey: "open", updatedAt: null, title: "Wright", context: { drawer_open: { entity_id: "opp-1" } } },
        { id: "opp-2", stageKey: "lead", statusKey: "open", updatedAt: null, title: "Chen", context: { drawer_open: { entity_id: "opp-2" } } },
    ],
    recordOfAttention: { id: "opp-1", strategy: "first_row", strategySource: "declared_fallback" },
} as unknown as ProvisioningAnswer;

const empty = { ...base, terminal: "empty", rows: [], recordOfAttention: null } as unknown as ProvisioningAnswer;
const errored = {
    terminal: "error", code: "records_unavailable", message: "records unavailable",
    orgId: "org-1", workUnit: { id: "wu-1", key: "new_leads", name: "New Leads" }, timings: base.timings,
} as unknown as ProvisioningAnswer;

describe("D4 — snapshot renderer", () => {
    it("the first frame is composed ENTIRELY from the snapshot — no fetch, no effect, no DOM", () => {
        const src = readFileSync(join(__dirname, "../../lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts"), "utf8");
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const forbidden of ["fetch(", "useEffect", "useState", "document.", "window.", "supabase", "QueueService", "setTimeout"]) {
            expect(code).not.toContain(forbidden);
        }
    });

    it("operational: the frame carries U-O1…U-O5 with no readiness question", () => {
        const m = workUnitSurfaceModelFromSnapshot(operational);
        expect(m.header.title).toBe("New Leads");            // U-O1 orientation
        expect(m.activeWorkViewId).toBe("new_leads");         // U-O1 active lens
        expect(m.workViews.find((v) => v.isActive)?.id).toBe("new_leads");
        expect(m.queue.rows).toHaveLength(2);                 // U-O2 queue truth
        expect(m.queue.rows[0].entityId).toBe("opp-1");
        expect(m.queue.rows[0].context).not.toBeNull();       // the row context U-P7's slots describe
        expect(m.selectedRecordId).toBe("opp-1");             // U-O3 Record of Attention
        expect(m.queue.rowConfig).toBe(presentation.queue.rowSlots); // final layout, not an id
        // Readiness cannot be a question: the model exists only because a terminal arrived.
        expect(m.ready).toBe(true);
        expect(m.readiness.coldCompositionReady).toBe(true);
        expect(m.queue.loading).toBe(false);
    });

    it("Settlement is RESERVED, never fetched and never blocking", () => {
        const m = workUnitSurfaceModelFromSnapshot(operational);
        // KPI geometry present; values pending in already-reserved slots (no flash, no reflow).
        expect(m.header.kpis).toHaveLength(2);
        expect(m.header.kpis.every((k) => k.pending === true)).toBe(true);
        expect(m.header.kpis.every((k) => k.formattedValue === "")).toBe(true);
        expect(m.header.kpis[0].label).toBe("Needs attention"); // the slot is laid out NOW
        // Counts: reserved, not missing.
        expect(m.queue.totalCount).toBeNull();
        expect(m.workViews.every((v) => v.count === null)).toBe(true);
        // Rail with NO resolved actions renders empty (reserved) — never a fabricated count.
        expect(m.rightRailActions).toEqual([]);
    });

    it("B — the resolved Actions projection commits WITH the surface (count at commit, no flash)", () => {
        const withActions = {
            ...operational,
            actionsProjection: {
                count: 2,
                departmentId: "dept-firefly",
                actions: [
                    { key: "send_form", label: "Send Form", description: null, action_type: "workflow", icon: null, style: null, display_style: "button", payload: {}, workflow_id: "wf-1" },
                    { key: "schedule_tour", label: "Schedule Tour", description: null, action_type: "workflow", icon: null, style: null, display_style: "button", payload: {}, workflow_id: "wf-2" },
                ],
            },
        } as unknown as ProvisioningAnswer;
        const m = workUnitSurfaceModelFromSnapshot(withActions);
        // The count + identities are present in the FIRST frame — no Actions(0) flash, no late discovery.
        expect(m.rightRailActions).toHaveLength(2);
        expect(m.rightRailActions.map((a) => a.key)).toEqual(["send_form", "schedule_tour"]);
        // Department scope bakes with Actions so Create Lead does not wait on Settlement.
        expect(m.departmentId).toBe("dept-firefly");
    });

    it("authoritative empty: rows [] with NO error — distinct from error by construction", () => {
        const m = workUnitSurfaceModelFromSnapshot(empty);
        expect(m.queue.rows).toEqual([]);
        expect(m.queue.error).toBeNull(); // QueueRegion renderState → "empty", never "error"
        expect(m.selectedRecordId).toBeNull();
        expect(m.selectedSubject.source).toBe("empty");
        // Still a workable place: orientation and lens switching remain (U-O6).
        expect(m.header.title).toBe("New Leads");
        expect(m.workViews.length).toBeGreaterThan(1);
        expect(m.ready).toBe(true);
    });

    it("honest error: an error surface with NO partial operational content behind it (U-O7)", () => {
        const m = workUnitSurfaceModelFromSnapshot(errored);
        expect(m.queue.error).toBe("records unavailable"); // renderState → "error" (role=alert)
        expect(m.queue.rows).toEqual([]);
        expect(m.selectedRecordId).toBeNull(); // no false subject
        expect(m.header.kpis).toEqual([]);
        expect(m.ready).toBe(true);            // an honest error IS committed, not pending

        // The `errored` fixture carries NO `navigationFrame` — the honest shape for a failure that
        // happened BEFORE lenses resolved (unauthorized / work-unit-not-found / no-business-process /
        // no-active-view, and the kernel's deadline + transport terminals). Nothing to offer, so the
        // strip stays empty.
        //
        // INTENT CORRECTED (2026-07-30). This line used to read "no lens set pretending to be
        // operational" — asserting a law that is now wrong, and passing here only because the fixture
        // omits the field. A refusal that happens AFTER lenses resolve DOES carry them: discarding them
        // turned Firefly's grain-ambiguous "Active Pipeline" into a dead end with no in-surface way out
        // (docs/runtime/REFUSAL-HONEST-NOT-FATAL.md). Offering the lens set is not "pretending to be
        // operational" — the empty rows, null subject and empty KPIs asserted above are what prove it is
        // not. The navigable case is covered by
        // tests/adminV2/runtime/provisioningRefusalStaysNavigable.test.ts.
        expect(m.workViews).toEqual([]);
        expect(m.activeWorkViewId).toBeNull();
    });

    it("empty and error are never confused — the one distinction QueueRegion renders on", () => {
        const e = workUnitSurfaceModelFromSnapshot(empty);
        const x = workUnitSurfaceModelFromSnapshot(errored);
        expect(e.queue.rows).toEqual(x.queue.rows); // both have no rows…
        expect(e.queue.error).toBeNull();           // …but only one carries an error
        expect(x.queue.error).not.toBeNull();
    });

    it("the default-subject source is reported honestly", () => {
        expect(workUnitSurfaceModelFromSnapshot(operational).selectedSubject.source).toBe("first_row");
        const configured = {
            ...operational,
            recordOfAttention: { id: "opp-2", strategy: "earliest_due", strategySource: "configured" },
        } as unknown as ProvisioningAnswer;
        const m = workUnitSurfaceModelFromSnapshot(configured);
        expect(m.selectedSubject.source).toBe("strategy");
        expect(m.selectedRecordId).toBe("opp-2");
    });
});
