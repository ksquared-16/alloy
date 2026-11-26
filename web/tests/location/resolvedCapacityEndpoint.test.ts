/**
 * Slice 11 — the canonical resolved-capacity endpoint.
 *
 * Its entire reason for existing is that binding capacity is NOT
 * min(physical, licensed, operational). Canonical binding also considers
 * ratio-limited capacity, which is derived from ratio rules and tiers rather
 * than authored as a kind. A surface holding only the authored kinds and taking
 * their minimum prints a LARGER number than the room can operate at, and is
 * wrong exactly when ratio is the constraint.
 *
 * So the decisive lock here is parity with the canonical resolver, proven on a
 * fixture where a naive minimum and the canonical answer DISAGREE.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resolveOperationalCapacity } from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";
import type { ChildcareCapacityRuleRow, ChildcareRatioRuleRow, ChildcareRatioRuleTierRow } from "@/lib/childcareOperational/config/configRuleTypes";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const SITE = "site";
const ROOM = "tod1";
const TODAY = "2026-09-19";

const { mockGetAdminContextCached, mockCreateAdminClient, db } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    db: {
        locations: [] as Record<string, unknown>[],
        childcare_capacity_rules: [] as Record<string, unknown>[],
        childcare_ratio_rules: [] as Record<string, unknown>[],
        childcare_ratio_rule_tiers: [] as Record<string, unknown>[],
        childcare_operating_windows: [] as Record<string, unknown>[],
        childcare_schedule_rules: [] as Record<string, unknown>[],
    },
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", async () => {
    const actual = await vi.importActual<typeof import("@/lib/childcareOperational/operationalEnrollmentApi")>(
        "@/lib/childcareOperational/operationalEnrollmentApi",
    );
    return { ...actual, resolveOperationalEnrollmentTodayYmd: vi.fn().mockResolvedValue("2026-09-19") };
});

import { GET } from "@/app/api/admin/operational-config/resolved-capacity/route";

function supabaseStub() {
    const build = (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const rows = () => (db[table as keyof typeof db] ?? []).filter((r) => filters.every((f) => f(r)));
        const b: Record<string, unknown> = {};
        for (const m of ["select", "order", "or"]) b[m] = vi.fn(() => b);
        b.eq = vi.fn((c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; });
        b.in = vi.fn((c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c] as never)); return b; });
        b.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }));
        b.single = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }));
        b.then = (res: (v: unknown) => unknown) => res({ data: rows(), error: null });
        return b;
    };
    return { from: vi.fn((t: string) => build(t)) };
}

const loc = (o: Record<string, unknown>) => ({ org_id: ORG, is_active: true, metadata: {}, ...o });

const capRule = (o: Partial<ChildcareCapacityRuleRow>) => ({
    id: "c1", org_id: ORG, scope_type: "room", site_location_id: null, program_category_id: null,
    room_location_id: ROOM, age_group_key: null, capacity_kind: "physical", capacity: 24,
    effective_start: "2026-01-01", effective_end: null, source_key: "config", metadata: {},
    created_by: null, updated_by: null, created_at: "", updated_at: "", ...o,
}) as ChildcareCapacityRuleRow;

const ratioRule = (o: Partial<ChildcareRatioRuleRow>) => ({
    id: "rr1", org_id: ORG, scope_type: "room", site_location_id: null, program_category_id: null,
    room_location_id: ROOM, age_group_key: null, jurisdiction_key: null,
    effective_start: "2026-01-01", effective_end: null, source_key: "config", metadata: {},
    created_by: null, updated_by: null, created_at: "", updated_at: "", ...o,
}) as unknown as ChildcareRatioRuleRow;

const tier = (o: Partial<ChildcareRatioRuleTierRow>) => ({
    id: "t1", org_id: ORG, ratio_rule_id: "rr1", max_children: 8, required_staff: 1,
    created_at: "", updated_at: "", ...o,
}) as unknown as ChildcareRatioRuleTierRow;

function reset() {
    db.locations = [
        loc({ id: SITE, location_type: "site", unit_role: null, label: "North Campus", parent_location_id: null }),
        loc({ id: ROOM, location_type: "unit", unit_role: "operational_group", label: "Toddler 1", parent_location_id: SITE }),
    ];
    db.childcare_capacity_rules = [];
    db.childcare_ratio_rules = [];
    db.childcare_ratio_rule_tiers = [];
    db.childcare_operating_windows = [];
    db.childcare_schedule_rules = [];
}

beforeEach(() => {
    vi.clearAllMocks();
    reset();
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId: ORG, userId: "u-1", role: "admin" });
    mockCreateAdminClient.mockImplementation(() => supabaseStub());
});

async function get(qs: string) {
    const res = await GET(new NextRequest(`http://test/api/admin/operational-config/resolved-capacity${qs}`));
    return { status: res.status, body: (await res.json()) as Record<string, never> };
}

// ---------------------------------------------------------------------------
// 11-12 — the parity lock. This is the point of the endpoint.
// ---------------------------------------------------------------------------
describe("11-12. binding is delegated to the canonical resolver", () => {
    beforeEach(() => {
        // Authored kinds: physical 24, licensed 20, operational 18.
        // A naive min() over these answers 18.
        db.childcare_capacity_rules = [
            capRule({ id: "c1", capacity_kind: "physical", capacity: 24 }),
            capRule({ id: "c2", capacity_kind: "licensed", capacity: 20 }),
            capRule({ id: "c3", capacity_kind: "operational", capacity: 18 }),
        ] as unknown as Record<string, unknown>[];
        // Ratio caps the room at 8 children per staff tier — not an authored kind.
        db.childcare_ratio_rules = [ratioRule({})] as unknown as Record<string, unknown>[];
        db.childcare_ratio_rule_tiers = [tier({})] as unknown as Record<string, unknown>[];
    });

    it("returns exactly what the canonical resolver returns, field for field", async () => {
        const { body } = await get(`?room_location_id=${ROOM}`);
        const direct = resolveOperationalCapacity(
            {
                capacityRules: db.childcare_capacity_rules as unknown as ChildcareCapacityRuleRow[],
                ratioRules: db.childcare_ratio_rules as unknown as ChildcareRatioRuleRow[],
                ratioRuleTiers: db.childcare_ratio_rule_tiers as unknown as ChildcareRatioRuleTierRow[],
            },
            {
                orgId: ORG, locationId: ROOM, siteLocationId: SITE, programCategoryId: null,
                roomLocationId: ROOM, ageGroupKey: null, effectiveAt: TODAY,
            },
        );
        expect(body.resolution).toEqual(JSON.parse(JSON.stringify(direct)));
    });

    it("12. a naive min over the authored kinds DISAGREES with canonical binding", async () => {
        const { body } = await get(`?room_location_id=${ROOM}`);
        const r = body.resolution as unknown as {
            physicalCapacity: number | null; licensedCapacity: number | null;
            configuredCapacity: number | null; ratioConstrainedCapacity: number | null;
            bindingCapacity: number | null; limitingFactor: string | null;
        };
        const naive = Math.min(
            r.physicalCapacity ?? Infinity, r.licensedCapacity ?? Infinity, r.configuredCapacity ?? Infinity,
        );
        // The fixture is built so the two differ. If they ever matched, this lock
        // would be vacuous and could not catch a second-authority binding.
        expect(r.ratioConstrainedCapacity).not.toBeNull();
        expect(r.bindingCapacity).not.toBe(naive);
        expect(r.bindingCapacity).toBe(r.ratioConstrainedCapacity);
        expect(r.limitingFactor).toBe("ratio");
    });

    it("the route does no arithmetic of its own", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../app/api/admin/operational-config/resolved-capacity/route.ts"),
            "utf8",
        );
        expect(src).toContain("resolveOperationalCapacity(");
        expect(src).not.toMatch(/Math\.min|Math\.max/);
        expect(src).not.toMatch(/binding\s*=/);
        expect(src).not.toMatch(/\+\s*capacity|capacity\s*\+/);
    });
});

// ---------------------------------------------------------------------------
// 2 — context, and refusing to invent it.
// ---------------------------------------------------------------------------
describe("2. the endpoint reports what it cannot resolve rather than inventing it", () => {
    it("resolves a room with no capacity rules as not_configured, not zero", async () => {
        const { body } = await get(`?room_location_id=${ROOM}`);
        const r = body.resolution as unknown as { status: string; bindingCapacity: number | null };
        expect(r.status).toBe("not_configured");
        expect(r.bindingCapacity).toBeNull();
    });

    it("leaves occupancy null rather than substituting zero", async () => {
        db.childcare_capacity_rules = [capRule({ capacity_kind: "operational", capacity: 12 })] as unknown as Record<string, unknown>[];
        const { body } = await get(`?room_location_id=${ROOM}`);
        const r = body.resolution as unknown as { committedOccupancy: number | null; availableNow: number | null };
        // Zero occupancy would read as "empty"; unknown must stay unknown.
        expect(r.committedOccupancy).toBeNull();
        expect(r.availableNow).toBeNull();
    });

    it("resolves the site by ancestry for a NESTED room, not from its parent", async () => {
        db.locations.push(loc({ id: "room1", location_type: "unit", unit_role: "physical_space", label: "Room 1", parent_location_id: SITE }));
        db.locations.push(loc({ id: "nested", location_type: "unit", unit_role: "operational_group", label: "Toddler 2", parent_location_id: "room1" }));
        const { body } = await get("?room_location_id=nested");
        expect(body.siteLocationId).toBe(SITE);
    });

    it("uses the canonical working date when none is supplied, and honours one when given", async () => {
        expect((await get(`?room_location_id=${ROOM}`)).body.effectiveAt).toBe(TODAY);
        expect((await get(`?room_location_id=${ROOM}&effective_at=2026-03-01`)).body.effectiveAt).toBe("2026-03-01");
    });

    it("an effective date before a rule starts does not see that rule", async () => {
        db.childcare_capacity_rules = [
            capRule({ capacity_kind: "operational", capacity: 12, effective_start: "2026-06-01" }),
        ] as unknown as Record<string, unknown>[];
        const before = (await get(`?room_location_id=${ROOM}&effective_at=2026-01-01`)).body.resolution as unknown as { configuredCapacity: number | null };
        const after = (await get(`?room_location_id=${ROOM}&effective_at=2026-07-01`)).body.resolution as unknown as { configuredCapacity: number | null };
        expect(before.configuredCapacity).toBeNull();
        expect(after.configuredCapacity).toBe(12);
    });
});

// ---------------------------------------------------------------------------
// 23 — security.
// ---------------------------------------------------------------------------
describe("23. the endpoint does not leak another tenant's configuration", () => {
    it("refuses a room belonging to another org", async () => {
        db.locations.push(loc({ id: "foreign", org_id: OTHER_ORG, location_type: "unit", label: "Theirs", parent_location_id: SITE }));
        db.childcare_capacity_rules = [capRule({ org_id: OTHER_ORG, room_location_id: "foreign", capacity: 99 })] as unknown as Record<string, unknown>[];
        const res = await get("?room_location_id=foreign");
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain("99");
    });

    it("refuses an unknown room", async () => {
        expect((await get("?room_location_id=nope")).status).toBe(404);
    });

    it("refuses a SITE — capacity is resolved for rooms", async () => {
        expect((await get(`?room_location_id=${SITE}`)).status).toBe(404);
    });

    it("refuses a missing room id rather than resolving something arbitrary", async () => {
        const res = await get("");
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("invalid_input");
    });

    it("refuses an unauthenticated caller before touching any data", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await GET(new NextRequest(`http://test/api/admin/operational-config/resolved-capacity?room_location_id=${ROOM}`));
        expect(res.status).toBe(401);
        expect(mockCreateAdminClient).not.toHaveBeenCalled();
    });

    it("performs no mutation", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../app/api/admin/operational-config/resolved-capacity/route.ts"),
            "utf8",
        );
        expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
        expect(src).not.toContain("export async function POST");
    });
});
