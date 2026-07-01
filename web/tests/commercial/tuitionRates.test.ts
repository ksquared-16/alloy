import { describe, it, expect } from "vitest";
import {
    formatRateCents,
    parseDollarsToCents,
    tuitionRateCellKey,
    buildTuitionRateMap,
    buildLocationOnlyRateMap,
    isLocationOverride,
    resolveCellState,
    computeTuitionReadiness,
    diffRateMaps,
    type TuitionRateRow,
} from "@/lib/commercial/tuitionRates";

const VARIANT_A = "00000000-0000-0000-0000-000000000001";
const VARIANT_B = "00000000-0000-0000-0000-000000000002";

function makeRow(overrides: Partial<TuitionRateRow> = {}): TuitionRateRow {
    return {
        id: "r1",
        org_id: "org1",
        location_id: null,
        variant_id: VARIANT_A,
        cadence_key: "monthly",
        payer_type: "private_pay",
        rate_cents: 120000,
        is_active: true,
        not_offered: false,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        ...overrides,
    };
}

describe("formatRateCents", () => {
    it("formats whole dollars without cents", () => {
        expect(formatRateCents(120000)).toBe("$1,200");
    });
    it("formats fractional cents", () => {
        expect(formatRateCents(99999)).toBe("$999.99");
    });
    it("formats zero", () => {
        expect(formatRateCents(0)).toBe("$0");
    });
});

describe("parseDollarsToCents", () => {
    it("parses plain number", () => expect(parseDollarsToCents("1200")).toBe(120000));
    it("parses dollar sign", () => expect(parseDollarsToCents("$1,200.00")).toBe(120000));
    it("returns null for empty", () => expect(parseDollarsToCents("")).toBeNull());
    it("returns null for negative", () => expect(parseDollarsToCents("-5")).toBeNull());
    it("returns null for non-numeric", () => expect(parseDollarsToCents("abc")).toBeNull());
});

describe("tuitionRateCellKey", () => {
    it("produces a stable compound key from variant_id and cadence_key", () => {
        expect(tuitionRateCellKey(VARIANT_A, "monthly")).toBe(`${VARIANT_A}::monthly`);
    });
    it("different variant_ids produce different keys", () => {
        expect(tuitionRateCellKey(VARIANT_A, "monthly")).not.toBe(
            tuitionRateCellKey(VARIANT_B, "monthly"),
        );
    });
    it("different cadence_keys produce different keys", () => {
        expect(tuitionRateCellKey(VARIANT_A, "monthly")).not.toBe(
            tuitionRateCellKey(VARIANT_A, "weekly"),
        );
    });
});

describe("buildTuitionRateMap", () => {
    const orgRow = makeRow({ id: "org-r", location_id: null });
    const locRow = makeRow({ id: "loc-r", location_id: "loc1" });
    const rates = [orgRow, locRow];

    it("org scope: only returns org rows", () => {
        const map = buildTuitionRateMap(rates, null);
        const key = tuitionRateCellKey(VARIANT_A, "monthly");
        expect(map.get(key)?.id).toBe("org-r");
    });

    it("location scope: location override wins", () => {
        const map = buildTuitionRateMap(rates, "loc1");
        const key = tuitionRateCellKey(VARIANT_A, "monthly");
        expect(map.get(key)?.id).toBe("loc-r");
    });

    it("location scope with no override: falls back to org row", () => {
        const map = buildTuitionRateMap([orgRow], "loc1");
        const key = tuitionRateCellKey(VARIANT_A, "monthly");
        expect(map.get(key)?.id).toBe("org-r");
    });

    it("handles multiple variants", () => {
        const rowB = makeRow({ id: "org-r-b", variant_id: VARIANT_B, cadence_key: "weekly" });
        const map = buildTuitionRateMap([orgRow, rowB], null);
        expect(map.get(tuitionRateCellKey(VARIANT_A, "monthly"))?.id).toBe("org-r");
        expect(map.get(tuitionRateCellKey(VARIANT_B, "weekly"))?.id).toBe("org-r-b");
    });
});

describe("buildLocationOnlyRateMap", () => {
    it("excludes org rows", () => {
        const orgRow = makeRow({ id: "org-r", location_id: null });
        const locRow = makeRow({ id: "loc-r", location_id: "loc1" });
        const map = buildLocationOnlyRateMap([orgRow, locRow], "loc1");
        const key = tuitionRateCellKey(VARIANT_A, "monthly");
        expect(map.get(key)?.id).toBe("loc-r");
        expect(map.size).toBe(1);
    });
});

describe("isLocationOverride", () => {
    it("true when row belongs to the location", () => {
        expect(isLocationOverride(makeRow({ location_id: "loc1" }), "loc1")).toBe(true);
    });
    it("false when row is org default", () => {
        expect(isLocationOverride(makeRow({ location_id: null }), "loc1")).toBe(false);
    });
    it("false in org scope", () => {
        expect(isLocationOverride(makeRow({ location_id: "loc1" }), null)).toBe(false);
    });
});

describe("resolveCellState", () => {
    it("returns unset when no row", () => {
        expect(resolveCellState(undefined, undefined, null)).toEqual({ kind: "unset" });
    });

    it("returns not_offered state", () => {
        const r = makeRow({ not_offered: true, location_id: null });
        expect(resolveCellState(r, r, null).kind).toBe("not_offered");
    });

    it("inherited row from org at location scope", () => {
        const orgRow = makeRow({ location_id: null, rate_cents: 80000 });
        const state = resolveCellState(orgRow, orgRow, "loc1");
        expect(state.kind).toBe("rate");
        if (state.kind === "rate") {
            expect(state.isInherited).toBe(true);
            expect(state.isOverride).toBe(false);
            expect(state.rate_cents).toBe(80000);
        }
    });

    it("location override row", () => {
        const locRow = makeRow({ location_id: "loc1", rate_cents: 90000 });
        const orgRow = makeRow({ location_id: null, rate_cents: 80000 });
        const state = resolveCellState(locRow, orgRow, "loc1");
        expect(state.kind).toBe("rate");
        if (state.kind === "rate") {
            expect(state.isOverride).toBe(true);
            expect(state.isInherited).toBe(false);
        }
    });
});

describe("computeTuitionReadiness", () => {
    it("returns 0% when no rates", () => {
        const r = computeTuitionReadiness([VARIANT_A], ["monthly"], []);
        expect(r.percentComplete).toBe(0);
        expect(r.missing).toBe(1);
    });

    it("counts configured vs not_offered vs missing", () => {
        const rates: TuitionRateRow[] = [
            makeRow({ variant_id: VARIANT_A, cadence_key: "monthly", rate_cents: 100000 }),
            makeRow({ variant_id: VARIANT_A, cadence_key: "weekly", not_offered: true }),
            // VARIANT_B / monthly missing
        ];
        const r = computeTuitionReadiness(
            [VARIANT_A, VARIANT_B],
            ["monthly", "weekly"],
            rates,
        );
        expect(r.configured).toBe(1);
        expect(r.notOffered).toBe(1);
        expect(r.missing).toBe(2);
        expect(r.total).toBe(4);
        expect(r.percentComplete).toBe(50);
    });

    it("100% when all configured or not_offered", () => {
        const rates: TuitionRateRow[] = [
            makeRow({ variant_id: VARIANT_A, cadence_key: "monthly", rate_cents: 100000 }),
            makeRow({ variant_id: VARIANT_A, cadence_key: "weekly", not_offered: true }),
        ];
        const r = computeTuitionReadiness([VARIANT_A], ["monthly", "weekly"], rates);
        expect(r.percentComplete).toBe(100);
    });
});

describe("diffRateMaps", () => {
    const key = tuitionRateCellKey(VARIANT_A, "monthly");

    it("returns unset when neither map has the key", () => {
        expect(diffRateMaps(new Map(), new Map(), key).kind).toBe("unset");
    });

    it("org_only when only org has a row", () => {
        const orgMap = new Map([[key, makeRow()]]);
        expect(diffRateMaps(orgMap, new Map(), key).kind).toBe("org_only");
    });

    it("same when rates match", () => {
        const row = makeRow();
        const orgMap = new Map([[key, row]]);
        const locMap = new Map([[key, { ...row, location_id: "loc1" }]]);
        expect(diffRateMaps(orgMap, locMap, key).kind).toBe("same");
    });

    it("location_override when rates differ", () => {
        const orgRow = makeRow({ rate_cents: 80000 });
        const locRow = makeRow({ location_id: "loc1", rate_cents: 90000 });
        const orgMap = new Map([[key, orgRow]]);
        const locMap = new Map([[key, locRow]]);
        expect(diffRateMaps(orgMap, locMap, key).kind).toBe("location_override");
    });

    it("not_offered_override when not_offered differs", () => {
        const orgRow = makeRow({ not_offered: false });
        const locRow = makeRow({ location_id: "loc1", not_offered: true });
        const orgMap = new Map([[key, orgRow]]);
        const locMap = new Map([[key, locRow]]);
        expect(diffRateMaps(orgMap, locMap, key).kind).toBe("not_offered_override");
    });
});
