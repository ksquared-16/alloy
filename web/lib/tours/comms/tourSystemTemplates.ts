/**
 * System Tour templates in the canonical Communications Template Library.
 *
 * Identity: `communication_templates.system_key` (org-scoped, unique when set).
 * Content: editable `communication_template_versions` (org can revise freely).
 * Defaults: seeded from platform Tour copy; code defaults remain fallback only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TourCommsChannel, TourCommsEventKey, TourCommsTemplate, TourCommsTemplates } from "@/lib/tours/comms/tourCommsConfig";
import { getDefaultTourCommsTemplateSet } from "@/lib/tours/comms/tourCommsTemplates";

/** Stable semantic keys — never rename; operators edit content, not identity. */
export const TOUR_SYSTEM_TEMPLATE_KEYS = [
    "tour_invitation",
    "tour_confirmation",
    "tour_reminder",
    "tour_reschedule",
    "tour_cancel",
    "tour_no_show_followup",
] as const;

export type TourSystemTemplateKey = (typeof TOUR_SYSTEM_TEMPLATE_KEYS)[number];

export const TOUR_SYSTEM_TEMPLATE_LABELS: Record<TourSystemTemplateKey, string> = {
    tour_invitation: "Tour Invitation",
    tour_confirmation: "Tour Confirmation",
    tour_reminder: "Tour Reminder",
    tour_reschedule: "Tour Rescheduled",
    tour_cancel: "Tour Cancellation",
    tour_no_show_followup: "Tour No-Show Follow-up",
};

/** Event key ↔ system template key (1:1 for supported lifecycle messages). */
export function tourEventKeyToSystemTemplateKey(eventKey: TourCommsEventKey): TourSystemTemplateKey | null {
    if ((TOUR_SYSTEM_TEMPLATE_KEYS as readonly string[]).includes(eventKey)) {
        return eventKey as TourSystemTemplateKey;
    }
    return null;
}

/**
 * Placeholders that must remain in the template for the product action to work.
 * Soft copy edits are unconstrained; removing these blocks save.
 */
export const TOUR_SYSTEM_TEMPLATE_REQUIRED_PLACEHOLDERS: Partial<
    Record<TourSystemTemplateKey, readonly string[]>
> = {
    tour_invitation: ["invitation_action_url"],
};

export function tourSystemTemplateChannelName(key: TourSystemTemplateKey, channel: TourCommsChannel): string {
    const base = TOUR_SYSTEM_TEMPLATE_LABELS[key];
    if (channel === "email") return base;
    if (channel === "sms") return `${base} (SMS)`;
    return `${base} (${channel})`;
}

export function tourSystemTemplateKeyForChannel(key: TourSystemTemplateKey, channel: TourCommsChannel): string {
    return `${key}:${channel}`;
}

export function parseTourSystemTemplateKey(raw: string | null | undefined): {
    eventKey: TourSystemTemplateKey;
    channel: TourCommsChannel;
} | null {
    const s = String(raw ?? "").trim();
    const m = s.match(/^(tour_[a-z_]+):(email|sms|in_app)$/);
    if (!m) return null;
    const eventKey = m[1] as TourSystemTemplateKey;
    if (!(TOUR_SYSTEM_TEMPLATE_KEYS as readonly string[]).includes(eventKey)) return null;
    return { eventKey, channel: m[2] as TourCommsChannel };
}

export function validateTourSystemTemplateRequiredPlaceholders(input: {
    systemKey: string | null | undefined;
    body: string;
    subject?: string | null;
}): { ok: true } | { ok: false; error: string } {
    const parsed = parseTourSystemTemplateKey(input.systemKey);
    if (!parsed) return { ok: true };
    const required = TOUR_SYSTEM_TEMPLATE_REQUIRED_PLACEHOLDERS[parsed.eventKey] ?? [];
    if (required.length === 0) return { ok: true };
    const haystack = `${input.subject ?? ""}\n${input.body ?? ""}`;
    const missing = required.filter((token) => !haystack.includes(`{{${token}}}`));
    if (missing.length === 0) return { ok: true };
    const labels = missing.map((t) =>
        t === "invitation_action_url" ? "Tour Invitation Link ({{invitation_action_url}})" : `{{${t}}}`,
    );
    return {
        ok: false,
        error: `This Tour template requires: ${labels.join(", ")}. Add the placeholder back before saving.`,
    };
}

type SeedSpec = {
    eventKey: TourSystemTemplateKey;
    channel: TourCommsChannel;
    subject: string | null;
    body: string;
};

function buildSeedSpecs(): SeedSpec[] {
    const defaults = getDefaultTourCommsTemplateSet();
    const out: SeedSpec[] = [];
    for (const eventKey of TOUR_SYSTEM_TEMPLATE_KEYS) {
        const email = defaults[eventKey]?.email;
        if (email?.body_text?.trim()) {
            out.push({
                eventKey,
                channel: "email",
                subject: email.subject?.trim() || null,
                body: email.body_text,
            });
        }
        const sms = defaults[eventKey]?.sms;
        if (sms?.body_text?.trim()) {
            out.push({
                eventKey,
                channel: "sms",
                subject: null,
                body: sms.body_text,
            });
        }
    }
    return out;
}

/**
 * Ensure every supported Tour system template exists for the org.
 * Idempotent: creates missing rows only; never overwrites org-edited versions.
 */
export async function ensureOrgTourCommunicationTemplates(params: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId?: string | null;
}): Promise<{ created: number; existing: number }> {
    const { supabase, orgId } = params;
    const actor = params.actorUserId?.trim() || null;
    const seeds = buildSeedSpecs();
    const systemKeys = seeds.map((s) => tourSystemTemplateKeyForChannel(s.eventKey, s.channel));

    const { data: existingRows, error: listErr } = await supabase
        .from("communication_templates")
        .select("id, system_key")
        .eq("org_id", orgId)
        .in("system_key", systemKeys);
    if (listErr) throw new Error(listErr.message);

    const have = new Set(
        (existingRows ?? [])
            .map((r) => (typeof r.system_key === "string" ? r.system_key : ""))
            .filter(Boolean),
    );

    let created = 0;
    for (const seed of seeds) {
        const systemKey = tourSystemTemplateKeyForChannel(seed.eventKey, seed.channel);
        if (have.has(systemKey)) continue;

        const name = tourSystemTemplateChannelName(seed.eventKey, seed.channel);
        const now = new Date().toISOString();
        const { data: template, error: tErr } = await supabase
            .from("communication_templates")
            .insert({
                org_id: orgId,
                name,
                description: `System Tour template — editable. Semantic key: ${systemKey}`,
                category: "tour",
                channel: seed.channel,
                status: "active",
                approval_status: "approved",
                system_key: systemKey,
                created_by: actor,
                updated_by: actor,
                created_at: now,
                updated_at: now,
            })
            .select("id")
            .maybeSingle();

        if (tErr) {
            // Unique race — another provisioner won.
            if (String(tErr.code) === "23505") continue;
            throw new Error(tErr.message);
        }
        const templateId = typeof template?.id === "string" ? template.id : null;
        if (!templateId) continue;

        const { data: version, error: vErr } = await supabase
            .from("communication_template_versions")
            .insert({
                org_id: orgId,
                template_id: templateId,
                version: 1,
                version_number: 1,
                subject: seed.subject,
                body: seed.body,
                body_format: seed.channel === "email" ? "html" : "text",
                token_paths: [],
                metadata: { system_key: systemKey, source: "tour_system_seed" },
                created_by: actor,
            })
            .select("id")
            .maybeSingle();
        if (vErr) throw new Error(vErr.message);
        const versionId = typeof version?.id === "string" ? version.id : null;
        if (versionId) {
            await supabase
                .from("communication_templates")
                .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
                .eq("id", templateId)
                .eq("org_id", orgId);
        }
        created += 1;
    }

    return { created, existing: systemKeys.length - created };
}

/**
 * Load org Tour library templates as orchestrator overrides (current version only).
 * Call {@link ensureOrgTourCommunicationTemplates} first when provisioning is expected.
 */
export async function loadTourCommsLibraryOverrides(params: {
    supabase: SupabaseClient;
    orgId: string;
}): Promise<TourCommsTemplates> {
    const { supabase, orgId } = params;
    const { data: templates, error } = await supabase
        .from("communication_templates")
        .select("id, system_key, current_version_id, status")
        .eq("org_id", orgId)
        .eq("category", "tour")
        .not("system_key", "is", null);
    if (error) throw new Error(error.message);

    const active = (templates ?? []).filter((t) => {
        const status = String(t.status ?? "").toLowerCase();
        return status === "active" || status === "draft";
    });
    const versionIds = active
        .map((t) => (typeof t.current_version_id === "string" ? t.current_version_id : null))
        .filter((id): id is string => Boolean(id));
    if (versionIds.length === 0) return {};

    const { data: versions, error: vErr } = await supabase
        .from("communication_template_versions")
        .select("id, subject, body")
        .eq("org_id", orgId)
        .in("id", versionIds);
    if (vErr) throw new Error(vErr.message);

    const versionById = new Map<string, { subject: string | null; body: string | null }>();
    for (const v of versions ?? []) {
        versionById.set(String(v.id), {
            subject: typeof v.subject === "string" ? v.subject : null,
            body: typeof v.body === "string" ? v.body : null,
        });
    }

    const out: TourCommsTemplates = {};
    for (const t of active) {
        const parsed = parseTourSystemTemplateKey(typeof t.system_key === "string" ? t.system_key : null);
        if (!parsed) continue;
        const versionId = typeof t.current_version_id === "string" ? t.current_version_id : null;
        const ver = versionId ? versionById.get(versionId) : null;
        if (!ver?.body?.trim()) continue;
        const channelTpl: TourCommsTemplate = {
            subject: ver.subject ?? undefined,
            body_text: ver.body,
        };
        const eventBucket = out[parsed.eventKey] ?? {};
        eventBucket[parsed.channel] = channelTpl;
        out[parsed.eventKey] = eventBucket;
    }
    return out;
}

/** Merge library overrides over metadata config templates (library wins). */
export function mergeTourCommsTemplateOverrides(
    base: TourCommsTemplates | null | undefined,
    library: TourCommsTemplates | null | undefined,
): TourCommsTemplates {
    const out: TourCommsTemplates = { ...(base ?? {}) };
    for (const [eventKey, channels] of Object.entries(library ?? {})) {
        const ek = eventKey as TourCommsEventKey;
        const bucket = { ...(out[ek] ?? {}) };
        for (const [channel, tpl] of Object.entries(channels ?? {})) {
            if (!tpl) continue;
            bucket[channel as TourCommsChannel] = tpl;
        }
        out[ek] = bucket;
    }
    return out;
}
