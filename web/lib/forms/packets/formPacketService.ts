import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import { loadPublishedFormEnvelope, type PublishedFormEnvelope } from "@/lib/public/forms/loadPublishedFormEnvelope";
import { computePacketOperatorReviewWarnings } from "@/lib/forms/packets/packetOperatorReviewWarnings";
import { emitOpportunityEnrollmentPacketSubmittedForReviewSafe } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";

/** RFC4122 UUID — align with formLaunchFkDerivation / public routes. */
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseTrustedUuidFk(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return UUID_RE.test(t) ? t : null;
}

/**
 * Packet CRM continuity (A1):
 * - `form_packet_sessions.crm_snapshot` is the canonical multi-step linkage context for a packet run.
 * - Draft FKs prefer snapshot columns when set (post-intake or explicit launch); launch metadata fills gaps.
 * - After each submitted step, non-null submission FKs are merged into the snapshot (server-side only).
 * Single-form public links are unaffected (no packet → no merge).
 */
export function launchFkStampFromCrmSnapshotRecord(crmSnapshot: Record<string, unknown>): LaunchFkStamp {
    return {
        person_id: parseTrustedUuidFk(crmSnapshot.person_id),
        customer_id: parseTrustedUuidFk(crmSnapshot.customer_id),
        customer_member_id: parseTrustedUuidFk(crmSnapshot.customer_member_id),
        opportunity_id: parseTrustedUuidFk(crmSnapshot.opportunity_id),
    };
}

/** Prefer session snapshot values when present; otherwise use launch-derived FKs. */
export function mergeLaunchFksPreferringSessionCrmSnapshot(
    launchFks: LaunchFkStamp,
    crmSnapshot: Record<string, unknown>
): LaunchFkStamp {
    const s = launchFkStampFromCrmSnapshotRecord(crmSnapshot);
    return {
        person_id: s.person_id ?? launchFks.person_id,
        customer_id: s.customer_id ?? launchFks.customer_id,
        customer_member_id: s.customer_member_id ?? launchFks.customer_member_id,
        opportunity_id: s.opportunity_id ?? launchFks.opportunity_id,
    };
}

/**
 * Participant identity (Slice 3):
 *
 * A packet session's `crm_snapshot` carries HOUSEHOLD identity — customer, member, opportunity. When
 * recipient links share ONE session (`packet_instance_id`), that snapshot is shared by every
 * participant, so it can never decide WHO is answering: the first link to launch the session would
 * pin `person_id` for everyone, and every later step would prefer that pin over its own recipient.
 *
 * On a shared session the RESOLVING LINK is the participant authority. Its `recipient_person_id` is
 * validated server-side during FK derivation (`applyOpportunityPacketLinkFkExtras` checks the person
 * exists in this org) and arrives here as `launchFks.person_id` — it is never client-asserted.
 *
 * A session that is NOT shared keeps the previous behaviour exactly: one link, one participant, and
 * the snapshot supplies continuity across steps.
 */
export function resolveParticipantFksForPacketDraft(args: {
    launchFks: LaunchFkStamp;
    crmSnapshot: Record<string, unknown>;
    /** True when the resolving link names its own recipient (Family Packet instance). */
    linkNamesRecipient: boolean;
}): LaunchFkStamp {
    const { launchFks, crmSnapshot, linkNamesRecipient } = args;
    const s = launchFkStampFromCrmSnapshotRecord(crmSnapshot);
    return {
        // Participant: the link wins when it names a recipient; otherwise unchanged behaviour.
        person_id: linkNamesRecipient ? launchFks.person_id : s.person_id ?? launchFks.person_id,
        // Household: always the shared snapshot when it knows.
        customer_id: s.customer_id ?? launchFks.customer_id,
        customer_member_id: s.customer_member_id ?? launchFks.customer_member_id,
        opportunity_id: s.opportunity_id ?? launchFks.opportunity_id,
    };
}

/** Does this link name its own recipient? Presence only — the id itself is validated at FK derivation. */
export function linkNamesRecipientPerson(metadata: Record<string, unknown>): boolean {
    const v = metadata.recipient_person_id;
    return typeof v === "string" && v.trim().length > 0;
}

/**
 * Merge only non-null FKs from a submitted step into the stored snapshot (does not clear keys).
 *
 * `householdOnly` withholds `person_id` — the snapshot of a SHARED session must stay household-scoped,
 * or each submit re-pins the participant for every other recipient.
 */
export function mergeNonNullSubmissionFksIntoCrmSnapshot(
    existing: Record<string, unknown>,
    fks: LaunchFkStamp,
    options?: { householdOnly?: boolean }
): Record<string, unknown> {
    const out = { ...existing };
    if (fks.person_id && !options?.householdOnly) out.person_id = fks.person_id;
    if (fks.customer_id) out.customer_id = fks.customer_id;
    if (fks.customer_member_id) out.customer_member_id = fks.customer_member_id;
    if (fks.opportunity_id) out.opportunity_id = fks.opportunity_id;
    return out;
}

export async function syncPacketSessionCrmSnapshotFromSubmission(
    supabase: SupabaseClient,
    orgId: string,
    packetSessionId: string,
    fks: LaunchFkStamp
): Promise<{ error: Error | null }> {
    const { data: sess, error: loadErr } = await supabase
        .from("form_packet_sessions")
        .select("crm_snapshot, status, packet_instance_id")
        .eq("id", packetSessionId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (loadErr) return { error: new Error(loadErr.message) };
    const row = sess as { crm_snapshot?: unknown; status?: string; packet_instance_id?: string | null } | null;
    if (!row || row.status !== "in_progress") {
        return { error: null };
    }

    const existing = (row.crm_snapshot && typeof row.crm_snapshot === "object" && !Array.isArray(row.crm_snapshot)
        ? row.crm_snapshot
        : {}) as Record<string, unknown>;
    // Shared session: household facts only. Writing the submitter's person here would re-pin the
    // participant for every other recipient on their next step.
    const shared = typeof row.packet_instance_id === "string" && row.packet_instance_id.trim().length > 0;
    const merged = mergeNonNullSubmissionFksIntoCrmSnapshot(existing, fks, { householdOnly: shared });

    const { error: upErr } = await supabase
        .from("form_packet_sessions")
        .update({
            crm_snapshot: merged,
            updated_at: new Date().toISOString(),
        })
        .eq("id", packetSessionId)
        .eq("org_id", orgId)
        .eq("status", "in_progress");

    return { error: upErr ? new Error(upErr.message) : null };
}

export type PacketDefinitionItemRow = {
    id: string;
    sequence_index: number;
    form_definition_id: string;
    pinned_form_definition_version_id: string | null;
};

export type PacketSessionRow = {
    id: string;
    org_id: string;
    packet_definition_id: string;
    started_via_public_link_id: string;
    status: string;
    launch_context: Record<string, unknown>;
    crm_snapshot: Record<string, unknown>;
    shared_values: Record<string, unknown>;
    current_sequence_index: number;
    /** Family Packet instance id. When set, recipient links share THIS session. */
    packet_instance_id?: string | null;
    /** D-95. The Enrollment process_instance this session realizes; NULL for other packets. */
    process_instance_id?: string | null;
};

/** Family Packet instance id from link metadata (`packet_instance_id` or `share_group_id`). */
export function pickPacketInstanceId(metadata: Record<string, unknown>): string | null {
    const v = metadata.packet_instance_id ?? metadata.share_group_id;
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

export type SessionResolution = "reuse_instance" | "reuse_link" | "create";

/**
 * Decide how a public link resolves to a packet session:
 *  - reuse_instance: a session already exists for this family packet instance (shared answers)
 *  - reuse_link:     a session already exists started by this exact link (legacy / first link)
 *  - create:         no session yet — create one
 */
export function decideSessionResolution(args: {
    packetInstanceId: string | null;
    instanceSessionExists: boolean;
    linkSessionExists: boolean;
}): SessionResolution {
    if (args.packetInstanceId && args.instanceSessionExists) return "reuse_instance";
    if (args.linkSessionExists) return "reuse_link";
    return "create";
}

export type PacketSessionItemRow = {
    id: string;
    packet_session_id: string;
    packet_item_id: string;
    sequence_index: number;
    status: string;
    form_submission_id: string | null;
    /**
     * D-94. The version this participant transacts against, resolved once at session
     * realization. NULL only on sessions created before D-94, where what was rendered is
     * not recoverable and must not be fabricated.
     */
    resolved_form_definition_version_id?: string | null;
};

export function shallowMergeSharedValues(
    existing: Record<string, unknown>,
    values: Record<string, unknown>
): Record<string, unknown> {
    return { ...existing, ...values };
}

export function pickLaunchContextForPacketSession(metadata: Record<string, unknown>): Record<string, unknown> {
    const keys = [
        "form_context_mode",
        "packet_definition_id",
        "source_entity_type",
        "source_entity_id",
        "prefill_enabled",
        "prefill_field_map",
        "lead_capture",
        "intake",
        "label",
        "launch_surface",
        "selected_customer_member_id",
        "recipient_person_id",
        "delivery_intent",
        // Family Packet instance context
        "packet_instance_id",
        "selected_customer_member_ids",
    ] as const;
    const out: Record<string, unknown> = {};
    for (const k of keys) {
        if (k in metadata) out[k] = metadata[k];
    }
    return out;
}

/**
 * Seed a new session's snapshot. `householdOnly` (Family Packet instance) omits `person_id` so the
 * FIRST recipient link to launch the shared session does not pin the participant for the rest.
 */
export function crmSnapshotFromLaunchFks(
    fks: LaunchFkStamp,
    options?: { householdOnly?: boolean }
): Record<string, unknown> {
    return {
        ...(options?.householdOnly ? {} : { person_id: fks.person_id }),
        customer_id: fks.customer_id,
        customer_member_id: fks.customer_member_id,
        opportunity_id: fks.opportunity_id,
    };
}

export async function listPacketDefinitionItems(
    supabase: SupabaseClient,
    orgId: string,
    packetDefinitionId: string
): Promise<{ data: PacketDefinitionItemRow[] | null; error: Error | null }> {
    const { data, error } = await supabase
        .from("form_packet_items")
        .select("id, sequence_index, form_definition_id, pinned_form_definition_version_id")
        .eq("org_id", orgId)
        .eq("packet_definition_id", packetDefinitionId)
        .order("sequence_index", { ascending: true });

    if (error) return { data: null, error: new Error(error.message) };
    return { data: (data ?? []) as PacketDefinitionItemRow[], error: null };
}

/** One session per public link (unique constraint). Materializes all session items (linear V1). */
export async function ensurePacketSessionForPublicLink(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        linkId: string;
        packetDefinitionId: string;
        linkMetadata: Record<string, unknown>;
        launchFks: LaunchFkStamp;
        /**
         * D-95. The Enrollment journey this session realizes. Absent for every existing
         * caller, which keeps non-Enrollment packet launches byte-identical: the column
         * stays NULL and the one-current-session constraint does not apply to them.
         */
        processInstanceId?: string | null;
    }
): Promise<{ session: PacketSessionRow; items: PacketSessionItemRow[]; error: Error | null }> {
    const { orgId, linkId, packetDefinitionId, linkMetadata, launchFks } = input;
    const packetInstanceId = pickPacketInstanceId(linkMetadata);

    const loadSessionWithItems = async (sess: PacketSessionRow) => {
        const { data: items } = await supabase
            .from("form_packet_session_items")
            .select("id, packet_session_id, packet_item_id, sequence_index, status, form_submission_id, resolved_form_definition_version_id")
            .eq("packet_session_id", sess.id)
            .order("sequence_index", { ascending: true });
        return { session: sess, items: (items ?? []) as PacketSessionItemRow[], error: null };
    };

    // Family Packet: all recipient links for an instance resolve to ONE shared session.
    if (packetInstanceId) {
        const { data: instSess } = await supabase
            .from("form_packet_sessions")
            .select("*")
            .eq("org_id", orgId)
            .eq("packet_instance_id", packetInstanceId)
            .maybeSingle();
        if (instSess) return loadSessionWithItems(instSess as PacketSessionRow);
    }

    // Legacy / first link of an instance: one session per starting link.
    const { data: existingSess } = await supabase
        .from("form_packet_sessions")
        .select("*")
        .eq("started_via_public_link_id", linkId)
        .maybeSingle();

    if (existingSess) return loadSessionWithItems(existingSess as PacketSessionRow);

    const { data: defItems, error: itemsErr } = await listPacketDefinitionItems(supabase, orgId, packetDefinitionId);
    if (itemsErr) return { session: null as never, items: [], error: itemsErr };
    if (!defItems?.length) {
        return { session: null as never, items: [], error: new Error("Packet definition has no steps") };
    }

    const launch_context = pickLaunchContextForPacketSession(linkMetadata);
    const crm_snapshot = crmSnapshotFromLaunchFks(launchFks, { householdOnly: Boolean(packetInstanceId) });

    const { data: insertedSess, error: insErr } = await supabase
        .from("form_packet_sessions")
        .insert({
            org_id: orgId,
            packet_definition_id: packetDefinitionId,
            started_via_public_link_id: linkId,
            status: "in_progress",
            process_instance_id: input.processInstanceId ?? null,
            launch_context,
            crm_snapshot,
            shared_values: {},
            current_sequence_index: defItems[0].sequence_index,
            metadata: {},
            ...(packetInstanceId ? { packet_instance_id: packetInstanceId } : {}),
        })
        .select("*")
        .single();

    if (insErr) {
        // Race: another recipient link (same instance) or the same link created the session first.
        if (insErr.code === "23505") {
            if (packetInstanceId) {
                const { data: racedInst } = await supabase
                    .from("form_packet_sessions")
                    .select("*")
                    .eq("org_id", orgId)
                    .eq("packet_instance_id", packetInstanceId)
                    .maybeSingle();
                if (racedInst) return loadSessionWithItems(racedInst as PacketSessionRow);
            }
            const { data: raced } = await supabase
                .from("form_packet_sessions")
                .select("*")
                .eq("started_via_public_link_id", linkId)
                .maybeSingle();
            if (raced) return loadSessionWithItems(raced as PacketSessionRow);
        }
        return { session: null as never, items: [], error: new Error(insErr.message) };
    }

    const sess = insertedSess as PacketSessionRow;

    // D-94 — resolve the participant's Form versions ONCE, here, at session realization.
    //
    // Configuration floats; an active participant transaction pins. Resolving per step at read
    // time meant a republish mid-session changed what the parent saw next, and left no record of
    // which version they actually completed or signed. Each step's version is chosen now and
    // never re-chosen.
    //
    // A definition-level pin still wins where an operator set one: that is the operator saying
    // "this packet always uses this exact version", which is a stronger statement than "whatever
    // happened to be published when this parent started".
    const resolvedVersionByItemId = new Map<string, string>();
    for (const di of defItems) {
        const pinned = (di as { pinned_form_definition_version_id?: string | null })
            .pinned_form_definition_version_id;
        const envelope = await loadPublishedFormEnvelope(
            supabase,
            orgId,
            di.form_definition_id,
            pinned ?? null,
        );
        // Fail closed. A step with no published version cannot be transacted against, and
        // creating the session anyway would hand a parent a packet that breaks partway through —
        // after they had already answered questions.
        if (!envelope) {
            return {
                session: null as never,
                items: [],
                error: new Error(
                    `No published version for packet step form ${di.form_definition_id}; session not created.`,
                ),
            };
        }
        resolvedVersionByItemId.set(di.id, envelope.formDefinitionVersionId);
    }

    const sessionItemsPayload = defItems.map((di, idx) => ({
        org_id: orgId,
        packet_session_id: sess.id,
        packet_item_id: di.id,
        sequence_index: di.sequence_index,
        status: idx === 0 ? "active" : "pending",
        resolved_form_definition_version_id: resolvedVersionByItemId.get(di.id) ?? null,
    }));

    const { error: siErr } = await supabase.from("form_packet_session_items").insert(sessionItemsPayload);
    if (siErr) {
        return { session: null as never, items: [], error: new Error(siErr.message) };
    }

    const { data: loadedItems } = await supabase
        .from("form_packet_session_items")
        .select("id, packet_session_id, packet_item_id, sequence_index, status, form_submission_id, resolved_form_definition_version_id")
        .eq("packet_session_id", sess.id)
        .order("sequence_index", { ascending: true });

    return { session: sess, items: (loadedItems ?? []) as PacketSessionItemRow[], error: null };
}

export function findActivePacketSessionItem(items: PacketSessionItemRow[]): PacketSessionItemRow | null {
    return items.find((i) => i.status === "active") ?? null;
}

export async function loadPacketDefinitionName(
    supabase: SupabaseClient,
    orgId: string,
    packetDefinitionId: string
): Promise<string | null> {
    const { data } = await supabase
        .from("form_packet_definitions")
        .select("name")
        .eq("id", packetDefinitionId)
        .eq("org_id", orgId)
        .maybeSingle();
    const name = (data as { name?: string } | null)?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
}

export type PacketStepSummary = { sequence_index: number; form_name: string };

/** Ordered step labels for public packet progress UI. */
export async function loadPacketDefinitionStepSummaries(
    supabase: SupabaseClient,
    orgId: string,
    packetDefinitionId: string
): Promise<{ data: PacketStepSummary[] | null; error: Error | null }> {
    const { data, error } = await supabase
        .from("form_packet_items")
        .select("sequence_index, form_definitions ( name )")
        .eq("org_id", orgId)
        .eq("packet_definition_id", packetDefinitionId)
        .order("sequence_index", { ascending: true });
    if (error) return { data: null, error: new Error(error.message) };
    type Row = {
        sequence_index: number;
        form_definitions: { name: string } | { name: string }[] | null;
    };
    const out: PacketStepSummary[] = [];
    for (const r of (data ?? []) as Row[]) {
        const fd = Array.isArray(r.form_definitions) ? r.form_definitions[0] : r.form_definitions;
        const name = typeof fd?.name === "string" && fd.name.trim() ? fd.name.trim() : "Form";
        out.push({ sequence_index: r.sequence_index, form_name: name });
    }
    return { data: out, error: null };
}

export async function resolveActiveStepEnvelope(
    supabase: SupabaseClient,
    orgId: string,
    activeItem: PacketSessionItemRow,
    definitionItems: PacketDefinitionItemRow[],
    opts?: { followLatestPublished?: boolean }
): Promise<{ envelope: PublishedFormEnvelope | null; error: Error | null }> {
    const defRow = definitionItems.find((d) => d.id === activeItem.packet_item_id);
    if (!defRow) return { envelope: null, error: new Error("Packet step definition missing") };
    // D-94 — the session's own resolved version is the authority for an active transaction.
    //
    // Precedence, strongest first:
    //   1. the session item's resolved version  — what THIS parent is transacting against;
    //   2. the packet definition pin            — pre-D-94 sessions, and explicit operator pins;
    //   3. latest published                     — pre-D-94 sessions with no pin.
    //
    // `followLatestPublished` deliberately does NOT override (1). It exists for operator preview
    // and packet authoring, where "show me the current form" is the question; honouring it against
    // a live session would reintroduce exactly the mid-session drift this decision removes.
    //
    // Steps 2 and 3 are the compatibility path for sessions created before this column existed,
    // where the rendered version was never recorded and cannot be recovered.
    const sessionResolved =
        (activeItem as { resolved_form_definition_version_id?: string | null })
            .resolved_form_definition_version_id ?? null;
    const pin =
        sessionResolved ??
        (opts?.followLatestPublished ? null : (defRow.pinned_form_definition_version_id as string | null));
    const env = await loadPublishedFormEnvelope(supabase, orgId, defRow.form_definition_id, pin);
    if (!env) return { envelope: null, error: new Error("No published version for packet step form") };
    return { envelope: env, error: null };
}

export type AdvancePacketResult = {
    packet_complete: boolean;
    next_form_available: boolean;
    next_sequence_index: number | null;
};

export async function advancePacketSessionAfterSubmit(
    supabase: SupabaseClient,
    orgId: string,
    submissionId: string,
    submittedValues: Record<string, unknown>
): Promise<{ result: AdvancePacketResult | null; error: Error | null }> {
    const { data: row, error: findErr } = await supabase
        .from("form_packet_session_items")
        .select("id, packet_session_id, sequence_index, status")
        .eq("form_submission_id", submissionId)
        .maybeSingle();

    if (findErr) return { result: null, error: new Error(findErr.message) };
    if (!row) return { result: null, error: null };

    const itemId = (row as { id: string }).id;
    const packetSessionId = (row as { packet_session_id: string }).packet_session_id;
    const curSeq = (row as { sequence_index: number }).sequence_index;

    const { data: sessionRow, error: sessLoadErr } = await supabase
        .from("form_packet_sessions")
        .select("*")
        .eq("id", packetSessionId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (sessLoadErr) return { result: null, error: new Error(sessLoadErr.message) };
    const session = sessionRow as PacketSessionRow | null;
    if (!session) return { result: null, error: new Error("Packet session not found") };

    if (session.status !== "in_progress") {
        return {
            result: { packet_complete: true, next_form_available: false, next_sequence_index: null },
            error: null,
        };
    }

    const shared = shallowMergeSharedValues(
        (session.shared_values ?? {}) as Record<string, unknown>,
        submittedValues
    );

    const now = new Date().toISOString();

    const { error: upItemErr } = await supabase
        .from("form_packet_session_items")
        .update({ status: "submitted", submitted_at: now })
        .eq("id", itemId)
        .eq("org_id", orgId);

    if (upItemErr) return { result: null, error: new Error(upItemErr.message) };

    const { data: allItems, error: listErr } = await supabase
        .from("form_packet_session_items")
        .select("id, sequence_index, status")
        .eq("packet_session_id", packetSessionId)
        .eq("org_id", orgId)
        .order("sequence_index", { ascending: true });

    if (listErr) return { result: null, error: new Error(listErr.message) };

    const sorted = (allItems ?? []) as { id: string; sequence_index: number; status: string }[];
    const nextPending = sorted.find((i) => i.sequence_index > curSeq && i.status === "pending");

    if (nextPending) {
        const { error: actErr } = await supabase
            .from("form_packet_session_items")
            .update({ status: "active" })
            .eq("id", nextPending.id)
            .eq("org_id", orgId);

        if (actErr) return { result: null, error: new Error(actErr.message) };

        const { error: sessErr } = await supabase
            .from("form_packet_sessions")
            .update({
                shared_values: shared,
                current_sequence_index: nextPending.sequence_index,
                updated_at: now,
            })
            .eq("id", packetSessionId)
            .eq("org_id", orgId);

        if (sessErr) return { result: null, error: new Error(sessErr.message) };

        return {
            result: {
                packet_complete: false,
                next_form_available: true,
                next_sequence_index: nextPending.sequence_index,
            },
            error: null,
        };
    }

    const snapObj =
        session.crm_snapshot && typeof session.crm_snapshot === "object" && !Array.isArray(session.crm_snapshot)
            ? (session.crm_snapshot as Record<string, unknown>)
            : {};

    const warnings = await computePacketOperatorReviewWarnings({
        supabase,
        orgId,
        crmSnapshot: snapObj,
        sharedValues: shared,
    });

    const { error: doneErr } = await supabase
        .from("form_packet_sessions")
        .update({
            shared_values: shared,
            status: "completed",
            completed_at: now,
            updated_at: now,
            operator_review_status: "needs_review",
            operator_review_warnings: warnings,
        })
        .eq("id", packetSessionId)
        .eq("org_id", orgId);

    if (doneErr) return { result: null, error: new Error(doneErr.message) };

    const revEmit = await emitOpportunityEnrollmentPacketSubmittedForReviewSafe({
        orgId,
        packetSessionId,
        warningCount: warnings.length,
    });
    if (revEmit.error) {
        console.error("[packet advance] submitted_for_review projection failed:", revEmit.error.message);
    }

    return {
        result: {
            packet_complete: true,
            next_form_available: false,
            next_sequence_index: null,
        },
        error: null,
    };
}
