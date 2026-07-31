/**
 * In-memory Supabase double for the Business Process stage save.
 *
 * Purpose-built rather than generic: the properties under test are about WRITES — how many, to
 * which table, in which order, and what was still unwritten when a failure aborted. So every
 * insert/update is appended to `store.writes`, which is what lets a test assert "exactly one
 * lifecycle draft write" or "nothing touched `departments.metadata.lifecycle_builder_v1`" without
 * reaching for a real database.
 *
 * Real-Postgres behaviour (the trigger, publication CAS, immutability) is covered by
 * certification/bp-config-integrity/*.sql, not here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DeptRow = { id: string; org_id: string; metadata: Record<string, unknown> };

export type WorkUnitRow = {
    id: string;
    org_id: string;
    department_id: string;
    key: string;
    name: string;
    sort_order: number;
    is_active: boolean;
    queue_definition: unknown;
    metadata: Record<string, unknown>;
    updated_at?: string;
};

export type DraftRow = {
    id: string;
    org_id: string;
    department_id: string;
    payload: Record<string, unknown>;
    base_revision_id: string | null;
    /** Mirrors the column default; the CAS on save compares against it. */
    draft_revision?: number;
    draft_status: "draft" | "validated";
    validation_errors: unknown[];
};

export type PublicationRow = {
    org_id: string;
    domain_key: string;
    subject_id: string;
    revision_id: string;
    revision_number: number;
};

export type WriteRecord = {
    table: string;
    op: "insert" | "update";
    patch: Record<string, unknown>;
};

export type StatusDefinitionRow = {
    id: string;
    org_id: string;
    entity_type: string;
    status_key: string;
    status_label: string;
    sort_order: number;
    metadata: Record<string, unknown> | null;
    is_active: boolean;
};

export type StageSaveStore = {
    departments: DeptRow[];
    work_units: WorkUnitRow[];
    business_process_drafts: DraftRow[];
    configuration_publications: PublicationRow[];
    status_definitions: StatusDefinitionRow[];
    writes: WriteRecord[];
    /** Tables that should reject every write, to exercise companion-failure reporting. */
    failWrites: Set<string>;
    /** The published builder as it stood before the save, for `projectionWrites`. */
    publishedBuilderBaseline: unknown;
};

type Row = Record<string, unknown>;

/** Column defaults the real schema applies on INSERT and the service relies on. */
const TABLE_DEFAULTS: Record<string, Row> = {
    business_process_drafts: { draft_revision: 1 },
};

export function createStageSaveStore(init: {
    department: DeptRow;
    workUnits?: WorkUnitRow[];
    drafts?: DraftRow[];
    publications?: PublicationRow[];
    statusDefinitions?: StatusDefinitionRow[];
}): StageSaveStore {
    return {
        departments: [init.department],
        work_units: init.workUnits ?? [],
        // Seeded rows get the same column defaults an INSERT would, so a fixture that omits
        // `draft_revision` still behaves like a real row rather than defeating the CAS.
        business_process_drafts: (init.drafts ?? []).map((d) => ({
            ...(TABLE_DEFAULTS.business_process_drafts as Partial<DraftRow>),
            ...d,
        })),
        configuration_publications: init.publications ?? [],
        status_definitions: init.statusDefinitions ?? [],
        writes: [],
        failWrites: new Set(),
        publishedBuilderBaseline: JSON.parse(
            JSON.stringify(init.department.metadata.lifecycle_builder_v1 ?? null),
        ),
    };
}

/**
 * Reads of a table this double does not model return empty; WRITES to one throw.
 *
 * The stage bootstrap fans out to a dozen loaders that touch tables irrelevant to what is under
 * test (forms, form versions, public links). Making every test enumerate them would be noise. But
 * an unmodelled WRITE is always a real finding — either a typo or a write nobody knew about — so
 * it must not be swallowed.
 */
function tableRows(store: StageSaveStore, table: string, forWrite = false): Row[] {
    const rows = (store as unknown as Record<string, unknown>)[table];
    if (!Array.isArray(rows)) {
        if (forWrite) throw new Error(`stageSaveStore: write to unmodelled table "${table}"`);
        return [];
    }
    return rows as Row[];
}

export function createStageSaveSupabase(store: StageSaveStore): SupabaseClient {
    let seq = 0;

    const from = (table: string) => {
        const filters: Array<[string, unknown]> = [];
        let orderKey: string | null = null;
        let orderAsc = true;
        let limit: number | null = null;

        const matching = () => {
            let out = tableRows(store, table);
            for (const [col, val] of filters) out = out.filter((r) => r[col] === val);
            if (orderKey) {
                const key = orderKey;
                out = [...out].sort((a, b) => {
                    const av = Number(a[key] ?? 0);
                    const bv = Number(b[key] ?? 0);
                    return orderAsc ? av - bv : bv - av;
                });
            }
            if (limit != null) out = out.slice(0, limit);
            return out;
        };

        const guard = () => {
            if (store.failWrites.has(table)) {
                throw new Error(`stageSaveStore: write to "${table}" failed (injected)`);
            }
        };

        const readChain: Record<string, unknown> = {
            select: () => readChain,
            eq: (col: string, val: unknown) => {
                filters.push([col, val]);
                return readChain;
            },
            order: (col: string, opts?: { ascending?: boolean }) => {
                orderKey = col;
                orderAsc = opts?.ascending !== false;
                return readChain;
            },
            limit: (n: number) => {
                limit = n;
                return readChain;
            },
            maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
            single: async () => {
                const row = matching()[0];
                return row
                    ? { data: row, error: null }
                    : { data: null, error: { message: `${table}: no rows` } };
            },
            then: (onfulfilled?: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) =>
                Promise.resolve({ data: matching(), error: null }).then(onfulfilled, onrejected),
        };

        const updateChain = (patch: Row) => {
            const applyUpdate = () => {
                guard();
                store.writes.push({ table, op: "update", patch });
                tableRows(store, table, true);
                const rows = matching();
                for (const row of rows) Object.assign(row, patch);
                return rows;
            };
            const chain: Record<string, unknown> = {
                eq: (col: string, val: unknown) => {
                    filters.push([col, val]);
                    return chain;
                },
                select: () => chain,
                single: async () => {
                    try {
                        const rows = applyUpdate();
                        return rows[0]
                            ? { data: rows[0], error: null }
                            : { data: null, error: { message: `${table}: no rows` } };
                    } catch (e) {
                        return { data: null, error: { message: (e as Error).message } };
                    }
                },
                maybeSingle: async () => {
                    try {
                        const rows = applyUpdate();
                        return { data: rows[0] ?? null, error: null };
                    } catch (e) {
                        return { data: null, error: { message: (e as Error).message } };
                    }
                },
                then: (onfulfilled?: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) => {
                    try {
                        applyUpdate();
                        return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
                    } catch (e) {
                        return Promise.resolve({
                            data: null,
                            error: { message: (e as Error).message },
                        }).then(onfulfilled, onrejected);
                    }
                },
            };
            return chain;
        };

        const insertChain = (row: Row) => {
            const materialize = () => {
                guard();
                seq += 1;
                const inserted: Row = {
                    id: row.id ?? `${table}-${seq}`,
                    ...TABLE_DEFAULTS[table],
                    ...row,
                };
                store.writes.push({ table, op: "insert", patch: row });
                tableRows(store, table, true).push(inserted);
                return inserted;
            };
            const chain: Record<string, unknown> = {
                select: () => chain,
                single: async () => {
                    try {
                        return { data: materialize(), error: null };
                    } catch (e) {
                        return { data: null, error: { message: (e as Error).message } };
                    }
                },
                then: (onfulfilled?: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) => {
                    try {
                        materialize();
                        return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
                    } catch (e) {
                        return Promise.resolve({
                            data: null,
                            error: { message: (e as Error).message },
                        }).then(onfulfilled, onrejected);
                    }
                },
            };
            return chain;
        };

        return {
            ...readChain,
            update: updateChain,
            insert: insertChain,
        } as unknown as Record<string, unknown>;
    };

    return { from } as unknown as SupabaseClient;
}

/**
 * Writes that would actually CHANGE the published lifecycle projection — must be empty for a save.
 *
 * A whole-column `departments.metadata` write carrying a byte-identical builder is not a projection
 * change; the database guard says the same thing with `IS NOT DISTINCT FROM`, which is exactly why
 * the category-F field-rules companion still passes with the guard enforcing.
 */
export function projectionWrites(store: StageSaveStore): WriteRecord[] {
    const baseline = JSON.stringify(store.publishedBuilderBaseline ?? null);
    return store.writes.filter((w) => {
        if (w.table !== "departments") return false;
        const metadata = w.patch.metadata;
        if (metadata == null || typeof metadata !== "object") return false;
        if (!("lifecycle_builder_v1" in (metadata as Record<string, unknown>))) return false;
        return (
            JSON.stringify((metadata as Record<string, unknown>).lifecycle_builder_v1) !== baseline
        );
    });
}

export function draftWrites(store: StageSaveStore): WriteRecord[] {
    return store.writes.filter(
        (w) => w.table === "business_process_drafts" && w.op === "update" && "payload" in w.patch,
    );
}
