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

import { resolvePublicFormLinkByToken } from "@/lib/public/forms/resolvePublicFormLink";

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
    const link = await resolvePublicFormLinkByToken(supabase, plaintextToken);
    if (!link.ok) {
        // The existing failure taxonomy is deliberately NOT widened here. A participant learns that
        // their link does not work, not which of several internal reasons applied.
        return { ok: false, error: { code: "INVALID_LINK", message: link.error.message } };
    }

    const { data, error } = await supabase
        .from("form_packet_sessions")
        .select("id, process_instance_id")
        .eq("org_id", link.value.orgId)
        .eq("started_via_public_link_id", link.value.linkId)
        .maybeSingle();
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
            orgId: link.value.orgId,
            linkId: link.value.linkId,
            sessionId: row.id,
            processInstanceId,
        },
    };
}
