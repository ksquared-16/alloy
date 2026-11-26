/**
 * WS0-A — restricted callers never receive values outside their access scope.
 *
 * ROUTE-LEVEL, REAL CHAIN. The real route handlers run the real `requireAnalyticsReadAccess`, the
 * real `accessScope` helpers, the real MetricEngine and the real resolvers against an in-memory
 * service-role client that evaluates every filter a query actually sends. Only the session bundle
 * (who is calling) and the client factory are substituted. A missing `.in("site_location_id", …)`
 * therefore returns other sites' rows here exactly as Postgres would.
 *
 * Each restricted case is paired with the unrestricted administrator on the same seed, so the test
 * proves both halves: the narrowing happens, and the intended org-wide answer is kept.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySupabase, type Row } from "../harness/inMemorySupabase";
import { buildRequest, invokeRoute, routeParams } from "../harness/routeInvoker";

const ORG = "11111111-1111-4111-8111-111111111111";
const S1 = "aaaaaaaa-0000-4000-8000-000000000001";
const S2 = "aaaaaaaa-0000-4000-8000-000000000002";
const R1 = "aaaaaaaa-0000-4000-8000-0000000000r1";
const D1 = "dddddddd-0000-4000-8000-000000000001";
const D2 = "dddddddd-0000-4000-8000-000000000002";
const WU1 = "eeeeeeee-0000-4000-8000-0000000000w1";
const WU2 = "eeeeeeee-0000-4000-8000-0000000000w2";
const DEF_ID = "ffffffff-0000-4000-8000-000000000001";

type Bundle = {
    ok: true;
    orgId: string;
    departmentScope: "all" | "restricted";
    allowedDepartmentIds: string[];
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: string[];
    roleKeys: string[];
    permissionKeys: string[];
    portalEligible: boolean;
};

function bundle(over: Partial<Bundle>): Bundle {
    return {
        ok: true,
        orgId: ORG,
        departmentScope: "all",
        allowedDepartmentIds: [],
        siteScope: "all",
        allowedSiteLocationIds: [],
        roleKeys: ["admin"],
        permissionKeys: ["reports.read", "reports.write"],
        portalEligible: true,
        ...over,
    };
}

const ADMIN = bundle({});
const SITE_RESTRICTED = bundle({ siteScope: "restricted", allowedSiteLocationIds: [S1], permissionKeys: ["reports.read"] });
const SITE_RESTRICTED_WRITER = bundle({ siteScope: "restricted", allowedSiteLocationIds: [S1] });
const DEPT_RESTRICTED = bundle({ departmentScope: "restricted", allowedDepartmentIds: [D1], permissionKeys: ["reports.read"] });
const NOTHING_ALLOWED = bundle({ siteScope: "restricted", allowedSiteLocationIds: [], permissionKeys: ["reports.read"] });

const state = vi.hoisted(() => ({
    bundle: null as unknown,
    db: null as unknown,
}));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return {
        ...actual,
        loadAdminAccessBundleCached: vi.fn(async () => state.bundle),
        getAdminAccessContextCached: vi.fn(async () => state.bundle),
    };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return {
        ...actual,
        getAdminContextCached: vi.fn(async () => ({ ok: true, orgId: ORG, role: "admin", userId: "u-1" })),
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => state.db) }));

import { GET as resolveGET } from "@/app/api/admin/metrics/resolve/route";
import { GET as trendsGET } from "@/app/api/admin/metrics/trends/route";
import { GET as renderGET } from "@/app/api/admin/analytics/render/route";
import { POST as previewPOST } from "@/app/api/admin/analytics/metrics/[id]/preview/route";
import { POST as definitionSnapshotPOST } from "@/app/api/admin/analytics/metrics/[id]/snapshot/route";
import { GET as definitionTrendGET } from "@/app/api/admin/analytics/metrics/[id]/trend/route";

/**
 * The harness plus the two things these resolvers need beyond it: `.not(col, "is", null)` and
 * `rpc`. Every table read and every RPC call is recorded so a test can prove a stored value was
 * NOT consulted, not merely that the answer happened to differ.
 */
class MetricsDb extends InMemorySupabase {
    readTables: string[] = [];
    rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    override from(table: string) {
        this.readTables.push(table);
        const qb = super.from(table) as unknown as Record<string, unknown>;
        if (typeof qb.not !== "function") {
            const proto = Object.getPrototypeOf(qb) as Record<string, unknown>;
            proto.not = function (this: { filters: Array<(r: Row) => boolean> }, col: string, op: string, val: unknown) {
                if (op === "is" && val === null) {
                    this.filters.push((r) => r[col] != null);
                    return this;
                }
                throw new Error(`MetricsDb.not: unsupported ${col} ${op}`);
            };
        }
        return qb as unknown as ReturnType<InMemorySupabase["from"]>;
    }

    async rpc(name: string, args: Record<string, unknown>) {
        this.rpcCalls.push({ name, args });
        if (name === "count_active_lead_participations") {
            // Distinguishable answers per narrowing so the response proves which call was made.
            const locs = args.p_location_ids as string[] | null;
            if (locs == null) return { data: 7, error: null };
            return { data: locs.includes(S2) ? 7 : 3, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${name}` } };
    }
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function seed(): MetricsDb {
    const db = new MetricsDb();
    db.seed("locations", [
        { id: S1, org_id: ORG, location_type: "site", is_active: true, parent_location_id: null },
        { id: S2, org_id: ORG, location_type: "site", is_active: true, parent_location_id: null },
        { id: R1, org_id: ORG, location_type: "unit", is_active: true, parent_location_id: S1 },
    ]);
    db.seed("work_units", [
        { id: WU1, org_id: ORG, department_id: D1 },
        { id: WU2, org_id: ORG, department_id: D2 },
    ]);
    db.seed("child_attendance_events", [
        { org_id: ORG, site_location_id: S1, entry_type: "correction", event_at: minutesAgo(30) },
        { org_id: ORG, site_location_id: S1, entry_type: "fact", event_at: minutesAgo(30) },
        { org_id: ORG, site_location_id: S2, entry_type: "fact", event_at: minutesAgo(30) },
        { org_id: ORG, site_location_id: S2, entry_type: "fact", event_at: minutesAgo(30) },
    ]);
    db.seed("consumption_events", [
        { org_id: ORG, source_family: "attendance", status: "recorded", location_id: S1 },
        { org_id: ORG, source_family: "attendance", status: "recorded", location_id: S2 },
        { org_id: ORG, source_family: "attendance", status: "recorded", location_id: S2 },
    ]);
    db.seed("workflow_runs", [
        { org_id: ORG, status: "failed", started_at: minutesAgo(30) },
        { org_id: ORG, status: "succeeded", started_at: minutesAgo(30) },
    ]);
    // Canonical snapshots — the org figure and S1's figure, two points each for trends.
    db.seed("metric_snapshots", [
        snap("org", null, 99, minutesAgo(10)),
        snap("org", null, 90, minutesAgo(20)),
        snap("site", S1, 5, minutesAgo(10)),
        snap("site", S1, 4, minutesAgo(20)),
    ]);
    db.seed("metric_definitions", [
        {
            id: DEF_ID,
            org_id: ORG,
            key: "lead_count",
            label: "Lead Count",
            description: "",
            source_type: "oip_adapter",
            source_key: "enrollment.lead_count",
            aggregation: "count",
            filter_config: {},
            dimension_config: {},
            default_period_config: { version: 1, kind: "rolling", days: 30 },
            unit: "count",
            precision: 0,
            is_kpi: false,
            target_config: null,
            threshold_config: null,
            status: "active",
        },
    ]);
    return db;
}

function snap(scopeType: string, scopeId: string | null, value: number, computedAt: string): Row {
    return {
        id: `snap-${scopeType}-${scopeId ?? "org"}-${value}`,
        org_id: ORG,
        metric_key: "enrollment.active_leads",
        window_key: "rolling_30d",
        scope_type: scopeType,
        scope_id: scopeId,
        dimension_key: null,
        dimension_value: null,
        value_numeric: value,
        value_json: {},
        computed_at: computedAt,
    };
}

let db: MetricsDb;
type IdCtx = { params: Promise<{ id: string }> };

beforeEach(() => {
    db = seed();
    state.db = db;
    state.bundle = ADMIN;
});

type ResolveBody = {
    metrics: Array<{ metric_key: string; value: number | null; resolve_mode: string; meta?: Record<string, unknown> }>;
    error?: string;
};

async function resolve(as: Bundle, query: Record<string, string>) {
    state.bundle = as;
    return invokeRoute<ResolveBody>(resolveGET, buildRequest({ path: "/api/admin/metrics/resolve", query }));
}

function metric(body: ResolveBody, key: string) {
    const m = body.metrics.find((x) => x.metric_key === key);
    if (!m) throw new Error(`no ${key} in response`);
    return m;
}

describe("WS0-A — enrollment: an omitted site narrows to the caller's sites, never widens", () => {
    it("site-restricted caller at org scope is counted over THEIR sites (site + descendants), not the org", async () => {
        const res = await resolve(SITE_RESTRICTED, { keys: "enrollment.active_leads" });
        expect(res.status).toBe(200);
        expect(metric(res.body, "enrollment.active_leads").value).toBe(3);
        const call = db.rpcCalls.find((c) => c.name === "count_active_lead_participations")!;
        expect(new Set(call.args.p_location_ids as string[])).toEqual(new Set([S1, R1]));
    });

    it("unrestricted administrator keeps the org-wide count (no location narrowing)", async () => {
        const res = await resolve(ADMIN, { keys: "enrollment.active_leads" });
        expect(metric(res.body, "enrollment.active_leads").value).toBe(7);
        expect(db.rpcCalls[0]!.args.p_location_ids).toBeNull();
    });

    it("department-restricted caller without a work unit is refused, not counted across departments", async () => {
        const res = await resolve(DEPT_RESTRICTED, { keys: "enrollment.active_leads,enrollment.waitlisted" });
        expect(res.status).toBe(200);
        for (const key of ["enrollment.active_leads", "enrollment.waitlisted"]) {
            const m = metric(res.body, key);
            expect(m.value).toBeNull();
            expect(m.meta).toMatchObject({ unavailable: true, unavailable_reason: "department_scope_requires_work_unit" });
        }
        expect(db.rpcCalls).toHaveLength(0);
    });

    it("a work unit outside the caller's departments is refused at the route (403)", async () => {
        const res = await resolve(DEPT_RESTRICTED, { keys: "enrollment.active_leads", work_unit_id: WU2 });
        expect(res.status).toBe(403);
        expect(db.rpcCalls).toHaveLength(0);
    });

    it("a work unit inside the caller's departments resolves", async () => {
        const res = await resolve(DEPT_RESTRICTED, { keys: "enrollment.active_leads", work_unit_id: WU1 });
        expect(res.status).toBe(200);
        expect(db.rpcCalls[0]!.args.p_work_unit_id).toBe(WU1);
    });

    it("a scope that admits nothing is UNAVAILABLE, never a numeric zero", async () => {
        const res = await resolve(NOTHING_ALLOWED, { keys: "enrollment.active_leads,ops.needs_attention_count" });
        for (const key of ["enrollment.active_leads", "ops.needs_attention_count"]) {
            const m = metric(res.body, key);
            expect(m.value).toBeNull();
            expect(m.meta).toMatchObject({ unavailable: true, unavailable_reason: "scope_impossible" });
        }
    });

    it("a site outside the caller's scope is refused at the route (403)", async () => {
        const res = await resolve(SITE_RESTRICTED, { keys: "enrollment.active_leads", site_id: S2 });
        expect(res.status).toBe(403);
    });
});

describe("WS0-A — attendance health applies the readable sites at org scope", () => {
    it("correction rate: restricted caller reads only S1; admin reads every site", async () => {
        const restricted = await resolve(SITE_RESTRICTED, { keys: "attendance.correction_rate" });
        expect(metric(restricted.body, "attendance.correction_rate").value).toBe(0.5);
        const admin = await resolve(ADMIN, { keys: "attendance.correction_rate" });
        expect(metric(admin.body, "attendance.correction_rate").value).toBe(0.25);
    });

    it("consequence review count: restricted caller counts S1 only; admin counts all", async () => {
        const restricted = await resolve(SITE_RESTRICTED, { keys: "attendance.consequence_review_count" });
        expect(metric(restricted.body, "attendance.consequence_review_count").value).toBe(1);
        const admin = await resolve(ADMIN, { keys: "attendance.consequence_review_count" });
        expect(metric(admin.body, "attendance.consequence_review_count").value).toBe(3);
    });
});

describe("WS0-A — org-only metrics are never labelled as scoped, never served to restricted callers", () => {
    it("workflow failure rate: admin at org scope gets the org figure", async () => {
        const res = await resolve(ADMIN, { keys: "ops.workflow_failure_rate" });
        expect(metric(res.body, "ops.workflow_failure_rate").value).toBe(0.5);
    });

    it("workflow failure rate at a site is unavailable (org_scope_only), and workflow_runs is not read", async () => {
        const res = await resolve(ADMIN, { keys: "ops.workflow_failure_rate", site_id: S1 });
        const m = metric(res.body, "ops.workflow_failure_rate");
        expect(m.value).toBeNull();
        expect(m.meta).toMatchObject({ unavailable_reason: "org_scope_only", scope_unsupported: true, org_scope_only: true });
        expect(db.readTables).not.toContain("workflow_runs");
    });

    it("org-only metrics refuse a restricted caller at org scope", async () => {
        const keys = [
            "ops.workflow_failure_rate",
            "comms.delivery_rate",
            "comms.reply_rate",
            "comms.failed_delivery_count",
            "forms.completion_rate",
            "forms.packet_completion_time",
            "attendance.unmapped_event_count",
            "trust.governed_decisions_created",
        ];
        const res = await resolve(SITE_RESTRICTED, { keys: keys.join(",") });
        for (const key of keys) {
            const m = metric(res.body, key);
            expect(m.value, key).toBeNull();
            expect(m.meta?.unavailable_reason, key).toBe("org_scope_only_restricted_caller");
        }
        for (const table of ["workflow_runs", "communication_messages", "communication_delivery_events", "form_submissions", "form_packet_sessions"]) {
            expect(db.readTables, table).not.toContain(table);
        }
    });
});

describe("WS0-A — snapshot mode enforces exactly what live mode enforces", () => {
    it("unrestricted admin: snapshot mode serves the stored org figure", async () => {
        const res = await resolve(ADMIN, { keys: "enrollment.active_leads", mode: "snapshot" });
        const m = metric(res.body, "enrollment.active_leads");
        expect(m.value).toBe(99);
        expect(m.resolve_mode).toBe("snapshot");
    });

    it("restricted caller omitting site_id: the stored ORG figure is not read; live narrowed value equals live mode", async () => {
        const snapshot = await resolve(SITE_RESTRICTED, { keys: "enrollment.active_leads", mode: "snapshot" });
        const live = await resolve(SITE_RESTRICTED, { keys: "enrollment.active_leads", mode: "live" });
        const s = metric(snapshot.body, "enrollment.active_leads");
        expect(s.value).not.toBe(99);
        expect(s.value).toBe(metric(live.body, "enrollment.active_leads").value);
        expect(s.resolve_mode).toBe("live");
        expect(db.readTables).not.toContain("metric_snapshots");
    });

    it("site-restricted caller on THEIR site may read that site's canonical snapshot", async () => {
        const res = await resolve(SITE_RESTRICTED, { keys: "enrollment.active_leads", mode: "snapshot", site_id: S1 });
        const m = metric(res.body, "enrollment.active_leads");
        expect(m.value).toBe(5);
        expect(m.resolve_mode).toBe("snapshot");
    });

    it("department-restricted caller never reads a canonical snapshot (org or site)", async () => {
        const res = await resolve(DEPT_RESTRICTED, { keys: "enrollment.active_leads", mode: "snapshot", site_id: S1 });
        expect(metric(res.body, "enrollment.active_leads").value).toBeNull();
        expect(db.readTables).not.toContain("metric_snapshots");
    });
});

type TrendsBody = { trends: Array<{ metric_key: string; has_trend: boolean; sparkline_y: number[]; unavailable_reason?: string }> };

async function trends(as: Bundle, query: Record<string, string>) {
    state.bundle = as;
    return invokeRoute<TrendsBody>(trendsGET, buildRequest({ path: "/api/admin/metrics/trends", query }));
}

describe("WS0-A — trends never hand a restricted caller the stored org series", () => {
    it("admin: org trend is read from canonical snapshots", async () => {
        const res = await trends(ADMIN, { keys: "enrollment.active_leads" });
        expect(res.status).toBe(200);
        expect(res.body.trends[0]!.has_trend).toBe(true);
    });

    it("restricted caller omitting site_id: unavailable, and metric_snapshots is not read", async () => {
        const res = await trends(SITE_RESTRICTED, { keys: "enrollment.active_leads" });
        expect(res.status).toBe(200);
        const t = res.body.trends[0]!;
        expect(t.has_trend).toBe(false);
        expect(t.sparkline_y).toEqual([]);
        expect(t.unavailable_reason).toBe("snapshot_scope_wider_than_caller");
        expect(db.readTables).not.toContain("metric_snapshots");
    });

    it("restricted caller on their own site gets that site's series", async () => {
        const res = await trends(SITE_RESTRICTED, { keys: "enrollment.active_leads", site_id: S1 });
        expect(res.body.trends[0]!.has_trend).toBe(true);
        expect(res.body.trends[0]!.unavailable_reason).toBeUndefined();
    });

    it("restricted caller naming another site is refused (403)", async () => {
        const res = await trends(SITE_RESTRICTED, { keys: "enrollment.active_leads", site_id: S2 });
        expect(res.status).toBe(403);
    });

    it("an org-only metric asked at a site has no series", async () => {
        const res = await trends(ADMIN, { keys: "comms.delivery_rate", site_id: S1 });
        expect(res.body.trends[0]!.unavailable_reason).toBe("org_scope_only");
    });
});

describe("WS0-A — V2 database-configured definitions never widen the caller's scope", () => {
    it("preview evaluates with the caller's scope: restricted caller is narrowed, admin is not", async () => {
        state.bundle = SITE_RESTRICTED;
        const restricted = await invokeRoute<{ data: { evaluation: { value: number | null } } }, IdCtx>(
            previewPOST,
            buildRequest({ method: "POST", path: `/api/admin/analytics/metrics/${DEF_ID}/preview`, body: {} }),
            routeParams({ id: DEF_ID }),
        );
        expect(restricted.status).toBe(200);
        expect(restricted.body.data.evaluation.value).toBe(3);

        state.bundle = ADMIN;
        const admin = await invokeRoute<{ data: { evaluation: { value: number | null } } }, IdCtx>(
            previewPOST,
            buildRequest({ method: "POST", path: `/api/admin/analytics/metrics/${DEF_ID}/preview`, body: {} }),
            routeParams({ id: DEF_ID }),
        );
        expect(admin.body.data.evaluation.value).toBe(7);
    });

    it("a site pinned in the stored definition outside the caller's scope evaluates to unavailable", async () => {
        (db.rows("metric_definitions")[0] as Row).filter_config = { filters: { site_id: S2 } };
        state.bundle = SITE_RESTRICTED;
        const res = await invokeRoute<{ data: { evaluation: { value: number | null; meta: Record<string, unknown> } } }, IdCtx>(
            previewPOST,
            buildRequest({ method: "POST", path: `/api/admin/analytics/metrics/${DEF_ID}/preview`, body: {} }),
            routeParams({ id: DEF_ID }),
        );
        expect(res.body.data.evaluation.value).toBeNull();
        expect(res.body.data.evaluation.meta).toMatchObject({ unavailable_reason: "scope_impossible" });
        expect(db.rpcCalls).toHaveLength(0);
    });

    it("definition trend requires analytics read authority", async () => {
        state.bundle = bundle({ permissionKeys: [] });
        const res = await invokeRoute(
            definitionTrendGET,
            buildRequest({ path: `/api/admin/analytics/metrics/${DEF_ID}/trend` }),
            routeParams({ id: DEF_ID }),
        );
        expect(res.status).toBe(403);
    });

    it("render requires analytics read authority", async () => {
        state.bundle = bundle({ permissionKeys: [] });
        const res = await invokeRoute(renderGET, buildRequest({ path: "/api/admin/analytics/render", query: { surface: "workspace_header" } }));
        expect(res.status).toBe(403);
    });

    it("render refuses org-context platform snapshots to a restricted caller; admin is served", async () => {
        state.bundle = SITE_RESTRICTED;
        const refused = await invokeRoute(renderGET, buildRequest({ path: "/api/admin/analytics/render", query: { surface: "workspace_header" } }));
        expect(refused.status).toBe(403);
        state.bundle = ADMIN;
        const served = await invokeRoute(renderGET, buildRequest({ path: "/api/admin/analytics/render", query: { surface: "workspace_header" } }));
        expect(served.status).toBe(200);
    });

    it("materialisation stores the canonical value but withholds it from a restricted writer", async () => {
        state.bundle = SITE_RESTRICTED_WRITER;
        const restricted = await invokeRoute<{ data: { evaluation: unknown; evaluation_withheld?: string; snapshot_id: string } }, IdCtx>(
            definitionSnapshotPOST,
            buildRequest({ method: "POST", path: `/api/admin/analytics/metrics/${DEF_ID}/snapshot` }),
            routeParams({ id: DEF_ID }),
        );
        expect(restricted.status).toBe(200);
        expect(restricted.body.data.evaluation).toBeNull();
        expect(restricted.body.data.evaluation_withheld).toBe("snapshot_scope_wider_than_caller");
        // What was STORED is the canonical org value (the unnarrowed count), never the writer's view.
        const stored = db.rows("metric_platform_snapshots");
        expect(stored).toHaveLength(1);
        expect(stored[0]!.value).toBe(7);
        expect(db.rpcCalls[0]!.args.p_location_ids).toBeNull();

        state.bundle = ADMIN;
        const admin = await invokeRoute<{ data: { evaluation: { value: number } } }, IdCtx>(
            definitionSnapshotPOST,
            buildRequest({ method: "POST", path: `/api/admin/analytics/metrics/${DEF_ID}/snapshot` }),
            routeParams({ id: DEF_ID }),
        );
        expect(admin.body.data.evaluation.value).toBe(7);
    });

    it("definition trend: a restricted caller is evaluated live with their scope, never served the org series", async () => {
        db.seed("metric_platform_snapshots", [
            { id: "p1", org_id: ORG, metric_definition_id: DEF_ID, context_type: "org", context_id: null, value: 70, computed_at: minutesAgo(20), health_state: "unknown" },
            { id: "p2", org_id: ORG, metric_definition_id: DEF_ID, context_type: "org", context_id: null, value: 71, computed_at: minutesAgo(10), health_state: "unknown" },
        ]);
        state.bundle = SITE_RESTRICTED;
        const restricted = await invokeRoute<{ data: { series: unknown[]; comparison: { current: { value: number } } | null } }, IdCtx>(
            definitionTrendGET,
            buildRequest({ path: `/api/admin/analytics/metrics/${DEF_ID}/trend` }),
            routeParams({ id: DEF_ID }),
        );
        expect(restricted.status).toBe(200);
        expect(restricted.body.data.series).toEqual([]);

        state.bundle = ADMIN;
        const admin = await invokeRoute<{ data: { series: Array<{ value: number }> } }, IdCtx>(
            definitionTrendGET,
            buildRequest({ path: `/api/admin/analytics/metrics/${DEF_ID}/trend` }),
            routeParams({ id: DEF_ID }),
        );
        expect(admin.body.data.series.map((s) => s.value)).toEqual([70, 71]);
    });
});

