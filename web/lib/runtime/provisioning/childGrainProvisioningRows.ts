/**
 * CHILD-GRAIN ROWS for the provisioning answer (R1).
 *
 * NOTE — no `import "server-only"` here, deliberately. `workUnitProvisioningAnswer.ts` (which this serves)
 * does not use it either, and adding it made every test that transitively imports the answer fail to
 * collect with "Cannot find package 'server-only'" — the same inherited breakage that already keeps
 * `d1ProvisioningAnswerRoute.test.ts` red. The module is reachable only from the server composer; buying a
 * compile-time guard at the cost of four suites' worth of coverage is a bad trade.
 *
 * The answer resolves a lens's Row Grain and then read rows from `opportunities` unconditionally, so a
 * `child` lens could only ever be empty. This is the child side of that routing.
 *
 * It does NOT re-implement the query. `queryEnrollmentProcessInstanceTrackRows` is already the production
 * child-grain reader (`QueueService` → `ocmEnrollmentTrackQueueBuilder` → here), it already encodes the
 * effective-stage rule and the work-unit scoping, and duplicating its SQL would create a second definition
 * of what a child row IS — the exact drift this sprint exists to remove.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT INHERIT from the QueueService path:
 *
 *  1. **No silent degrade.** `QueueService` wraps its child read in a try/catch that falls back to the
 *     case-grain path, so a failing child read surfaces as FAMILY ROWS. On a child surface that is a
 *     wrong-subject substitution wearing the costume of a successful answer. Here an error propagates and
 *     becomes an honest `records_unavailable` terminal.
 *  2. **No ambiguous identity.** The upstream mapper puts a `process_instances.id` in a field named
 *     `opportunity_customer_member_id` and in an `ocmrow:` composite, with nothing distinguishing the two
 *     vintages (`docs/runtime/GRAIN-AUTHORITY-MAP.md` §4). This module normalizes at the boundary, so the
 *     Runtime never inherits that ambiguity.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { queryEnrollmentProcessInstanceTrackRows } from "@/lib/queues/childGrainProcessInstanceQueue";

/**
 * The four identities a child row genuinely has. Keeping them apart is the point: they are different
 * things that were being carried in one ambiguous field.
 */
export type ChildRowIdentity = {
    /** The durable CHILD — `customer_members.id`. Stable across leads, across OCM→PI, across materialization. */
    subjectId: string;
    /** This child's journey through THIS lead — `process_instances.id`. */
    participationId: string | null;
    /** The family case the journey hangs off — `opportunities.id`. */
    contextId: string | null;
    /** Only when a genuine legacy OCM row is behind this — never a process-instance id wearing its name. */
    legacyOcmId: string | null;
};

export type ChildProvisioningRow = ChildRowIdentity & {
    /** Effective stage: the child's own stage, else the family's (resolved upstream by the provider). */
    stageKey: string | null;
    /** `process_instances.state` — null for a child that has not been dispositioned. */
    statusKey: string | null;
    /** Operator-facing child name. */
    title: string | null;
    updatedAt: string | null;
};

type RawChildRow = {
    id?: unknown;
    customer_member_id?: unknown;
    opportunity_id?: unknown;
    outcome_status_key?: unknown;
    updated_at?: unknown;
    _process_instance_id?: unknown;
    customer_members?: unknown;
    opportunities?: unknown;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const one = <T,>(v: T | T[] | null | undefined): T | null =>
    v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;

function childName(row: RawChildRow): string | null {
    const cm = one(row.customer_members as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!cm) return null;
    const display = str(cm.display_name);
    if (display) return display;
    const first = str(cm.first_name);
    const last = str(cm.last_name);
    const joined = [first, last].filter(Boolean).join(" ").trim();
    return joined || null;
}

function effectiveStage(row: RawChildRow): string | null {
    // The provider already filtered by effective stage; this reports which stage the row actually holds,
    // preferring the family's when the child rides it (its own stage is null).
    const opp = one(row.opportunities as Record<string, unknown> | Record<string, unknown>[] | null);
    return str(opp?.stage_key) ?? null;
}

/**
 * Normalize one provider row into the Runtime's child row.
 *
 * `_process_instance_id` is the honest field the upstream mapper already carries but nothing consumed. Where
 * it is present and differs from `id`, `id` is a genuine legacy OCM id preserved through the migration;
 * where it equals `id`, `id` IS the process-instance id and there is no OCM row — so `legacyOcmId` stays
 * null rather than repeating a lie.
 */
export function normalizeChildRow(raw: RawChildRow): ChildProvisioningRow | null {
    const subjectId = str(raw.customer_member_id);
    if (!subjectId) return null; // no child identity → not a child row; never guess one
    const rowId = str(raw.id);
    const participationId = str(raw._process_instance_id) ?? rowId;
    return {
        subjectId,
        participationId,
        contextId: str(raw.opportunity_id),
        legacyOcmId: rowId && participationId && rowId !== participationId ? rowId : null,
        stageKey: effectiveStage(raw),
        statusKey: str(raw.outcome_status_key),
        title: childName(raw),
        updatedAt: str(raw.updated_at),
    };
}

/**
 * Load the child-grain rows for a lens.
 *
 * `stageKeys` is the lens's configured stage set — one provider call per stage, unioned by participation so
 * a child cannot appear twice when a lens spans several stages of its own grain.
 *
 * THROWS on read failure. The caller turns that into an honest terminal; it must never become family rows.
 */
export async function loadChildGrainProvisioningRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    stageKeys: readonly string[];
}): Promise<ChildProvisioningRow[]> {
    const stages = [...new Set(params.stageKeys.map((s) => s.trim()).filter(Boolean))];
    if (!stages.length) return [];

    const perStage = await Promise.all(
        stages.map((stageKey) =>
            queryEnrollmentProcessInstanceTrackRows({
                supabase: params.supabase,
                orgId: params.orgId,
                workUnitId: params.workUnitId,
                stageKey,
            }),
        ),
    );

    const byParticipation = new Map<string, ChildProvisioningRow>();
    for (const rows of perStage) {
        for (const raw of rows as unknown as RawChildRow[]) {
            const row = normalizeChildRow(raw);
            if (!row) continue;
            const key = row.participationId ?? `${row.subjectId}:${row.contextId ?? ""}`;
            if (!byParticipation.has(key)) byParticipation.set(key, row);
        }
    }
    return [...byParticipation.values()];
}
