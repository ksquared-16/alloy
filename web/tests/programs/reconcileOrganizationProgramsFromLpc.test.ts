import { describe, expect, it, vi } from "vitest";
import {
    classifyProgramAuthoritySources,
    reconcileOrganizationProgramsFromLpc,
} from "@/lib/programs/publication/reconcileOrganizationProgramsFromLpc";

type Row = Record<string, unknown>;

function createQueryable(rows: Row[]) {
    const state = { rows };
    const builder: {
        select: ReturnType<typeof vi.fn>;
        eq: ReturnType<typeof vi.fn>;
        is: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        then: (onFulfilled: (value: { data: Row[]; error: null }) => unknown) => unknown;
    } = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        is: vi.fn(() => builder),
        update: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        then: (onFulfilled) => onFulfilled({ data: state.rows, error: null }),
    };
    return { builder, state };
}

function createClient(tables: {
    location_program_categories: Row[];
    programs: Row[];
    program_drafts: Row[];
    program_offerings: Row[];
}) {
    return {
        from(table: keyof typeof tables) {
            if (table === "programs") {
                return {
                    select: () => ({
                        eq: () => Promise.resolve({ data: tables.programs, error: null }),
                        then: (resolve: (v: unknown) => unknown) =>
                            resolve({ data: tables.programs, error: null }),
                    }),
                    insert: (row: Row) => ({
                        select: () => ({
                            maybeSingle: async () => {
                                const inserted = {
                                    id: `program-${tables.programs.length + 1}`,
                                    org_id: row.org_id,
                                    program_key: row.program_key,
                                };
                                tables.programs.push(inserted);
                                return { data: inserted, error: null };
                            },
                        }),
                    }),
                };
            }
            if (table === "program_drafts") {
                return {
                    insert: async (row: Row) => {
                        tables.program_drafts.push(row);
                        return { data: null, error: null };
                    },
                };
            }
            if (table === "program_offerings") {
                const q = createQueryable(tables.program_offerings);
                return {
                    select: () => q.builder,
                };
            }
            // location_program_categories
            return {
                select: () => ({
                    eq: () => Promise.resolve({ data: tables.location_program_categories, error: null }),
                    then: (resolve: (v: unknown) => unknown) =>
                        resolve({ data: tables.location_program_categories, error: null }),
                }),
                update: (patch: Row) => {
                    const filters: Record<string, unknown> = {};
                    const chain = {
                        eq: (col: string, value: unknown) => {
                            filters[col] = value;
                            return chain;
                        },
                        is: (col: string, value: unknown) => {
                            filters[`is:${col}`] = value;
                            return chain;
                        },
                        select: async () => {
                            const linked: Row[] = [];
                            for (const row of tables.location_program_categories) {
                                if (filters.org_id && row.org_id !== filters.org_id) continue;
                                if (filters.key && row.key !== filters.key) continue;
                                if (filters["is:program_id"] === null && row.program_id != null) continue;
                                row.program_id = patch.program_id;
                                linked.push({ id: row.id ?? linked.length });
                            }
                            return { data: linked, error: null };
                        },
                    };
                    return chain;
                },
            };
        },
    } as never;
}

describe("Organization Programs reconciliation from LPC", () => {
    it("classifies source authorities without inventing ownership", () => {
        const classes = classifyProgramAuthoritySources();
        expect(classes.some((row) => row.classification === "location_owned_availability")).toBe(true);
        expect(classes.some((row) => row.source.includes("discount_programs"))).toBe(true);
        expect(
            classes.find((row) => row.classification === "location_owned_availability")?.note,
        ).toMatch(/Location-owned/i);
    });

    it("dry-run maps distinct LPC keys and does not write", async () => {
        const tables = {
            location_program_categories: [
                {
                    org_id: "org-1",
                    key: "preschool",
                    label: "Preschool",
                    created_at: "2026-01-01T00:00:00.000Z",
                    program_id: null,
                },
                {
                    org_id: "org-1",
                    key: " preschool ",
                    label: "Preschool North",
                    created_at: "2026-02-01T00:00:00.000Z",
                    program_id: null,
                },
                {
                    org_id: "org-1",
                    key: "infant",
                    label: "Infant",
                    created_at: "2026-01-02T00:00:00.000Z",
                    program_id: null,
                },
            ],
            programs: [] as Row[],
            program_drafts: [] as Row[],
            program_offerings: [{ org_id: "org-1", program_key: "preschool" }],
        };

        const report = await reconcileOrganizationProgramsFromLpc(createClient(tables), {
            orgId: "org-1",
            dryRun: true,
        });

        expect(report.counts.candidateKeys).toBe(2);
        expect(report.counts.programsInserted).toBe(2);
        expect(report.mappings.map((row) => row.programKey).sort()).toEqual(["infant", "preschool"]);
        expect(tables.programs).toHaveLength(0);
        expect(report.orphanOfferingKeys).toEqual([]);
    });

    it("applies inserts and remains idempotent on rerun", async () => {
        const tables = {
            location_program_categories: [
                {
                    id: "lpc-1",
                    org_id: "org-1",
                    key: "toddler",
                    label: "Toddler",
                    created_at: "2026-01-01T00:00:00.000Z",
                    program_id: null,
                },
            ],
            programs: [] as Row[],
            program_drafts: [] as Row[],
            program_offerings: [] as Row[],
        };
        const client = createClient(tables);

        const first = await reconcileOrganizationProgramsFromLpc(client, {
            orgId: "org-1",
            dryRun: false,
        });
        expect(first.counts.programsInserted).toBe(1);
        expect(first.counts.draftsInserted).toBe(1);
        expect(tables.programs).toHaveLength(1);
        expect(tables.program_drafts).toHaveLength(1);
        expect(tables.location_program_categories[0]?.program_id).toBe(tables.programs[0]?.id);

        const second = await reconcileOrganizationProgramsFromLpc(client, {
            orgId: "org-1",
            dryRun: false,
        });
        expect(second.counts.programsInserted).toBe(0);
        expect(second.mappings[0]?.action).toBe("link_only");
        expect(tables.programs).toHaveLength(1);
    });

    it("reports offering keys without LPC candidates as unresolved orphans", async () => {
        const tables = {
            location_program_categories: [] as Row[],
            programs: [] as Row[],
            program_drafts: [] as Row[],
            program_offerings: [{ org_id: "org-1", program_key: "summer_camp" }],
        };
        const report = await reconcileOrganizationProgramsFromLpc(createClient(tables), {
            orgId: "org-1",
            dryRun: true,
        });
        expect(report.orphanOfferingKeys).toEqual([{ orgId: "org-1", programKey: "summer_camp" }]);
    });
});
