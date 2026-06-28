/**
 * In-memory Supabase mock for childcare operational enrollment service tests.
 */

import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

function nextId(prefix: string, n: number): string {
    return `${prefix}-${n}`;
}

export type OperationalEnrollmentMockStore = {
    child_enrollment_agreements: Row[];
    child_placements: Row[];
    schedule_patterns: Row[];
    schedule_assignments: Row[];
    child_attendance_events: Row[];
    locations: Row[];
    location_program_categories: Row[];
    customer_members: Row[];
    opportunities: Row[];
    opportunity_customer_members: Row[];
    org_settings: Row[];
};

export function createOperationalEnrollmentMockStore(
    seed?: Partial<OperationalEnrollmentMockStore>
): OperationalEnrollmentMockStore {
    return {
        child_enrollment_agreements: seed?.child_enrollment_agreements ?? [],
        child_placements: seed?.child_placements ?? [],
        schedule_patterns: seed?.schedule_patterns ?? [],
        schedule_assignments: seed?.schedule_assignments ?? [],
        child_attendance_events: seed?.child_attendance_events ?? [],
        locations: seed?.locations ?? [],
        location_program_categories: seed?.location_program_categories ?? [],
        customer_members: seed?.customer_members ?? [],
        opportunities: seed?.opportunities ?? [],
        opportunity_customer_members: seed?.opportunity_customer_members ?? [],
        org_settings: seed?.org_settings ?? [],
    };
}

type Filter = { col: string; op: "eq" | "in"; value: unknown };

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
    return rows.filter((row) => {
        for (const f of filters) {
            if (f.op === "eq" && row[f.col] !== f.value) return false;
            if (f.op === "in") {
                const set = f.value as unknown[];
                if (!set.includes(row[f.col])) return false;
            }
        }
        return true;
    });
}

export function createOperationalEnrollmentMockSupabase(
    store: OperationalEnrollmentMockStore
): SupabaseClient {
    const counters: Record<string, number> = {
        child_enrollment_agreements: 0,
        child_placements: 0,
        schedule_assignments: 0,
    };

    function tableRows(table: string): Row[] {
        return (store as Record<string, Row[]>)[table] ?? [];
    }

    function buildChain(table: string) {
        const filters: Filter[] = [];
        let orderCol: string | null = null;
        let orderAsc = true;
        let limitN: number | null = null;
        let pendingInsert: Row | null = null;
        let pendingUpdate: Row | null = null;
        let isUpdate = false;
        let isInsert = false;
        let isSelect = false;

        const chain: Record<string, unknown> = {};

        const self = () => chain;

        chain.select = vi.fn((cols?: string) => {
            isSelect = true;
            return chain;
        });

        chain.insert = vi.fn((row: Row) => {
            isInsert = true;
            pendingInsert = row;
            return chain;
        });

        chain.update = vi.fn((row: Row) => {
            isUpdate = true;
            pendingUpdate = row;
            return chain;
        });

        chain.eq = vi.fn((col: string, value: unknown) => {
            filters.push({ col, op: "eq", value });
            return chain;
        });

        chain.in = vi.fn((col: string, value: unknown[]) => {
            filters.push({ col, op: "in", value });
            return chain;
        });

        chain.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
            orderCol = col;
            orderAsc = opts?.ascending !== false;
            return chain;
        });

        chain.limit = vi.fn((n: number) => {
            limitN = n;
            return chain;
        });

        chain.maybeSingle = vi.fn(async () => {
            const rows = applyFilters(tableRows(table), filters);
            let sorted = rows;
            if (orderCol) {
                sorted = [...rows].sort((a, b) => {
                    const av = String(a[orderCol!] ?? "");
                    const bv = String(b[orderCol!] ?? "");
                    return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                });
            }
            if (limitN != null) sorted = sorted.slice(0, limitN);
            return { data: sorted[0] ?? null, error: null };
        });

        chain.single = vi.fn(async () => {
            if (isInsert && pendingInsert) {
                counters[table] = (counters[table] ?? 0) + 1;
                const id = nextId(table, counters[table]);
                const now = new Date().toISOString();
                const row = {
                    ...pendingInsert,
                    id,
                    created_at: now,
                    updated_at: now,
                    metadata: pendingInsert.metadata ?? {},
                };
                tableRows(table).push(row);
                return { data: clone(row), error: null };
            }

            if (isUpdate && pendingUpdate) {
                const rows = tableRows(table);
                const idx = rows.findIndex((r) =>
                    applyFilters([r], filters).length === 1
                );
                if (idx < 0) {
                    return { data: null, error: { message: "not found" } };
                }
                const updated = {
                    ...rows[idx],
                    ...pendingUpdate,
                    updated_at: new Date().toISOString(),
                };
                rows[idx] = updated;
                return { data: clone(updated), error: null };
            }

            const result = await (chain.maybeSingle as () => Promise<{ data: Row | null }>)();
            if (!result.data) {
                return { data: null, error: { message: "not found" } };
            }
            return { data: result.data, error: null };
        });

        chain.then = (onFulfilled: (v: { data: Row[] | Row | null; error: null | { message: string } }) => unknown) => {
            if (isUpdate && pendingUpdate) {
                const rows = tableRows(table);
                const idx = rows.findIndex((r) => applyFilters([r], filters).length === 1);
                if (idx < 0) {
                    return Promise.resolve(onFulfilled({ data: null, error: { message: "not found" } }));
                }
                const updated = {
                    ...rows[idx],
                    ...pendingUpdate,
                    updated_at: new Date().toISOString(),
                };
                rows[idx] = updated;
                return Promise.resolve(onFulfilled({ data: clone(updated), error: null }));
            }

            const rows = applyFilters(tableRows(table), filters);
            let sorted = rows;
            if (orderCol) {
                sorted = [...rows].sort((a, b) => {
                    const av = String(a[orderCol!] ?? "");
                    const bv = String(b[orderCol!] ?? "");
                    return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                });
            }
            if (limitN != null) sorted = sorted.slice(0, limitN);
            return Promise.resolve(onFulfilled({ data: clone(sorted), error: null }));
        };

        return chain;
    }

    const from = vi.fn((table: string) => buildChain(table));

    return { from } as unknown as SupabaseClient;
}

export const ORG_ID = "org-1";
export const SITE_ID = "site-1";
export const UNIT_ID = "unit-1";
export const MEMBER_ID = "member-1";
export const PROGRAM_ID = "program-1";
export const PATTERN_ID = "pattern-1";

export function seedOperationalEnrollmentFixtures(): OperationalEnrollmentMockStore {
    return createOperationalEnrollmentMockStore({
        customer_members: [
            {
                id: MEMBER_ID,
                org_id: ORG_ID,
                customer_id: "cust-1",
                person_id: "person-1",
            },
        ],
        locations: [
            { id: SITE_ID, org_id: ORG_ID, label: "Main Campus", location_type: "site" },
            {
                id: UNIT_ID,
                org_id: ORG_ID,
                label: "Infant A",
                location_type: "unit",
                parent_location_id: SITE_ID,
            },
        ],
        location_program_categories: [
            {
                id: PROGRAM_ID,
                org_id: ORG_ID,
                location_id: SITE_ID,
                key: "infant",
                label: "Infant",
                is_active: true,
            },
        ],
        schedule_patterns: [
            {
                id: PATTERN_ID,
                org_id: ORG_ID,
                site_location_id: SITE_ID,
                key: "full_time",
                label: "Full Time",
                schedule_type_key: "full_time",
                weekdays: [1, 2, 3, 4, 5],
                sort_order: 10,
                is_active: true,
                metadata: {},
                created_at: "2026-01-01T00:00:00Z",
                updated_at: null,
            },
        ],
    });
}
