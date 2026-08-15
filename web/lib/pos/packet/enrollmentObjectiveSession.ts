/**
 * The participant Enrollment objective: launch and resume (D-95, Slice 2.2).
 *
 * One explicit entry point that answers "which participant session realizes this Enrollment
 * journey?", creating it only when asked to launch — never as a side effect of a read.
 *
 * ## Why "current" has exactly one owner
 *
 * `form_packet_sessions.status` is `in_progress | completed | cancelled`. The predicate for
 * "the session a parent is working in right now" is therefore `status = 'in_progress'`, and
 * it is defined ONCE here. Every caller asking that question goes through
 * {@link resolveCurrentEnrollmentSession}. If each surface re-derived it, one of them would
 * eventually treat `completed` as resumable and hand a parent a finished packet to fill in
 * again.
 *
 * The database enforces the same rule from the other side: a partial unique index permits at
 * most one `in_progress` session per `process_instance_id`. This module does not restate that
 * constraint — it cooperates with it (see the race handling in {@link launchEnrollmentObjectiveSession}).
 *
 * ## Authority
 *
 * `process_instance` owns the journey; this session realizes it. Nothing here reads or writes
 * stage, completion policy or transitions, and no lifecycle value is copied onto the session.
 *
 * ## Opportunity independence
 *
 * Launch requires org + process instance. It does NOT require an Opportunity, and
 * deliberately validates less than `materializeEnrollmentFromProcessInstance`, which also
 * demands `context_type = 'opportunity'`. That check is right for materializing a durable
 * enrollment agreement out of a CRM journey; it would be wrong here, because a parent
 * completing Enrollment must not depend on a CRM record existing. Process key and subject
 * type are the parts that prove "this is a child's Enrollment journey", and those are checked.
 *
 * @see lib/forms/packets/formPacketService.ts — session realization and D-94 version pinning
 * @see supabase/migrations/20260815160000_form_packet_session_process_instance_anchor.sql
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_SUBJECT_TYPE } from "@/lib/process/processInstances";
import {
    ensurePacketSessionForPublicLink,
    type PacketSessionItemRow,
    type PacketSessionRow,
} from "@/lib/forms/packets/formPacketService";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";

/**
 * The one definition of a "current" participant session.
 *
 * `completed` and `cancelled` are terminal. Terminal sessions are history: they remain
 * queryable, and they do not block a new launch.
 */
export const CURRENT_ENROLLMENT_SESSION_STATUS = "in_progress" as const;

export type EnrollmentObjectiveSession = {
    readonly session: PacketSessionRow;
    readonly items: readonly PacketSessionItemRow[];
    /** `resumed` when an existing current session answered; `created` when one was realized. */
    readonly outcome: "resumed" | "created";
};

export type EnrollmentObjectiveRefusal =
    | { readonly code: "process_instance_not_found"; readonly detail: string }
    | { readonly code: "wrong_org"; readonly detail: string }
    | { readonly code: "not_enrollment_process"; readonly detail: string }
    | { readonly code: "launch_failed"; readonly detail: string };

export type EnrollmentObjectiveResult =
    | { readonly ok: true; readonly value: EnrollmentObjectiveSession }
    | { readonly ok: false; readonly refusal: EnrollmentObjectiveRefusal };

type ProcessInstanceRow = {
    id: string;
    org_id: string;
    process_key: string;
    subject_type: string;
};

const SESSION_COLUMNS =
    "id, org_id, packet_definition_id, started_via_public_link_id, status, launch_context, crm_snapshot, shared_values, current_sequence_index, packet_instance_id, process_instance_id";

const ITEM_COLUMNS =
    "id, packet_session_id, packet_item_id, sequence_index, status, form_submission_id, resolved_form_definition_version_id";

/**
 * The current participant session for an Enrollment journey, or null.
 *
 * READ ONLY — this never creates. A generic read that quietly materialized durable
 * participant state would make every incidental page load a write, and would defeat the
 * database's one-current-session guarantee by racing itself.
 */
export async function resolveCurrentEnrollmentSession(
    supabase: SupabaseClient,
    input: { orgId: string; processInstanceId: string },
): Promise<{ session: PacketSessionRow | null; items: PacketSessionItemRow[]; error: Error | null }> {
    const { data, error } = await supabase
        .from("form_packet_sessions")
        .select(SESSION_COLUMNS)
        .eq("org_id", input.orgId)
        .eq("process_instance_id", input.processInstanceId)
        .eq("status", CURRENT_ENROLLMENT_SESSION_STATUS)
        .maybeSingle();

    if (error) return { session: null, items: [], error: new Error(error.message) };
    if (!data) return { session: null, items: [], error: null };

    const session = data as PacketSessionRow;
    const { data: items } = await supabase
        .from("form_packet_session_items")
        .select(ITEM_COLUMNS)
        .eq("packet_session_id", session.id)
        .order("sequence_index", { ascending: true });

    return { session, items: (items ?? []) as PacketSessionItemRow[], error: null };
}

/** Loads and validates that the target really is a child's Enrollment journey in this org. */
async function loadEnrollmentProcessInstance(
    supabase: SupabaseClient,
    input: { orgId: string; processInstanceId: string },
): Promise<{ row: ProcessInstanceRow | null; refusal: EnrollmentObjectiveRefusal | null }> {
    const { data, error } = await supabase
        .from("process_instances")
        .select("id, org_id, process_key, subject_type")
        .eq("id", input.processInstanceId)
        .maybeSingle();

    if (error || !data) {
        return {
            row: null,
            refusal: { code: "process_instance_not_found", detail: "No such process instance." },
        };
    }

    const row = data as ProcessInstanceRow;

    // Org is checked here as well as by the database trigger. The trigger is the guarantee;
    // this is so a caller gets a refusal it can explain rather than a constraint error.
    if (row.org_id !== input.orgId) {
        return { row: null, refusal: { code: "wrong_org", detail: "Process instance belongs to another organization." } };
    }

    if (row.process_key !== ENROLLMENT_PROCESS_KEY || row.subject_type !== ENROLLMENT_SUBJECT_TYPE) {
        return {
            row: null,
            refusal: {
                code: "not_enrollment_process",
                detail: `Process instance is ${row.process_key}/${row.subject_type}, not ${ENROLLMENT_PROCESS_KEY}/${ENROLLMENT_SUBJECT_TYPE}.`,
            },
        };
    }

    return { row, refusal: null };
}

/**
 * Launch or resume the participant Enrollment objective for a process instance.
 *
 * Idempotent by design: calling it twice returns the same session, with `outcome` reporting
 * which happened.
 *
 * **Race handling.** Between the resolve and the insert, a concurrent launch can win. The
 * database refuses the loser with a unique violation on the partial index, and the correct
 * response is to re-resolve and return the winner's session — not to surface a constraint
 * error to a parent who did nothing wrong, and emphatically not to weaken the constraint. The
 * re-read is the same create-or-read shape `ensurePacketSessionForPublicLink` already uses for
 * its own link race.
 */
export async function launchEnrollmentObjectiveSession(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        packetDefinitionId: string;
        linkId: string;
        linkMetadata?: Record<string, unknown>;
        /**
         * CRM continuity for packets that have it. Optional on purpose: an Enrollment launch
         * must succeed with no Opportunity, so this defaults to an empty stamp.
         */
        launchFks?: LaunchFkStamp;
    },
): Promise<EnrollmentObjectiveResult> {
    const { refusal } = await loadEnrollmentProcessInstance(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
    });
    if (refusal) return { ok: false, refusal };

    const existing = await resolveCurrentEnrollmentSession(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
    });
    if (existing.error) return { ok: false, refusal: { code: "launch_failed", detail: existing.error.message } };
    if (existing.session) {
        return { ok: true, value: { session: existing.session, items: existing.items, outcome: "resumed" } };
    }

    const created = await ensurePacketSessionForPublicLink(supabase, {
        orgId: input.orgId,
        linkId: input.linkId,
        packetDefinitionId: input.packetDefinitionId,
        linkMetadata: input.linkMetadata ?? {},
        launchFks: input.launchFks ?? {
            person_id: null,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
        },
        processInstanceId: input.processInstanceId,
    });

    if (created.error) {
        // Lost the race: the winner's session is the canonical one, so return it.
        const raced = await resolveCurrentEnrollmentSession(supabase, {
            orgId: input.orgId,
            processInstanceId: input.processInstanceId,
        });
        if (raced.session) {
            return { ok: true, value: { session: raced.session, items: raced.items, outcome: "resumed" } };
        }
        return { ok: false, refusal: { code: "launch_failed", detail: created.error.message } };
    }

    return { ok: true, value: { session: created.session, items: created.items, outcome: "created" } };
}
