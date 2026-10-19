/**
 * A PAYERLESS ENROLLMENT LINK GETS ITS PAYER — one link, one operator decision, never a reassignment.
 *
 * Start Enrollment minted links without `metadata.recipient_person_id` until #1477, and the payment route
 * treats that value as the only payer: a payerless link can never take a payment. A resumed launch hands
 * the SAME link back (launchParticipantEnrollment, "RESUME before mint"), so re-launching repairs nothing.
 * Deployed census 2026-10-18: 3 such links are still active for real households.
 *
 * This is the amendment, and only it:
 *   - the link must be an ACTIVE Enrollment link (created_via enrollment_start) with NO payer, and its
 *     session must still be open (in_progress) — a finished or abandoned journey is history;
 *   - the household is the SESSION's (crm_snapshot.customer_id), and the candidates are that household's
 *     primary contacts — the same canonical recipient a launch binds today;
 *   - the operator chooses: one candidate is offered, never silently applied; several candidates are all
 *     offered; a person outside the candidates is refused;
 *   - the write is compare-and-set on "no payer yet", so a payer already bound — by anyone, at any time —
 *     is never replaced, and two operators racing bind exactly once;
 *   - the same link and session stay in place: nothing is deleted, no token changes, the family is not
 *     re-notified. The link records who bound it, when and through what, and a workflow event is written.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE } from "@/lib/admin/person/householdPrimaryContact";

export const LINK_PAYER_BOUND_EVENT = "enrollment_link_payer_bound";

/**
 * A person the operator may choose. Email and phone are shown so two primary contacts with similar
 * names can be told apart — and so the operator sees which one the family can actually be reached at.
 */
export type LinkPayerCandidate = {
    readonly personId: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly phone: string | null;
};

export type LinkPayerRefusalCode =
    | "link_not_found"
    | "not_an_enrollment_link"
    | "link_inactive"
    | "payer_already_bound"
    | "session_not_open"
    | "no_household"
    | "no_primary_contact"
    | "payer_not_a_candidate"
    | "confirmation_required";

export type LinkPayerRefusal = { readonly code: LinkPayerRefusalCode; readonly detail: string };

export type LinkPayerPreview = {
    readonly linkId: string;
    readonly sessionId: string;
    readonly customerId: string;
    readonly candidates: readonly LinkPayerCandidate[];
    /** True when there is more than one candidate: the operator must pick, there is no default. */
    readonly choiceRequired: boolean;
};

type Result<T> = { ok: true; value: T } | { ok: false; refusal: LinkPayerRefusal };

const refuse = (code: LinkPayerRefusalCode, detail: string): { ok: false; refusal: LinkPayerRefusal } => ({ ok: false, refusal: { code, detail } });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type LinkRow = { id: string; is_active?: boolean | null; expires_at?: string | null; metadata?: Record<string, unknown> | null };

export async function previewLinkPayerBinding(
    supabase: SupabaseClient,
    input: { orgId: string; linkId: string; now?: Date },
): Promise<Result<LinkPayerPreview> & { link?: LinkRow }> {
    const { data: linkData, error: linkError } = await supabase
        .from("form_public_links")
        .select("id, is_active, expires_at, metadata")
        .eq("org_id", input.orgId)
        .eq("id", input.linkId)
        .maybeSingle();
    if (linkError) throw new Error(`link read failed: ${linkError.message}`);
    const link = linkData as LinkRow | null;
    if (!link) return refuse("link_not_found", "No link with this id in this organization.");
    const metadata = link.metadata ?? {};
    if (str(metadata.created_via) !== "enrollment_start") {
        return refuse("not_an_enrollment_link", "Only an Enrollment paperwork link can be given a payer here.");
    }
    if (str(metadata.recipient_person_id)) {
        return refuse("payer_already_bound", "This link already has a payer. A payer is never replaced here.");
    }
    const expired = link.expires_at ? Date.parse(link.expires_at) <= (input.now ?? new Date()).getTime() : false;
    if (link.is_active === false || expired) {
        return refuse("link_inactive", "This link is no longer active; its history is left as it is.");
    }

    const { data: sessions, error: sessionError } = await supabase
        .from("form_packet_sessions")
        .select("id, status, crm_snapshot")
        .eq("org_id", input.orgId)
        .eq("started_via_public_link_id", input.linkId);
    if (sessionError) throw new Error(`session read failed: ${sessionError.message}`);
    const open = ((sessions ?? []) as Array<{ id: string; status?: string | null; crm_snapshot?: Record<string, unknown> | null }>)
        .filter((s) => s.status === "in_progress");
    if (open.length !== 1) {
        return refuse("session_not_open", "The family's paperwork on this link is not open, so there is nothing to pay from it.");
    }
    const session = open[0]!;
    const customerId = str(session.crm_snapshot?.customer_id);
    if (!customerId) return refuse("no_household", "The paperwork on this link names no household.");

    const { data: contacts, error: contactError } = await supabase
        .from("customer_persons")
        .select("person_id, persons(id, first_name, last_name, email, phone, org_id)")
        .eq("org_id", input.orgId)
        .eq("customer_id", customerId)
        .eq("role_type", HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE);
    if (contactError) throw new Error(`household read failed: ${contactError.message}`);
    const candidates: LinkPayerCandidate[] = [];
    for (const row of (contacts ?? []) as Array<{ person_id?: string; persons?: Record<string, unknown> | Record<string, unknown>[] | null }>) {
        const p = Array.isArray(row.persons) ? row.persons[0] : row.persons;
        if (!row.person_id || !p || str(p.org_id) !== input.orgId) continue;
        if (candidates.some((c) => c.personId === row.person_id)) continue;
        const name = [str(p.first_name), str(p.last_name)].filter(Boolean).join(" ") || null;
        candidates.push({ personId: row.person_id, name, email: str(p.email) || null, phone: str(p.phone) || null });
    }
    if (candidates.length === 0) {
        return refuse("no_primary_contact", "This household has no primary contact. Add one to the household first.");
    }
    return {
        ok: true,
        link,
        value: { linkId: input.linkId, sessionId: session.id, customerId, candidates, choiceRequired: candidates.length > 1 },
    };
}

export async function bindLinkPayer(
    supabase: SupabaseClient,
    input: { orgId: string; linkId: string; personId: string; confirmed: boolean; actorUserId: string | null; now?: Date },
): Promise<Result<{ linkId: string; personId: string; boundAt: string; eventRecorded: boolean }>> {
    if (input.confirmed !== true) {
        return refuse("confirmation_required", "Confirm the payer before it is recorded on the link.");
    }
    const preview = await previewLinkPayerBinding(supabase, input);
    if (!preview.ok) return preview;
    const personId = str(input.personId);
    if (!preview.value.candidates.some((c) => c.personId === personId)) {
        return refuse("payer_not_a_candidate", "That person is not a primary contact of this link's household.");
    }

    const boundAt = (input.now ?? new Date()).toISOString();
    const metadata = {
        ...(preview.link?.metadata ?? {}),
        recipient_person_id: personId,
        recipient_bound_at: boundAt,
        recipient_bound_by: input.actorUserId,
        recipient_bound_via: "operator_payer_binding",
    };
    // Compare-and-set: only while the link still has no payer.
    const { data: updated, error } = await supabase
        .from("form_public_links")
        .update({ metadata })
        .eq("org_id", input.orgId)
        .eq("id", input.linkId)
        .is("metadata->>recipient_person_id", null)
        .select("id");
    if (error) throw new Error(`link update failed: ${error.message}`);
    if (!Array.isArray(updated) || updated.length !== 1) {
        return refuse("payer_already_bound", "This link was given a payer in the meantime. A payer is never replaced here.");
    }

    const { error: eventError } = await supabase.from("workflow_events").insert({
        org_id: input.orgId,
        event_type: LINK_PAYER_BOUND_EVENT,
        entity_type: "form_public_link",
        entity_id: input.linkId,
        payload: {
            link_id: input.linkId,
            packet_session_id: preview.value.sessionId,
            customer_id: preview.value.customerId,
            recipient_person_id: personId,
            candidate_count: preview.value.candidates.length,
            actor_user_id: input.actorUserId,
        },
    });
    if (eventError) console.warn("[link payer binding] event insert failed", eventError.message);
    return { ok: true, value: { linkId: input.linkId, personId, boundAt, eventRecorded: !eventError } };
}
