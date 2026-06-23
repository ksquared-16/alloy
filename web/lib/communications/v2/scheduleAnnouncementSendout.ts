/**
 * Communications V2 — announcement schedule / cancel orchestration (Phase 1 / B7).
 *
 * Reuses the SINGLE scheduler (communication_scheduled_sends) — no second scheduler,
 * no new execution table. Schedule = write the campaign snapshot (announcement_recipients,
 * a campaign OUTCOME rollup) + create execution rows for email/sms recipients that have a
 * provider binding. Email/SMS without a binding → skipped/provider_unavailable (never queued).
 * In-app → operator-side only (skipped/in_app_operator_only). Actual provider send of
 * announcement rows is GATED OFF in the due-claim (Phase 3) — this orchestrates scheduling only.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { availableComposerChannels, activeOutboundBindings } from "@/lib/communications/composerChannels";
import {
    ANNOUNCEMENT_SCHEDULED_SEND_SOURCE,
    ANNOUNCEMENT_SCHEDULED_SEND_ENTITY_TYPE,
} from "@/lib/communications/v2/announcementSchema";
import {
    planAnnouncementFanout,
    summarizeFanout,
    type ChannelAvailability,
    type FanoutRow,
    type RecipientPerson,
} from "@/lib/communications/v2/announcementFanout";
import { listAnnouncementRecipientPersonsForSpec } from "@/lib/communications/v2/resolveAnnouncementAudience";
import { resolveTargetsToSpec, type LegacyTargetRow } from "@/lib/communications/v2/audienceSpec";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ScheduleResult =
    | { ok: true; status: number; summary: ReturnType<typeof summarizeFanout> & { total_recipients: number; capped: boolean } }
    | { ok: false; status: number; error: string };

function fail(status: number, error: string): ScheduleResult {
    return { ok: false, status, error };
}

function channelKey(personId: string, channel: string): string {
    return `${personId}:${channel}`;
}

/**
 * Schedule an announcement: draft → scheduled at `sendAtIso`. Writes the recipient
 * snapshot and creates execution rows for sendable email/sms recipients. Idempotent:
 * re-scheduling replaces the prior snapshot + its pending execution rows.
 */
export async function scheduleAnnouncement(
    supabase: AdminClient,
    orgId: string,
    userId: string,
    announcementId: string,
    sendAtIso: string
): Promise<ScheduleResult> {
    const sendAt = new Date(sendAtIso);
    const now = new Date();
    if (Number.isNaN(sendAt.getTime())) return fail(400, "send_at must be a valid ISO timestamp");
    if (sendAt.getTime() <= now.getTime()) return fail(400, "send_at must be in the future");

    // 1) Load the announcement (org-scoped).
    const { data: ann, error: aErr } = await supabase
        .from("announcements")
        .select("id, status, channels, subject, body")
        .eq("id", announcementId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (aErr) return fail(500, aErr.message);
    if (!ann) return fail(404, "Announcement not found");
    const a = ann as { id: string; status: string; channels: string[]; subject: string | null; body: string };
    if (a.status !== "draft" && a.status !== "scheduled") {
        return fail(409, `cannot schedule an announcement in status '${a.status}'`);
    }
    const channels = (a.channels ?? []) as ("email" | "sms" | "in_app")[];
    if (channels.length === 0) return fail(400, "announcement has no channels selected");

    // 2) Resolve targets → audience SPEC → recipient persons (read-only).
    //    A 'custom' row must carry a valid rule.audience_spec; otherwise we error rather than
    //    broaden to all families (B8B).
    const { data: targetRows, error: tErr } = await supabase
        .from("announcement_targets")
        .select("target_type, target_ref, rule")
        .eq("org_id", orgId)
        .eq("announcement_id", announcementId);
    if (tErr) return fail(500, tErr.message);
    if (!targetRows || targetRows.length === 0) return fail(400, "announcement has no audience targets");
    const specRes = resolveTargetsToSpec(targetRows as LegacyTargetRow[]);
    if (!specRes.ok) return fail(400, specRes.error);

    const recipientResult = await listAnnouncementRecipientPersonsForSpec(supabase, orgId, specRes.spec);
    const persons: RecipientPerson[] = recipientResult.persons;

    // 3) Provider availability for this org.
    const { data: bindingRows, error: bErr } = await supabase
        .from("communication_provider_bindings")
        .select("id, channel, scope, location_id, provider, status, is_primary, secret_ref")
        .eq("org_id", orgId);
    if (bErr) return fail(500, bErr.message);
    const bindings = bindingRows ?? [];
    const avail = availableComposerChannels(bindings as never);
    const availability: ChannelAvailability = { email: avail.includes("email"), sms: avail.includes("sms") };
    const emailBindingId = (activeOutboundBindings(bindings as never, "email")[0] as { id?: string } | undefined)?.id ?? null;
    const smsBindingId = (activeOutboundBindings(bindings as never, "sms")[0] as { id?: string } | undefined)?.id ?? null;

    // 4) Plan fan-out (pure).
    const plan: FanoutRow[] = planAnnouncementFanout(persons, channels, availability);
    const summary = summarizeFanout(plan);

    // 5) Replace prior snapshot + prior pending execution rows (idempotent re-schedule).
    const { error: cancelErr } = await supabase
        .from("communication_scheduled_sends")
        .update({ status: "canceled", updated_at: now.toISOString() })
        .eq("org_id", orgId)
        .eq("announcement_id", announcementId)
        .in("status", ["pending", "claimed"]);
    if (cancelErr) return fail(500, cancelErr.message);
    const { error: delErr } = await supabase
        .from("announcement_recipients")
        .delete()
        .eq("org_id", orgId)
        .eq("announcement_id", announcementId);
    if (delErr) return fail(500, delErr.message);

    // 6) Create execution rows (communication_scheduled_sends) for sendable email/sms.
    const execRows = plan.filter((r) => r.needs_scheduled_send);
    const ssIdByKey = new Map<string, string>();
    if (execRows.length > 0) {
        const inserts = execRows.map((r) => ({
            org_id: orgId,
            created_by: userId,
            entity_type: ANNOUNCEMENT_SCHEDULED_SEND_ENTITY_TYPE,
            entity_id: null,
            recipient_person_id: r.person_id,
            channel: r.channel,
            subject_snapshot: r.channel === "email" ? a.subject : null,
            body_snapshot: a.body ?? "",
            communication_provider_binding_id: r.channel === "email" ? emailBindingId : smsBindingId,
            scheduled_for: sendAt.toISOString(),
            status: "pending",
            approved_at: now.toISOString(),
            approved_by: userId,
            source: ANNOUNCEMENT_SCHEDULED_SEND_SOURCE,
            announcement_id: announcementId,
        }));
        const { data: inserted, error: insErr } = await supabase
            .from("communication_scheduled_sends")
            .insert(inserts)
            .select("id, recipient_person_id, channel");
        if (insErr) return fail(500, insErr.message);
        for (const row of inserted ?? []) {
            const rr = row as { id: string; recipient_person_id: string; channel: string };
            ssIdByKey.set(channelKey(String(rr.recipient_person_id), String(rr.channel)), String(rr.id));
        }
    }

    // 7) Write the campaign snapshot (announcement_recipients) — outcome rollup.
    const recipientInserts = plan.map((r) => ({
        org_id: orgId,
        announcement_id: announcementId,
        person_id: r.person_id,
        channel: r.channel,
        address: r.address,
        consent_state: r.suppressed_reason === "opted_out" ? "opted_out" : "unset",
        suppressed_reason: r.suppressed_reason,
        status: r.outcome, // 'scheduled' | 'skipped'
        communication_scheduled_send_id: ssIdByKey.get(channelKey(r.person_id, r.channel)) ?? null,
    }));
    if (recipientInserts.length > 0) {
        const { error: recErr } = await supabase.from("announcement_recipients").insert(recipientInserts);
        if (recErr) return fail(500, recErr.message);
    }

    // 8) Mark the announcement scheduled.
    const { error: updErr } = await supabase
        .from("announcements")
        .update({ status: "scheduled", send_at: sendAt.toISOString(), updated_at: now.toISOString() })
        .eq("id", announcementId)
        .eq("org_id", orgId);
    if (updErr) return fail(500, updErr.message);

    return {
        ok: true,
        status: 200,
        summary: { ...summary, total_recipients: plan.length, capped: recipientResult.capped },
    };
}

export type CancelResult = { ok: true; status: number } | { ok: false; status: number; error: string };

/**
 * Cancel a scheduled announcement: scheduled → draft. Cascade-cancels the child
 * execution rows (pending/claimed) and clears the recipient snapshot.
 */
export async function cancelScheduledAnnouncement(
    supabase: AdminClient,
    orgId: string,
    announcementId: string
): Promise<CancelResult> {
    const now = new Date().toISOString();
    const { data: ann, error: aErr } = await supabase
        .from("announcements")
        .select("id, status")
        .eq("id", announcementId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (aErr) return { ok: false, status: 500, error: aErr.message };
    if (!ann) return { ok: false, status: 404, error: "Announcement not found" };
    if ((ann as { status: string }).status !== "scheduled") {
        return { ok: false, status: 409, error: "only a scheduled announcement can be canceled" };
    }

    const { error: cancelErr } = await supabase
        .from("communication_scheduled_sends")
        .update({ status: "canceled", updated_at: now })
        .eq("org_id", orgId)
        .eq("announcement_id", announcementId)
        .in("status", ["pending", "claimed"]);
    if (cancelErr) return { ok: false, status: 500, error: cancelErr.message };

    const { error: delErr } = await supabase
        .from("announcement_recipients")
        .delete()
        .eq("org_id", orgId)
        .eq("announcement_id", announcementId);
    if (delErr) return { ok: false, status: 500, error: delErr.message };

    const { error: updErr } = await supabase
        .from("announcements")
        .update({ status: "draft", send_at: null, updated_at: now })
        .eq("id", announcementId)
        .eq("org_id", orgId);
    if (updErr) return { ok: false, status: 500, error: updErr.message };

    return { ok: true, status: 200 };
}
