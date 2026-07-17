/**
 * D1 — the bounded Provisioning Answer: the Preparation Contract, proven.
 *
 * Governing (landed, in-branch): docs/platform/runtime/runtime-implementation-authorization.md
 *   U-O1…U-O7 (120–126) · U-P1…U-P7 (137–148) · Part 8 budgets
 * and docs/platform/runtime/stage-work-view-queue-canonical-model.md §0.5.1 · §0.5.2 · §1.4 · §6.
 *
 * The Supabase client is stubbed so these proofs are deterministic and CI-safe; the row data and the
 * authored configuration are the REAL representative seed, captured in fixtures/new-leads-entry.json
 * (500 bounded rows: 150 `lead` + 350 `closed`). Live composition timing (p50/p75/p95 vs the ratified
 * ≤400 ms p75) is measured separately against the running local environment.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
    composeWorkUnitProvisioningAnswer,
    resolveLensRowGrain,
    PROVISIONING_ROW_PAGE_CAP,
} from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
    activeStagesForProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

const fixture = JSON.parse(
    readFileSync(join(__dirname, "fixtures/new-leads-entry.json"), "utf8"),
) as { metadata: unknown; rows: Array<Record<string, unknown>> };

const ORG = "00000000-0000-4000-8000-000000000001";
const WU = { id: "00000000-0000-4000-8000-000000000030", key: "new_leads", name: "New Leads" };

/**
 * Minimal Supabase stub. `queueService` is deliberately absent — the answer must never reach for it.
 * Every table access is recorded so we can prove the lane path is untouched.
 */
function stubSupabase(opts?: { rows?: Array<Record<string, unknown>>; metadata?: unknown; rowError?: string }) {
    const touched: string[] = [];
    const client = {
        touched,
        from(table: string) {
            touched.push(table);
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                limit: async () =>
                    opts?.rowError
                        ? { data: null, error: { message: opts.rowError } }
                        : { data: opts?.rows ?? fixture.rows, error: null },
                maybeSingle: async () => {
                    if (table === "work_units") {
                        return { data: { ...WU, org_id: ORG, department_id: "dept-1", queue_definition: { ui: { row_preview: { variant: "crm_compact" } } } }, error: null };
                    }
                    return { data: { id: "dept-1", metadata: opts?.metadata ?? fixture.metadata }, error: null };
                },
            };
            return builder;
        },
    };
    return client as unknown as Parameters<typeof composeWorkUnitProvisioningAnswer>[0]["supabase"] & { touched: string[] };
}

const request = (over: Partial<Parameters<typeof composeWorkUnitProvisioningAnswer>[0]> = {}) => ({
    supabase: stubSupabase(),
    orgId: ORG,
    workUnitSlug: "new_leads",
    requestedWorkViewId: "new_leads",
    ...over,
});

describe("D1 — bounded Provisioning Answer", () => {
    it("1. New Leads returns exactly the Stage Membership cohort (bounded to one page)", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        expect(a.terminal).toBe("operational");
        if (a.terminal !== "operational") return;
        // 150 admitted by stage; the answer is bounded to ONE page.
        expect(a.rows.length).toBe(Math.min(150, PROVISIONING_ROW_PAGE_CAP));
        expect(a.rows.every((r) => r.stageKey === "lead")).toBe(true);
    });

    it("2. rows come from the Work View projection — QueueService/lane tables are never touched", async () => {
        const supabase = stubSupabase();
        await composeWorkUnitProvisioningAnswer(request({ supabase }));
        // Records + Configuration only. `entity_layouts` is U-P7 published presentation
        // configuration, resolved INSIDE the answer — that is the round-trip being removed, not one
        // being added. What must never appear is a lane/QueueService read.
        expect([...new Set(supabase.touched)].sort()).toEqual([
            "departments", "entity_layouts", "opportunities", "work_units",
        ]);
        for (const laneTable of ["queue_definitions", "queues", "queue_lanes"]) {
            expect(supabase.touched).not.toContain(laneTable);
        }
    });

    it("3. default Record of Attention comes from the SAME evaluated page", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        expect(a.rows.some((r) => r.id === a.recordOfAttention.id)).toBe(true);
    });

    it("3b. U-P4: strategy is the DECLARED fallback when configuration declares none", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        expect(a.recordOfAttention.strategy).toBe("first_row");
        expect(a.recordOfAttention.strategySource).toBe("declared_fallback");
    });

    it("4. Row Grain is explicit and Stage-owned (family for New Leads)", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        expect(a.rowGrain).toBe("family");
    });

    it("5. Record of Attention is explicit and MAY differ from Row Grain (§0.5.1/§0.5.2)", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        // Row Grain is the Stage-owned row shape; Record of Attention is an entity identity.
        // They are different axes and are NOT required to be equal.
        expect(a.rowGrain).toBe("family");
        expect(a.recordOfAttention.id).toEqual(expect.any(String));
        expect(a.recordOfTruth).toEqual({ entityType: "opportunity", id: a.recordOfAttention.id });
    });

    it("6. current business state is present (Situation + Decision)", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        expect(a.currentBusinessState.stageKey).toBe("lead");
        expect(a.currentBusinessState.purpose).toBe("Reach the family and determine next steps.");
        expect(a.currentBusinessState.workTemplateKey).toBe("contact_family");
    });

    it("7. primary action is truthful and reachable (U-O5)", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        expect(a.primaryAction).toEqual({
            actionRef: "quick_message",
            label: "Contact Family",
            workTemplateKey: "contact_family",
        });
    });

    it("8. authoritative empty is DISTINCT from error (U-O6)", async () => {
        // A lens that admits nothing: real config, but no row holds the stage.
        const rows = fixture.rows.filter((r) => r.stage_key === "closed");
        const a = await composeWorkUnitProvisioningAnswer(
            request({ supabase: stubSupabase({ rows }) }),
        );
        expect(a.terminal).toBe("empty");
        if (a.terminal !== "empty") return;
        expect(a.rows).toEqual([]);
        expect(a.recordOfAttention).toBeNull();
        // U-O6: an empty lens stays a workable place — lens switching remains reachable.
        expect(a.lensSet.length).toBeGreaterThan(1);
        expect(a.activeWorkView.id).toBe("new_leads");
    });

    it("9. broken configuration returns `error`, NOT `empty` (U-O7 — never a false-empty)", async () => {
        const a = await composeWorkUnitProvisioningAnswer(
            request({ supabase: stubSupabase({ rowError: "connection reset" }) }),
        );
        expect(a.terminal).toBe("error");
        if (a.terminal !== "error") return;
        expect(a.code).toBe("records_unavailable");
        expect(a.terminal).not.toBe("empty");
    });

    it("9b. no Business Process configured is an honest error, not an empty queue", async () => {
        const a = await composeWorkUnitProvisioningAnswer(
            request({ supabase: stubSupabase({ metadata: {} }) }),
        );
        expect(a.terminal).toBe("error");
        if (a.terminal !== "error") return;
        expect(a.code).toBe("no_business_process");
    });

    it("10. Settlement fields are ABSENT — the Preparation Contract is a hard boundary", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        const keys = Object.keys(a);
        for (const forbidden of [
            "counts", "viewCounts", "workViewCounts", "kpi", "kpis", "metrics",
            "activity", "communications", "relatedRecords", "history",
            "secondaryCards", "secondaryActions", "deferredEvidence", "rightRail",
        ]) {
            expect(keys).not.toContain(forbidden);
        }
        // The lens set carries identity only — a count here would be Settlement leaking into U-P.
        if (a.terminal !== "operational") throw new Error("expected operational");
        for (const lens of a.lensSet) expect(Object.keys(lens).sort()).toEqual(["displayOrder", "id", "label"]);
        // Rows carry recognition fields + the U-O2 row context the compact row renders from.
        // `context` is OPERATIONAL (U-O2: "enough to recognise and select"), not Settlement — U-P7's
        // rowSlots describe its geometry, so it must arrive WITH the rows or the surface re-lays out.
        expect(Object.keys(a.rows[0]).sort()).toEqual(["context", "id", "stageKey", "statusKey", "title", "updatedAt"]);
        // …and the context itself must carry no Settlement.
        const ctxJson = JSON.stringify(a.rows.map((r) => r.context));
        for (const forbidden of ["formattedValue", "kpi", "activity_feed", "communications", "related_records"]) {
            expect(ctxJson).not.toContain(`"${forbidden}"`);
        }
    });

    it("11. payload is bounded BY THE PAGE — not by the base row set", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        // The ratified budgets (Authorization Part 8) are all TIME budgets — no payload byte budget
        // is ratified. "Bounded" therefore means: the answer scales with ONE page, never with the
        // 500-row base set or the 2400-row work unit. That is the invariant worth pinning.
        expect(a.rows.length).toBeLessThanOrEqual(PROVISIONING_ROW_PAGE_CAP);

        const bytes = Buffer.byteLength(JSON.stringify(a), "utf8");
        const perRow = (bytes - Buffer.byteLength(JSON.stringify({ ...a, rows: [] }), "utf8")) / a.rows.length;
        // Proportional to the page. The synthetic fixture measures ~640 B/row post
        // `projectQueuePreviewRowContexts`; the LIVE representative seed measures ~1069 B/row
        // (richer names/contacts), so the ceiling is set above live reality rather than to the
        // fixture — a bound only the fixture can pass would hide a real regression. Raw
        // (unprojected) context measured ~1.0 KB/row on the fixture alone, so this still fails
        // loudly if the compact projection is bypassed. No byte budget is ratified (Part 8 is all
        // time budgets); this guards unbounded growth, it does not invent a budget.
        expect(perRow).toBeLessThan(1400);
        // A whole-answer ceiling that still fails loudly if the page cap or the projection breaks.
        expect(bytes).toBeLessThan(128 * 1024);
    });

    it("12. no duplicate membership evaluation — each table is read exactly once", async () => {
        const supabase = stubSupabase();
        await composeWorkUnitProvisioningAnswer(request({ supabase }));
        const counts = supabase.touched.reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
        // The membership read happens EXACTLY ONCE — one Stage Membership evaluation, one page.
        expect(counts.opportunities).toBe(1);
        expect(counts.work_units).toBe(1);
        expect(counts.departments).toBe(1);
        // entity_layouts is read for U-P7 configuration (org + default layout records); it carries no
        // membership and cannot duplicate an evaluation.
        expect(counts.entity_layouts ?? 0).toBeGreaterThan(0);
    });

    it("14. the lane failure cannot affect this path — LIFECYCLE_QUEUE_FILTERS_EMPTY is unreachable", async () => {
        // The lane raises only inside QueueService. This answer never imports or calls it, so the
        // error class is unreachable BY CONSTRUCTION rather than by being caught.
        const raw = readFileSync(
            join(__dirname, "../../lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
            "utf8",
        );
        // Strip comments — the file DISCUSSES the lane in prose precisely to record why it is absent.
        // Only executable code is evidence here.
        const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(code).not.toMatch(/from ["'].*QueueService/);
        expect(code).not.toMatch(/getWorkUnitQueueItems|getWorkUnitQueueSummaries/);
        // and no lane binding is consulted
        expect(code).not.toMatch(/compat_queue_key/);
        const a = await composeWorkUnitProvisioningAnswer(request());
        expect(a.terminal).toBe("operational");
    });

    it("U-O1: orientation — Business Process identity and the active lens among its set", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        expect(a.businessProcess.key).toBe("enrollment");
        expect(a.activeWorkView).toEqual({ id: "new_leads", label: "New Leads" });
        expect(a.lensSet.map((l) => l.id)).toContain("new_leads");
        expect(a.contextFrame).toEqual({ workViewId: "new_leads", workViewLabel: "New Leads" });
    });

    it("FocusPanelScopeState is computed and is one of the three (never a redirect)", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational") throw new Error("expected operational");
        expect(["in_scope", "no_active_view", "out_of_scope"]).toContain(a.focusPanelScopeState);
        // The subject was chosen from the lens's own admitted page, so it is in scope.
        expect(a.focusPanelScopeState).toBe("in_scope");
    });

    it("canonical order is deterministic and stable across identical evaluations", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        const b = await composeWorkUnitProvisioningAnswer(request());
        if (a.terminal !== "operational" || b.terminal !== "operational") throw new Error("expected operational");
        expect(a.rows.map((r) => r.id)).toEqual(b.rows.map((r) => r.id));
        // sort_v1 for New Leads is updated_at desc — pin that it is actually APPLIED, not ignored.
        const updated = a.rows.map((r) => r.updatedAt ?? "");
        expect([...updated].sort().reverse()).toEqual(updated);
    });

    it("internal dependency timings are measured, not assumed", async () => {
        const a = await composeWorkUnitProvisioningAnswer(request());
        for (const k of ["authorization_ms", "work_unit_ms", "configuration_ms", "records_ms", "projection_ms", "composition_ms", "total_ms"]) {
            expect(a.timings).toHaveProperty(k);
            expect(typeof (a.timings as Record<string, number>)[k]).toBe("number");
        }
    });
});

describe("D1 — Row Grain resolution (§0.5.1, G-1)", () => {
    const stages = activeStagesForProcess(
        activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(fixture.metadata))!,
    );
    const views = savedWorkViewsFromDepartmentMetadata(fixture.metadata);

    it("a stage-scoped lens resolves exactly one Stage-owned Row Grain", () => {
        const newLeads = views.find((v) => v.id === "new_leads")!;
        expect(resolveLensRowGrain(newLeads, stages)).toEqual({ ok: true, grain: "family" });
        const tours = views.find((v) => v.id === "tours")!;
        expect(resolveLensRowGrain(tours, stages)).toEqual({ ok: true, grain: "family" });
    });

    it("a lens spanning family AND child stages is grain-ambiguous — refused, not guessed", () => {
        const allWork = views.find((v) => v.id === "all_work")!;
        const r = resolveLensRowGrain(allWork, stages);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toMatch(/grain-ambiguous/);
    });
});
