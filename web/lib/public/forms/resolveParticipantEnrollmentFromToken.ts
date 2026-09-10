/**
 * Participant access for the conversational Enrollment runtime (Phase 3).
 *
 * ## No second participant application
 *
 * The narrowest existing entry point is the public forms token surface — `/api/public/forms/[token]`
 * with `resolvePublicFormLinkByToken` as its access doctrine. This module reuses it exactly and adds
 * one hop that D-95 already made possible:
 *
 * ```
 *   plaintext token
 *     -> hashFormLinkToken -> form_public_links            (existing access doctrine, unchanged)
 *     -> form_packet_sessions.started_via_public_link_id   (existing 1:1 link binding)
 *     -> form_packet_sessions.process_instance_id          (D-95 anchor)
 *     -> the deterministic Enrollment objective
 * ```
 *
 * Every link in that chain already existed. Nothing here invents an Enrollment portal, a participant
 * account, or a second authentication story: a participant who can open their packet link can see
 * their objective, and one who cannot, cannot.
 *
 * ## The process instance is CONTEXT, not the anchor
 *
 * The last hop used to be a gate: no `process_instance_id`, no access, `NO_ENROLLMENT_JOURNEY`. That
 * made a Business Process launch the only way to be a participant — so a packet an operator launched
 * by hand got no conversation and, worse, no recognizable paperwork, even though the routes that
 * render that paperwork read nothing but `orgId` and `sessionId`.
 *
 * The packet SESSION is the anchor. It already owns packet identity, ordered steps, session state,
 * shared values, the current step, submissions and launch context — enough to be a participant
 * experience on its own. A process instance, when there is one, ENRICHES it.
 *
 * So this resolver reports the instance instead of requiring it, and each route decides for itself.
 * Routes whose work is genuinely journey-shaped (objective, turn, edit — all of which derive needs
 * from Business Process requirements) still refuse with the same `NO_ENROLLMENT_JOURNEY` code, so
 * nothing about their behaviour moved. Routes that only ever needed the session stop being denied
 * for a reason that was never theirs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { ENROLLMENT_SESSION_COLUMNS } from "@/lib/pos/packet/enrollmentObjectiveSession";
import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";

export type ParticipantEnrollmentAccess = {
    readonly orgId: string;
    readonly linkId: string;
    readonly sessionId: string;
    /** The Business Process journey this session is anchored to, when it has one. */
    readonly processInstanceId: string | null;
    /**
     * The session row this access decision already read.
     *
     * Handed forward so the objective resolver does not re-read it. It is a PERFORMANCE handoff and
     * nothing more — the objective still applies its own current-session predicate to it.
     */
    readonly session: PacketSessionRow;
};

export type ParticipantEnrollmentAccessFailure = {
    readonly code: "INVALID_LINK" | "NO_SESSION" | "NO_ENROLLMENT_JOURNEY";
    readonly message: string;
};

export async function resolveParticipantEnrollmentFromToken(
    supabase: SupabaseClient,
    plaintextToken: string,
): Promise<
    | { ok: true; value: ParticipantEnrollmentAccess }
    | { ok: false; error: ParticipantEnrollmentAccessFailure }
> {
    /**
     * The LEAN access read. The full public-form resolver loads the form definition, the pinned
     * version and its whole schema — none of which this access decision consumes, and each of
     * which was a serial round trip on EVERY participant request (measured: the token phase alone
     * was ~1.5s of a turn). The doctrine is unchanged: the same token hash, the same
     * active/expiry/archived checks, the same failure taxonomy (every link failure is
     * INVALID_LINK). Only the unread payloads stopped being fetched.
     */
    const token_hash = hashFormLinkToken(plaintextToken.trim());
    const { data: linkRow, error: linkError } = await supabase
        .from("form_public_links")
        .select("id, org_id, form_definition_id, is_active, expires_at")
        .eq("token_hash", token_hash)
        .maybeSingle();
    const link = linkRow as {
        id: string;
        org_id: string;
        form_definition_id: string;
        is_active: boolean;
        expires_at: string | null;
    } | null;
    if (linkError || !link || !link.is_active) {
        return { ok: false, error: { code: "INVALID_LINK", message: "Invalid or unknown link" } };
    }
    if (link.expires_at) {
        const exp = new Date(link.expires_at).getTime();
        if (!Number.isNaN(exp) && exp < Date.now()) {
            return { ok: false, error: { code: "INVALID_LINK", message: "This form link has expired" } };
        }
    }

    // The archived-form gate and the session hop are independent — one wave.
    const [{ data: formDef }, { data, error }] = await Promise.all([
        supabase
            .from("form_definitions")
            .select("id, is_active")
            .eq("id", link.form_definition_id)
            .eq("org_id", link.org_id)
            .maybeSingle(),
        supabase
            .from("form_packet_sessions")
            // The FULL session row, not just its identity.
            //
            // The objective resolver reads this exact row again to answer "which session is
            // current?", which was a whole serial round trip on every participant request. Reading
            // the columns it needs here lets it skip that wave — and it still re-checks the
            // current-session predicate itself, so nothing about which session counts moved.
            .select(ENROLLMENT_SESSION_COLUMNS)
            .eq("org_id", link.org_id)
            .eq("started_via_public_link_id", link.id)
            .maybeSingle(),
    ]);
    if (!formDef || (formDef as { is_active?: boolean }).is_active === false) {
        return { ok: false, error: { code: "INVALID_LINK", message: "Invalid or unknown link" } };
    }
    if (error || !data) {
        return {
            ok: false,
            error: { code: "NO_SESSION", message: "This link has no participant session yet." },
        };
    }

    const row = data as PacketSessionRow & { process_instance_id: string | null };
    // Reported, never required. A manually launched packet has no journey and is still a
    // participant session; the routes that need a journey say so themselves.
    const processInstanceId = (row.process_instance_id ?? "").trim() || null;

    return {
        ok: true,
        value: {
            orgId: link.org_id,
            linkId: link.id,
            sessionId: row.id,
            processInstanceId,
            session: row,
        },
    };
}

/** The refusal a journey-shaped route returns when the session has no Business Process behind it. */
export const NO_ENROLLMENT_JOURNEY_MESSAGE = "This packet is not part of an Enrollment journey.";

/**
 * Narrow an access result to one that carries a journey.
 *
 * For routes whose work is defined by Business Process requirements — the objective, the
 * conversational turn, the edit path. They keep the exact refusal they returned before; the change
 * is only that they now own the decision instead of inheriting it.
 */
export function requireEnrollmentJourney(
    access: ParticipantEnrollmentAccess,
): { ok: true; processInstanceId: string } | { ok: false; error: ParticipantEnrollmentAccessFailure } {
    if (!access.processInstanceId) {
        return {
            ok: false,
            error: { code: "NO_ENROLLMENT_JOURNEY", message: NO_ENROLLMENT_JOURNEY_MESSAGE },
        };
    }
    return { ok: true, processInstanceId: access.processInstanceId };
}

/**
 * The child this session's documents and signatures attach to.
 *
 * One concept, two sources: a Business Process journey names its subject on the process instance; a
 * manual launch names it in the session's own CRM snapshot. Upload and signature storage need the
 * child and nothing else about a journey, so they ask for the child.
 */
export async function resolveParticipantSubjectCustomerMemberId(
    supabase: SupabaseClient,
    access: ParticipantEnrollmentAccess,
): Promise<string | null> {
    if (access.processInstanceId) {
        const { data } = await supabase
            .from("process_instances")
            .select("subject_id")
            .eq("org_id", access.orgId)
            .eq("id", access.processInstanceId)
            .maybeSingle();
        const subjectId = ((data as { subject_id?: string | null } | null)?.subject_id ?? "").trim();
        if (subjectId) return subjectId;
    }

    const snapshot = (access.session as { crm_snapshot?: Record<string, unknown> | null }).crm_snapshot;
    const fromSnapshot = snapshot && typeof snapshot === "object"
        ? String((snapshot as { customer_member_id?: unknown }).customer_member_id ?? "").trim()
        : "";
    return fromSnapshot || null;
}
