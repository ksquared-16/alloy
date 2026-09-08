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

import { resolveInquiryChildIdentityFields } from "@/lib/admin/drawer/inquiryChildrenHydration";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildParticipationIdentity } from "@/lib/lifecycle/childParticipationIdentity";
import {
    queryEnrollmentProcessInstanceParticipationRows,
    queryEnrollmentProcessInstanceTrackRows,
} from "@/lib/queues/childGrainProcessInstanceQueue";

/**
 * The four identities a child row genuinely has — the CANONICAL tuple, not a second copy of it.
 * `ChildParticipationIdentity` is the one definition (`lib/lifecycle/childParticipationIdentity.ts`);
 * a row narrows it only by guaranteeing the subject, since a row with no child is dropped rather than
 * carried. Keeping the four apart is the point: they are different things that were being carried in
 * one ambiguous field.
 */
export type ChildRowIdentity = ChildParticipationIdentity & { subjectId: string };

export type ChildProvisioningRow = ChildRowIdentity & {
    /**
     * `opportunities.customer_id` — the HOUSEHOLD ACCOUNT the family case belongs to.
     *
     * The provider already reads the context opportunity in full (`OPP_SELECT` carries `customer_id`)
     * to resolve the effective stage; this row simply stops discarding the column. A child has no
     * customer of their own, so there is nothing ambiguous to choose between — and no read is added.
     * Null where the family case carries no customer, which is a real state and stays one.
     */
    familyCustomerId: string | null;
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
    _effective_stage_key?: unknown;
    customer_members?: unknown;
    opportunities?: unknown;
};

/**
 * HOW A LENS DECIDES WHICH CHILDREN IT CONTAINS.
 *
 * Two rules, and they answer different questions:
 *
 *   `stages`        — "who is at these stages" (a stage-scoped lens: Registration, Waitlist).
 *   `participation` — "whose enrollment journey is still running" (a stage-INDEPENDENT lens).
 *
 * The second is not the first run over every stage. Enumerating stages would admit a child whose own
 * participation is closed while the family case still sits in an active stage — the wrong subject,
 * arrived at by asking the wrong question. Effective stage still describes each row; it just stops
 * being what decides membership.
 */
export type ChildRowMembership =
    | { mode: "stages"; stageKeys: readonly string[] }
    | { mode: "participation" };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const one = <T,>(v: T | T[] | null | undefined): T | null =>
    v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;

function childName(row: RawChildRow): string | null {
    const cm = one(row.customer_members as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!cm) return null;
    /*
     * LAW 34 — the queue row title names the same child the Focus Panel and Records name, so it must
     * read the same authority. Resolved through the shared resolver rather than re-deriving the rule:
     * person when the child has one, the member row only while it does not.
     */
    const person = one(cm.persons as Record<string, unknown> | Record<string, unknown>[] | null);
    const identity = resolveInquiryChildIdentityFields({
        personId: str(cm.person_id),
        person: person
            ? {
                  first_name: str(person.first_name),
                  last_name: str(person.last_name),
                  full_name: str(person.full_name),
                  date_of_birth: str(person.date_of_birth),
              }
            : null,
        member: {
            first_name: str(cm.first_name),
            last_name: str(cm.last_name),
            display_name: str(cm.display_name),
            dob: str(cm.dob),
        },
    });
    if (identity.display_name) return identity.display_name;
    const joined = [identity.first_name, identity.last_name].filter(Boolean).join(" ").trim();
    return joined || null;
}

function effectiveStage(row: RawChildRow): string | null {
    // The provider resolves the effective stage (`process_instances.stage_key ?? opportunities.stage_key`)
    // and carries it explicitly. Reading the OPPORTUNITY's stage is right only while the child rides the
    // family track: a branched child would be reported at its family's stage. That was invisible while
    // every consumer filtered to one lane at a time, and stops being invisible on a stage-independent lens.
    const carried = str(row._effective_stage_key);
    if (carried) return carried;
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
    const opp = one(raw.opportunities as Record<string, unknown> | Record<string, unknown>[] | null);
    return {
        subjectId,
        participationId,
        contextId: str(raw.opportunity_id),
        familyCustomerId: str(opp?.customer_id),
        legacyOcmId: rowId && participationId && rowId !== participationId ? rowId : null,
        stageKey: effectiveStage(raw),
        statusKey: str(raw.outcome_status_key),
        title: childName(raw),
        updatedAt: str(raw.updated_at),
    };
}

/**
 * Load the child-grain rows for a lens, under the lens's OWN membership rule.
 *
 * `stages` mode issues one provider call per stage, unioned by participation so a child cannot appear twice
 * when a lens spans several stages of its own grain. `participation` mode is a single call — a live
 * participation is one thing, not a union over lanes.
 *
 * THROWS on read failure. The caller turns that into an honest terminal; it must never become family rows.
 */
export async function loadChildGrainProvisioningRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    membership: ChildRowMembership;
}): Promise<ChildProvisioningRow[]> {
    const { supabase, orgId, workUnitId } = params;

    let batches: (readonly unknown[])[];
    if (params.membership.mode === "participation") {
        batches = [await queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId, workUnitId })];
    } else {
        const stages = [...new Set(params.membership.stageKeys.map((s) => s.trim()).filter(Boolean))];
        // A `stages` lens with no stage is not "everything" — it selects nothing, and saying so is the
        // honest answer. A lens that MEANS everything declares participation membership instead.
        if (!stages.length) return [];
        batches = await Promise.all(
            stages.map((stageKey) =>
                queryEnrollmentProcessInstanceTrackRows({ supabase, orgId, workUnitId, stageKey }),
            ),
        );
    }

    const byParticipation = new Map<string, ChildProvisioningRow>();
    for (const rows of batches) {
        for (const raw of rows as unknown as RawChildRow[]) {
            const row = normalizeChildRow(raw);
            if (!row) continue;
            const key = row.participationId ?? `${row.subjectId}:${row.contextId ?? ""}`;
            if (!byParticipation.has(key)) byParticipation.set(key, row);
        }
    }
    return [...byParticipation.values()];
}
