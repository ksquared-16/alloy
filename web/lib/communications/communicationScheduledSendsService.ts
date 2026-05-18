import type { SupabaseClient } from "@supabase/supabase-js";

import { scheduledSendAttentionCounts } from "@/lib/agent/taskAssist/taskAssistScheduledSendPresentation";
import { getTaskAssistProposalById } from "@/lib/agent/taskAssist/taskAssistProposalPersistence";
import {
    isTaskAssistV1Uuid,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";

export type CommunicationScheduledSendRow = {
    id: string;
    org_id: string;
    created_by: string;
    proposal_id: string | null;
    entity_type: string;
    entity_id: string;
    recipient_person_id: string;
    channel: "sms" | "email";
    subject_snapshot: string | null;
    body_snapshot: string;
    communication_provider_binding_id: string | null;
    scheduled_for: string;
    status: string;
    approved_at: string;
    approved_by: string;
    communication_message_id: string | null;
    source: string;
    metadata: Record<string, unknown>;
    claimed_at: string | null;
    claim_token: string | null;
    created_at: string;
    updated_at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function mapRow(data: Record<string, unknown>): CommunicationScheduledSendRow {
    return {
        id: String(data.id),
        org_id: String(data.org_id),
        created_by: String(data.created_by),
        proposal_id: data.proposal_id != null ? String(data.proposal_id) : null,
        entity_type: String(data.entity_type),
        entity_id: String(data.entity_id),
        recipient_person_id: String(data.recipient_person_id),
        channel: data.channel === "email" ? "email" : "sms",
        subject_snapshot: data.subject_snapshot != null ? String(data.subject_snapshot) : null,
        body_snapshot: String(data.body_snapshot),
        communication_provider_binding_id:
            data.communication_provider_binding_id != null ? String(data.communication_provider_binding_id) : null,
        scheduled_for: String(data.scheduled_for),
        status: String(data.status),
        approved_at: String(data.approved_at),
        approved_by: String(data.approved_by),
        communication_message_id: data.communication_message_id != null ? String(data.communication_message_id) : null,
        source: String(data.source),
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        claimed_at: data.claimed_at != null ? String(data.claimed_at) : null,
        claim_token: data.claim_token != null ? String(data.claim_token) : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
    };
}

function mergeMetadata(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
    const b = isRecord(base) ? base : {};
    return { ...b, ...patch };
}

export type CommunicationScheduledSendCreateInput = {
    entity_id: string;
    recipient_person_id: string;
    channel: "sms" | "email";
    subject_snapshot: string | null;
    body_snapshot: string;
    communication_provider_binding_id: string | null;
    scheduled_for_iso: string;
    source: "task_assist";
    proposal_id: string | null;
    metadata: Record<string, unknown>;
};

export function validateCommunicationScheduledSendCreateBody(
    body: unknown,
    opts: { nowMs: number }
): { ok: false; error: string; message: string } | { ok: true; value: CommunicationScheduledSendCreateInput } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "Body must be a JSON object." };
    }
    const wf = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(body);
    if (wf.length) {
        return { ok: false, error: "WORKFLOW_KEYS_FORBIDDEN", message: wf[0] ?? "Forbidden key." };
    }
    const allowed = new Set([
        "entity_type",
        "entity_id",
        "recipient_person_id",
        "channel",
        "subject_snapshot",
        "body_snapshot",
        "communication_provider_binding_id",
        "scheduled_for",
        "source",
        "proposal_id",
        "metadata",
    ]);
    for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    if (body.entity_type !== "opportunities") {
        return { ok: false, error: "ENTITY_TYPE_UNSUPPORTED", message: "entity_type must be opportunities." };
    }
    const entityId = typeof body.entity_id === "string" ? body.entity_id.trim() : "";
    if (!entityId || !isTaskAssistV1Uuid(entityId)) {
        return { ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be a UUID." };
    }
    const recipientPersonId = typeof body.recipient_person_id === "string" ? body.recipient_person_id.trim() : "";
    if (!recipientPersonId || !isTaskAssistV1Uuid(recipientPersonId)) {
        return { ok: false, error: "RECIPIENT_INVALID", message: "recipient_person_id must be a UUID." };
    }
    const ch = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "";
    if (ch !== "sms" && ch !== "email") {
        return { ok: false, error: "CHANNEL_UNSUPPORTED", message: "channel must be sms or email." };
    }
    const bodySnap = typeof body.body_snapshot === "string" ? body.body_snapshot.trim() : "";
    if (!bodySnap) {
        return { ok: false, error: "BODY_SNAPSHOT_REQUIRED", message: "body_snapshot is required." };
    }
    let subjectSnap: string | null = null;
    if (ch === "email") {
        const sub = typeof body.subject_snapshot === "string" ? body.subject_snapshot.trim() : "";
        if (!sub) {
            return { ok: false, error: "SUBJECT_REQUIRED", message: "subject_snapshot is required for email." };
        }
        subjectSnap = sub;
    } else {
        if (body.subject_snapshot != null && String(body.subject_snapshot).trim() !== "") {
            return { ok: false, error: "SUBJECT_NOT_APPLICABLE", message: "subject_snapshot must be omitted for sms." };
        }
        subjectSnap = null;
    }
    const schedRaw = typeof body.scheduled_for === "string" ? body.scheduled_for.trim() : "";
    const schedMs = Date.parse(schedRaw);
    if (!schedRaw || Number.isNaN(schedMs)) {
        return { ok: false, error: "SCHEDULED_FOR_INVALID", message: "scheduled_for must be a parseable ISO-8601 timestamp." };
    }
    if (schedMs <= opts.nowMs) {
        return { ok: false, error: "SCHEDULED_FOR_NOT_FUTURE", message: "scheduled_for must be in the future." };
    }
    if (body.source !== "task_assist") {
        return { ok: false, error: "SOURCE_INVALID", message: "source must be task_assist." };
    }
    let proposalId: string | null = null;
    if (body.proposal_id != null && body.proposal_id !== "") {
        if (typeof body.proposal_id !== "string" || !isTaskAssistV1Uuid(body.proposal_id.trim())) {
            return { ok: false, error: "PROPOSAL_ID_INVALID", message: "proposal_id must be a UUID or null." };
        }
        proposalId = body.proposal_id.trim();
    }
    let bindingId: string | null = null;
    if (body.communication_provider_binding_id != null && body.communication_provider_binding_id !== "") {
        if (typeof body.communication_provider_binding_id !== "string" || !isTaskAssistV1Uuid(body.communication_provider_binding_id.trim())) {
            return { ok: false, error: "BINDING_ID_INVALID", message: "communication_provider_binding_id must be a UUID or null." };
        }
        bindingId = body.communication_provider_binding_id.trim();
    }
    const metadata = isRecord(body.metadata) ? (body.metadata as Record<string, unknown>) : {};

    return {
        ok: true,
        value: {
            entity_id: entityId,
            recipient_person_id: recipientPersonId,
            channel: ch,
            subject_snapshot: subjectSnap,
            body_snapshot: bodySnap,
            communication_provider_binding_id: bindingId,
            scheduled_for_iso: new Date(schedMs).toISOString(),
            source: "task_assist",
            proposal_id: proposalId,
            metadata,
        },
    };
}

export async function createCommunicationScheduledSend(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    input: CommunicationScheduledSendCreateInput;
    approvedAtIso: string;
}): Promise<{ ok: true; row: CommunicationScheduledSendRow } | { ok: false; error: string; message: string; status?: number }> {
    const schedMs = Date.parse(params.input.scheduled_for_iso);
    const apprMs = Date.parse(params.approvedAtIso);
    if (Number.isNaN(schedMs) || Number.isNaN(apprMs) || schedMs <= apprMs) {
        return { ok: false, error: "SCHEDULED_FOR_INVALID", message: "scheduled_for must be after approval time (DB constraint)." };
    }

    if (params.input.proposal_id) {
        const pr = await getTaskAssistProposalById({
            supabase: params.supabase,
            orgId: params.orgId,
            proposalId: params.input.proposal_id,
        });
        if (!pr.ok) {
            return { ok: false, error: pr.error, message: pr.message, status: pr.status };
        }
        if (pr.row.entity_type !== "opportunities" || pr.row.entity_id !== params.input.entity_id) {
            return { ok: false, error: "PROPOSAL_ENTITY_MISMATCH", message: "proposal_id does not match entity.", status: 400 };
        }
    }

    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .insert({
            org_id: params.orgId,
            created_by: params.userId,
            proposal_id: params.input.proposal_id,
            entity_type: "opportunities",
            entity_id: params.input.entity_id,
            recipient_person_id: params.input.recipient_person_id,
            channel: params.input.channel,
            subject_snapshot: params.input.subject_snapshot,
            body_snapshot: params.input.body_snapshot,
            communication_provider_binding_id: params.input.communication_provider_binding_id,
            scheduled_for: params.input.scheduled_for_iso,
            status: "pending",
            approved_at: params.approvedAtIso,
            approved_by: params.userId,
            source: params.input.source,
            metadata: params.input.metadata,
        })
        .select("*")
        .single();

    if (error || !data) {
        console.error("[createCommunicationScheduledSend]", error);
        return { ok: false, error: "DB_INSERT_FAILED", message: error?.message ?? "Insert failed." };
    }

    return { ok: true, row: mapRow(data as Record<string, unknown>) };
}

export async function listCommunicationScheduledSendsForEntity(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: "opportunities";
    entityId: string;
}): Promise<{ ok: true; rows: CommunicationScheduledSendRow[] } | { ok: false; error: string; message: string }> {
    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("entity_type", params.entityType)
        .eq("entity_id", params.entityId)
        .order("scheduled_for", { ascending: true });

    if (error) {
        console.error("[listCommunicationScheduledSendsForEntity]", error);
        return { ok: false, error: "DB_LIST_FAILED", message: error.message };
    }
    return { ok: true, rows: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) };
}

export async function getCommunicationScheduledSendById(params: {
    supabase: SupabaseClient;
    orgId: string;
    id: string;
}): Promise<{ ok: true; row: CommunicationScheduledSendRow } | { ok: false; error: string; message: string; status: number }> {
    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("id", params.id)
        .maybeSingle();

    if (error) {
        return { ok: false, error: "DB_READ_FAILED", message: error.message, status: 500 };
    }
    if (!data) {
        return { ok: false, error: "NOT_FOUND", message: "Scheduled send not found.", status: 404 };
    }
    return { ok: true, row: mapRow(data as Record<string, unknown>) };
}

export async function cancelCommunicationScheduledSend(params: {
    supabase: SupabaseClient;
    orgId: string;
    id: string;
}): Promise<{ ok: true; row: CommunicationScheduledSendRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getCommunicationScheduledSendById({
        supabase: params.supabase,
        orgId: params.orgId,
        id: params.id,
    });
    if (!cur.ok) return cur;

    const st = cur.row.status.trim().toLowerCase();
    if (st !== "pending" && st !== "failed") {
        return {
            ok: false,
            error: "INVALID_STATUS",
            message: "Only pending or failed scheduled sends can be canceled.",
            status: 409,
        };
    }

    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .update({ status: "canceled" })
        .eq("org_id", params.orgId)
        .eq("id", params.id)
        .eq("status", st)
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Cancel failed.", status: 409 };
    }
    return { ok: true, row: mapRow(data as Record<string, unknown>) };
}

export type CommunicationScheduledSendUpdateInput = {
    scheduled_for_iso: string;
    body_snapshot: string;
    subject_snapshot: string | null;
};

export function validateCommunicationScheduledSendUpdateBody(
    body: unknown,
    row: CommunicationScheduledSendRow,
    opts: { nowMs: number }
): { ok: false; error: string; message: string } | { ok: true; value: CommunicationScheduledSendUpdateInput } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "Body must be a JSON object." };
    }
    const wf = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(body);
    if (wf.length) {
        return { ok: false, error: "WORKFLOW_KEYS_FORBIDDEN", message: wf[0] ?? "Forbidden key." };
    }
    const allowed = new Set(["scheduled_for", "body_snapshot", "subject_snapshot"]);
    for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    const schedRaw = typeof body.scheduled_for === "string" ? body.scheduled_for.trim() : "";
    const schedMs = Date.parse(schedRaw);
    if (!schedRaw || Number.isNaN(schedMs)) {
        return { ok: false, error: "SCHEDULED_FOR_INVALID", message: "scheduled_for must be a parseable ISO-8601 timestamp." };
    }
    if (schedMs <= opts.nowMs) {
        return { ok: false, error: "SCHEDULED_FOR_NOT_FUTURE", message: "scheduled_for must be in the future." };
    }
    const bodySnap = typeof body.body_snapshot === "string" ? body.body_snapshot.trim() : "";
    if (!bodySnap) {
        return { ok: false, error: "BODY_SNAPSHOT_REQUIRED", message: "body_snapshot is required." };
    }
    let subjectSnap: string | null = null;
    if (row.channel === "email") {
        const sub = typeof body.subject_snapshot === "string" ? body.subject_snapshot.trim() : "";
        if (!sub) {
            return { ok: false, error: "SUBJECT_REQUIRED", message: "subject_snapshot is required for email." };
        }
        subjectSnap = sub;
    } else if (body.subject_snapshot != null && String(body.subject_snapshot).trim() !== "") {
        return { ok: false, error: "SUBJECT_NOT_APPLICABLE", message: "subject_snapshot must be omitted for sms." };
    }
    return {
        ok: true,
        value: {
            scheduled_for_iso: new Date(schedMs).toISOString(),
            body_snapshot: bodySnap,
            subject_snapshot: subjectSnap,
        },
    };
}

export async function updateCommunicationScheduledSend(params: {
    supabase: SupabaseClient;
    orgId: string;
    id: string;
    input: CommunicationScheduledSendUpdateInput;
    nowIso: string;
}): Promise<{ ok: true; row: CommunicationScheduledSendRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getCommunicationScheduledSendById({
        supabase: params.supabase,
        orgId: params.orgId,
        id: params.id,
    });
    if (!cur.ok) return cur;

    const st = cur.row.status.trim().toLowerCase();
    if (st === "queued" || st === "sent_to_provider" || st === "delivered" || st === "canceled" || st === "cancelled") {
        return {
            ok: false,
            error: "INVALID_STATUS",
            message: "Only pending or failed scheduled sends can be edited.",
            status: 409,
        };
    }
    if (st === "claimed") {
        return {
            ok: false,
            error: "INVALID_STATUS",
            message: "Send is being processed. Wait a moment or use Process now.",
            status: 409,
        };
    }

    const patch: Record<string, unknown> = {
        scheduled_for: params.input.scheduled_for_iso,
        body_snapshot: params.input.body_snapshot,
        subject_snapshot: params.input.subject_snapshot,
        metadata: mergeMetadata(cur.row.metadata, { last_edited_at: params.nowIso, source: "admin_patch" }),
    };
    if (st === "failed") {
        patch.status = "pending";
        patch.metadata = mergeMetadata(patch.metadata as Record<string, unknown>, {
            rescheduled_from_failed_at: params.nowIso,
        });
    }

    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .update(patch)
        .eq("org_id", params.orgId)
        .eq("id", params.id)
        .in("status", st === "failed" ? ["failed"] : ["pending"])
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Update failed.", status: 409 };
    }
    return { ok: true, row: mapRow(data as Record<string, unknown>) };
}

export async function summarizeCommunicationScheduledSendAttention(params: {
    supabase: SupabaseClient;
    orgId: string;
    now?: Date;
}): Promise<
    | { ok: true; failed: number; needs_attention: number }
    | { ok: false; error: string; message: string }
> {
    const now = params.now ?? new Date();
    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .select("status, scheduled_for")
        .eq("org_id", params.orgId)
        .in("status", ["pending", "claimed", "failed"]);

    if (error) {
        return { ok: false, error: "DB_LIST_FAILED", message: error.message };
    }

    const counts = scheduledSendAttentionCounts(
        (data ?? []).map((r) => ({
            status: String((r as { status?: string }).status ?? ""),
            scheduled_for: String((r as { scheduled_for?: string }).scheduled_for ?? ""),
        })),
        now
    );
    return { ok: true, ...counts };
}

/** Minimum `now - claimed_at` before a `claimed` row may be released to `pending` (crash recovery; reduces overlap with a slow finalize). */
export const STALE_CLAIM_RELEASE_MINIMUM_AGE_MS = 30 * 60 * 1000;

export type ReleaseStaleClaimedCommunicationScheduledSendsResult = {
    released: number;
    ids: string[];
};

/**
 * Returns **`claimed`** rows with **`communication_message_id` null** and **`claimed_at` &lt; `olderThan`** to **`pending`**
 * (clears **`claim_token`** / **`claimed_at`**) so **`processDueCommunicationScheduledSends`** can claim them again.
 *
 * **Not called from {@link processDueCommunicationScheduledSends}** — use a separate cron step or manual ops after incidents.
 *
 * **Safety:** Callers must satisfy **`now.getTime() - olderThan.getTime() ≥ {@link STALE_CLAIM_RELEASE_MINIMUM_AGE_MS}`** so a host that is still finalizing
 * a successful enqueue is unlikely to overlap. This does **not** eliminate the rare theoretical double-send if enqueue
 * succeeded and the **`queued`** row update is delayed past that window — see sprint doc **§6 / Card 5 hardening**.
 */
export async function releaseStaleClaimedCommunicationScheduledSends(params: {
    supabase: SupabaseClient;
    now: Date;
    /** Only rows with `claimed_at` strictly before this instant are selected. */
    olderThan: Date;
    orgId?: string | null;
    /** Max rows to release in one call (default 100, cap 500). */
    limit?: number;
}): Promise<
    { ok: true; result: ReleaseStaleClaimedCommunicationScheduledSendsResult } | { ok: false; error: string; message: string }
> {
    const nowMs = params.now.getTime();
    const olderMs = params.olderThan.getTime();
    if (Number.isNaN(olderMs) || olderMs >= nowMs) {
        return { ok: false, error: "OLDER_THAN_INVALID", message: "olderThan must be a valid time strictly before now." };
    }
    if (nowMs - olderMs < STALE_CLAIM_RELEASE_MINIMUM_AGE_MS) {
        return {
            ok: false,
            error: "OLDER_THAN_TOO_RECENT",
            message: `olderThan must be at least ${STALE_CLAIM_RELEASE_MINIMUM_AGE_MS / 60_000} minutes before now.`,
        };
    }

    const lim = Math.min(500, Math.max(1, Math.floor(params.limit ?? 100)));
    const olderIso = params.olderThan.toISOString();

    let q = params.supabase
        .from("communication_scheduled_sends")
        .select("id")
        .eq("status", "claimed")
        .is("communication_message_id", null)
        .lt("claimed_at", olderIso)
        .limit(lim);

    if (params.orgId) {
        q = q.eq("org_id", params.orgId);
    }

    const { data: idRows, error: selErr } = await q;
    if (selErr) {
        return { ok: false, error: "DB_SELECT_FAILED", message: selErr.message };
    }

    const ids = (idRows ?? []).map((r) => String((r as { id: unknown }).id)).filter(Boolean);
    if (ids.length === 0) {
        return { ok: true, result: { released: 0, ids: [] } };
    }

    const { data: updated, error: upErr } = await params.supabase
        .from("communication_scheduled_sends")
        .update({
            status: "pending",
            claim_token: null,
            claimed_at: null,
        })
        .in("id", ids)
        .eq("status", "claimed")
        .is("communication_message_id", null)
        .lt("claimed_at", olderIso)
        .select("id");

    if (upErr) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: upErr.message };
    }

    const outIds = (updated ?? []).map((r) => String((r as { id: unknown }).id));
    return { ok: true, result: { released: outIds.length, ids: outIds } };
}

export type ProcessDueCommunicationScheduledSendsResult = {
    claimed: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
};

type RpcClaimRow = Record<string, unknown>;

/**
 * Claims due rows via `claim_due_communication_scheduled_sends` (SKIP LOCKED), then enqueues each once through
 * {@link executeCommunicationsSend}. Rows move **pending → claimed → queued** (or **failed**).
 *
 * Idempotency: skips enqueue when `communication_message_id` is already set on the row; success updates require
 * `communication_message_id IS NULL` to avoid double-attaching the same send result.
 *
 * For rows stuck in **`claimed`** without a message id, see {@link releaseStaleClaimedCommunicationScheduledSends} (separate cron/ops; not invoked here).
 */
export async function processDueCommunicationScheduledSends(params: {
    supabase: SupabaseClient;
    limit: number;
    now: Date;
    /** When set, only rows for this org are claimed (admin-triggered). When null, all orgs (cron). */
    orgIdFilter: string | null;
}): Promise<{ ok: true; result: ProcessDueCommunicationScheduledSendsResult } | { ok: false; error: string; message: string }> {
    const lim = Math.min(100, Math.max(1, Math.floor(params.limit)));
    const { data, error } = await (params.supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(
        "claim_due_communication_scheduled_sends",
        {
            p_limit: lim,
            p_now: params.now.toISOString(),
            p_org_id: params.orgIdFilter,
        }
    );

    if (error) {
        console.error("[processDueCommunicationScheduledSends] rpc", error);
        return { ok: false, error: "CLAIM_RPC_FAILED", message: error.message };
    }

    const claimedRows = (Array.isArray(data) ? data : []) as RpcClaimRow[];
    const out: ProcessDueCommunicationScheduledSendsResult = {
        claimed: claimedRows.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
    };

    for (const raw of claimedRows) {
        const row = mapRow(raw);
        out.processed += 1;

        const { data: freshRaw, error: freshErr } = await params.supabase
            .from("communication_scheduled_sends")
            .select("*")
            .eq("id", row.id)
            .maybeSingle();

        if (freshErr || !freshRaw) {
            out.failed += 1;
            continue;
        }
        const fresh = mapRow(freshRaw as Record<string, unknown>);

        if (fresh.communication_message_id) {
            if (fresh.status === "claimed") {
                await params.supabase
                    .from("communication_scheduled_sends")
                    .update({
                        status: "queued",
                        metadata: mergeMetadata(fresh.metadata, { recovered_queued_at: params.now.toISOString() }),
                    })
                    .eq("id", fresh.id)
                    .eq("status", "claimed");
            }
            out.skipped += 1;
            continue;
        }

        if (fresh.status !== "claimed" || !fresh.claim_token || fresh.claim_token !== row.claim_token) {
            out.skipped += 1;
            continue;
        }

        const exec = await executeCommunicationsSend({
            supabase: params.supabase,
            orgId: fresh.org_id,
            quickMessage: false,
            primaryEntityType: "opportunities",
            primaryEntityId: fresh.entity_id,
            channel: fresh.channel,
            textRaw: fresh.body_snapshot,
            subjectRawEmail: fresh.channel === "email" ? fresh.subject_snapshot ?? "" : undefined,
            bindingIdOpt: fresh.communication_provider_binding_id ?? "",
            recipientPersonIdRaw: fresh.recipient_person_id,
            toRawInput: "",
            sendMetadataAugment: {
                communication_scheduled_send_id: fresh.id,
                task_assist_scheduled_send: true,
            },
        });

        if (!exec.ok) {
            await params.supabase
                .from("communication_scheduled_sends")
                .update({
                    status: "failed",
                    metadata: mergeMetadata(fresh.metadata, {
                        last_process_error: {
                            at: params.now.toISOString(),
                            error: exec.error,
                            http_status: exec.status,
                            code: exec.code ?? null,
                        },
                    }),
                })
                .eq("id", fresh.id)
                .eq("status", "claimed")
                .eq("claim_token", fresh.claim_token)
                .is("communication_message_id", null);

            out.failed += 1;
            continue;
        }

        const { data: updated, error: upErr } = await params.supabase
            .from("communication_scheduled_sends")
            .update({
                status: "queued",
                communication_message_id: exec.communication_message_id,
                metadata: mergeMetadata(fresh.metadata, {
                    enqueue_note: exec.process_trigger_attempted_note,
                    enqueued_at: params.now.toISOString(),
                }),
            })
            .eq("id", fresh.id)
            .eq("status", "claimed")
            .eq("claim_token", fresh.claim_token)
            .is("communication_message_id", null)
            .select("*")
            .maybeSingle();

        if (upErr || !updated) {
            out.failed += 1;
            continue;
        }

        out.succeeded += 1;
    }

    return { ok: true, result: out };
}
