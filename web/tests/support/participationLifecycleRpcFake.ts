/**
 * In-memory stand-in for the two participation lifecycle RPCs.
 *
 * `process_instances` lifecycle truth stopped being a table UPDATE and became
 * `update_participation_and_maintain_facts` (and, for enrollment materialization,
 * `materialize_participation_and_stamp_provenance`, which delegates its lifecycle half to it). The
 * suites below drive the executors through a chainable `.from()` mock, so without an `.rpc()` they
 * fail with "supabase.rpc is not a function" — a harness gap, not a behaviour change.
 *
 * This emulates the CONTRACT, not a convenience: org scoping, the expected_version EQUALITY guard,
 * the supplied-flag semantics (`null` means SET NULL, absent means LEAVE ALONE), the stage-entry
 * stamp keyed on stage_key being SUPPLIED, and the single `record_not_found_or_stale` outcome.
 *
 * It is deliberately NOT the proof that the contract holds — the migration proves that by executing
 * against real rows. This exists so tests about WHICH ROW an executor moves keep asking that
 * question.
 */

export type LifecycleRow = {
    id: string;
    org_id: string;
    stage_key?: string | null;
    state?: string | null;
    close_reason_key?: string | null;
    stage_entered_at?: string | null;
    updated_at?: string | null;
    metadata?: Record<string, unknown> | null;
};

type RpcResult = { data: { ok: boolean; error?: string; code?: string } | null; error: null };

const REFUSED = {
    data: { ok: false, error: "record_not_found_or_stale", code: "stale" },
    error: null,
} as const;

function applyLifecycle(rows: LifecycleRow[], p: Record<string, unknown>): RpcResult {
    const nowIso = new Date().toISOString();
    const row = rows.find(
        (r) =>
            r.id === p.p_participation_id
            && r.org_id === p.p_org_id
            // Absent expected_version means NO guard; present means exact equality.
            && (p.p_expected_version == null || r.updated_at === p.p_expected_version),
    );
    if (!row) return REFUSED;

    if (p.p_set_stage_key === true) {
        row.stage_key = (p.p_stage_key as string | null) ?? null;
        row.stage_entered_at = nowIso;
    }
    if (p.p_set_state === true) row.state = (p.p_state as string | null) ?? null;
    if (p.p_set_close_reason_key === true) row.close_reason_key = (p.p_close_reason_key as string | null) ?? null;
    row.updated_at = nowIso;
    return { data: { ok: true }, error: null };
}

/**
 * Route one `.rpc(name, params)` call. Returns `null` for an unrecognised name so a caller can fall
 * through to its own handling rather than silently receive a success it never defined.
 */
export function participationLifecycleRpcFake(
    name: string,
    params: Record<string, unknown>,
    rows: LifecycleRow[],
): RpcResult | null {
    if (name === "update_participation_and_maintain_facts") return applyLifecycle(rows, params);

    if (name === "materialize_participation_and_stamp_provenance") {
        if (params.p_set_stage_key === true || params.p_set_state === true) {
            const res = applyLifecycle(rows, { ...params, p_expected_version: null });
            if (!res.data?.ok) return res;
        }
        const row = rows.find((r) => r.id === params.p_participation_id && r.org_id === params.p_org_id);
        if (!row) return REFUSED;
        row.metadata = (params.p_metadata as Record<string, unknown> | null) ?? null;
        row.updated_at = new Date().toISOString();
        return { data: { ok: true }, error: null };
    }
    /*
     * Step 2: creation initializes the opportunity's maintained facts in the same transaction as the
     * INSERT, and the tour authority refreshes them on every transition. Both are RPCs now, so a
     * `.from()`-only double fails with "supabase.rpc is not a function".
     *
     * The insert emulation appends to the caller's row array so the suites that assert WHICH row was
     * created keep asking that question; maintenance itself has no observable effect on these rows,
     * so it simply succeeds.
     */
    if (name === "insert_enrollment_participation_and_maintain_facts") {
        const row = (params.p_row ?? {}) as Record<string, unknown>;
        const id = typeof row.id === "string" && row.id ? row.id : `pi-${rows.length + 1}`;
        const conflictOn = (r: LifecycleRow & Record<string, unknown>) =>
            r.org_id === row.org_id
            && r["process_key"] === row.process_key
            && r["subject_id"] === row.subject_id
            && r["context_id"] === row.context_id;
        if (params.p_ignore_duplicates === true && rows.some((r) => conflictOn(r as never))) {
            return { data: { ok: true, id: null, conflict: true } as never, error: null };
        }
        rows.push({ ...(row as object), id } as LifecycleRow);
        return { data: { ok: true, id, conflict: false } as never, error: null };
    }

    if (name === "maintain_opportunity_tour_facts") {
        return { data: { ok: true }, error: null };
    }

    return null;
}
