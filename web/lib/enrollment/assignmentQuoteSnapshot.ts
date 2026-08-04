/**
 * Assignment proposal quote / estimate snapshot — commercial proposal, not ledger truth.
 *
 * Snapshots are immutable once generated. Updating the underlying tuition plan does not
 * rewrite an existing snapshot; generate a new one (and optionally supersede).
 *
 * Persisted on process_instances.metadata.assignment_quote_snapshots[] until a dedicated
 * table is warranted. Never creates invoices, posted charges, or payments.
 */

export type AssignmentQuoteSnapshotStatus =
    | "draft"
    | "generated"
    | "accepted"
    | "superseded"
    | "rejected";

export type AssignmentQuoteSnapshot = {
    id: string;
    status: AssignmentQuoteSnapshotStatus;
    /** Commercial offering / tuition plan id at generation time. */
    offering_id: string;
    offering_version_key?: string | null;
    offering_label?: string | null;
    amount_cents: number;
    currency: string;
    effective_date: string;
    pricing_inputs: Record<string, unknown>;
    one_time_fees_cents?: number | null;
    discounts_cents?: number | null;
    created_by: string | null;
    generated_at: string;
    expires_at?: string | null;
    supersedes_snapshot_id?: string | null;
    accepted_at?: string | null;
    /**
     * When set, quote belongs to one assignment entry. Regeneration supersedes only
     * peers with the same schedule_assignment_id (or both unset for legacy bag).
     */
    schedule_assignment_id?: string | null;
};

export const ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY = "assignment_quote_snapshots" as const;

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

export function listAssignmentQuoteSnapshots(
    metadata: Record<string, unknown> | null | undefined,
): AssignmentQuoteSnapshot[] {
    if (!metadata || typeof metadata !== "object") return [];
    const raw = metadata[ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.filter((row): row is AssignmentQuoteSnapshot => {
        if (!row || typeof row !== "object") return false;
        const r = row as AssignmentQuoteSnapshot;
        return Boolean(trimOrNull(r.id) && trimOrNull(r.offering_id) && typeof r.amount_cents === "number");
    });
}

function quoteEntryKey(row: Pick<AssignmentQuoteSnapshot, "schedule_assignment_id">): string {
    const id = trimOrNull(row.schedule_assignment_id);
    return id ?? "";
}

export function activeAssignmentQuoteSnapshot(
    metadata: Record<string, unknown> | null | undefined,
    scheduleAssignmentId?: string | null,
): AssignmentQuoteSnapshot | null {
    const rows = listAssignmentQuoteSnapshots(metadata);
    const scope = trimOrNull(scheduleAssignmentId) ?? "";
    const scoped = rows.filter((r) => quoteEntryKey(r) === scope);
    const pool = scoped.length > 0 || scope ? scoped : rows.filter((r) => !trimOrNull(r.schedule_assignment_id));
    const accepted = pool.find((r) => r.status === "accepted");
    if (accepted) return accepted;
    const generated = [...pool].reverse().find((r) => r.status === "generated" || r.status === "draft");
    return generated ?? null;
}

/**
 * Append an immutable generated snapshot. Prior generated/draft snapshots for the
 * same assignment entry (schedule_assignment_id) are marked superseded. Other
 * entries' quotes are left alone.
 */
export function appendAssignmentQuoteSnapshot(
    existingMetadata: Record<string, unknown> | null | undefined,
    snapshot: Omit<AssignmentQuoteSnapshot, "status"> & { status?: AssignmentQuoteSnapshotStatus },
): { metadata: Record<string, unknown>; snapshot: AssignmentQuoteSnapshot } {
    const meta = {
        ...(existingMetadata && typeof existingMetadata === "object" ? existingMetadata : {}),
    };
    const entryKey = quoteEntryKey(snapshot);
    const prior = listAssignmentQuoteSnapshots(meta).map((row) => {
        if (quoteEntryKey(row) !== entryKey) return row;
        if (row.status === "generated" || row.status === "draft") {
            return {
                ...row,
                status: "superseded" as const,
            };
        }
        return row;
    });

    const next: AssignmentQuoteSnapshot = {
        ...snapshot,
        status: snapshot.status ?? "generated",
        currency: snapshot.currency || "USD",
        schedule_assignment_id: trimOrNull(snapshot.schedule_assignment_id),
        pricing_inputs: { ...(snapshot.pricing_inputs ?? {}) },
    };
    // Freeze: callers must not mutate the object after append.
    Object.freeze(next.pricing_inputs);
    Object.freeze(next);

    meta[ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY] = [...prior, next];
    return { metadata: meta, snapshot: next };
}

export function acceptAssignmentQuoteSnapshot(
    existingMetadata: Record<string, unknown> | null | undefined,
    snapshotId: string,
    acceptedAt: string,
): { metadata: Record<string, unknown>; ok: boolean } {
    const meta = {
        ...(existingMetadata && typeof existingMetadata === "object" ? existingMetadata : {}),
    };
    const rows = listAssignmentQuoteSnapshots(meta);
    let found = false;
    meta[ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY] = rows.map((row) => {
        if (row.id === snapshotId) {
            found = true;
            return { ...row, status: "accepted" as const, accepted_at: acceptedAt };
        }
        if (row.status === "accepted") {
            return { ...row, status: "superseded" as const };
        }
        return row;
    });
    return { metadata: meta, ok: found };
}

/** Deep-freeze guard for tests — generated snapshots must not mutate in place. */
export function assertQuoteSnapshotImmutable(snapshot: AssignmentQuoteSnapshot): void {
    if (!Object.isFrozen(snapshot)) {
        throw new Error("Assignment quote snapshot must be frozen after generation");
    }
}
