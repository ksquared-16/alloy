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
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

export type ParticipantEnrollmentAccess = {
    readonly orgId: string;
    readonly linkId: string;
    readonly sessionId: string;
    readonly processInstanceId: string;
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
            .select("id, process_instance_id")
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

    const row = data as { id: string; process_instance_id: string | null };
    const processInstanceId = (row.process_instance_id ?? "").trim();
    if (!processInstanceId) {
        // A legitimate state, not a fault: single-form links and packets predating D-95 realize no
        // Enrollment journey. They keep working as ordinary forms; they simply have no objective.
        return {
            ok: false,
            error: {
                code: "NO_ENROLLMENT_JOURNEY",
                message: "This packet is not part of an Enrollment journey.",
            },
        };
    }

    return {
        ok: true,
        value: {
            orgId: link.org_id,
            linkId: link.id,
            sessionId: row.id,
            processInstanceId,
        },
    };
}
