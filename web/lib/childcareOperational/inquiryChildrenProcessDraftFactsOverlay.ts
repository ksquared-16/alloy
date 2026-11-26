/**
 * Resolve PRE-materialization participation facts (program / room / schedule / start) for a lead's
 * children from their enrollment process_instances.metadata — the draft facts written at Create Lead and
 * by applyChildParticipationEdit before materialization.
 *
 * Priority for the Focus Panel is: durable operational facts (if materialized) > these PI draft facts >
 * OCM (legacy only). This helper covers the middle tier so the surface no longer needs OCM for new leads.
 * Childcare/enrollment reads stay in this module (naming/boundary doctrine).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listEnrollmentInstancesForLead } from "@/lib/process/processInstances";

export type ProcessDraftChildFacts = {
    programLabel: string | null;
    roomLabel: string | null;
    scheduleLabel: string | null;
    startDate: string | null;
    programCategoryId: string | null;
    siteLocationId: string | null;
    /** Operator-facing site name for `location_id` — never the UUID. */
    siteLocationLabel: string | null;
};

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | null {
    const v = meta?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "full_day" → "Full Day". */
function humanizeToken(v: string | null): string | null {
    if (!v) return null;
    return v
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/**
 * Map (customer_member_id → draft facts) for the lead's children that have participation facts on their
 * enrollment process instance. Children with no PI (or no participation metadata) are absent (caller
 * falls back to OCM). One PIs-for-lead read + up to two small label batches.
 */
export async function resolveProcessDraftFactsForChildren(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    children: Array<{ customerMemberId: string }>,
): Promise<Map<string, ProcessDraftChildFacts>> {
    const out = new Map<string, ProcessDraftChildFacts>();
    const wanted = new Set(children.map((c) => c.customerMemberId).filter(Boolean));
    if (!wanted.size) return out;

    const instances = await listEnrollmentInstancesForLead(supabase, { orgId, opportunityId });
    const mine = instances.filter((pi) => wanted.has(pi.subject_id));
    if (!mine.length) return out;

    // Batch program labels.
    const programIds = [
        ...new Set(mine.map((pi) => metaStr(pi.metadata, "program_category_id")).filter((v): v is string => !!v)),
    ];
    const programLabelById = new Map<string, string>();
    if (programIds.length) {
        const { data } = await supabase.from("location_program_categories").select("id, label, key").eq("org_id", orgId).in("id", programIds);
        for (const r of data ?? []) {
            const rec = r as { id: string; label?: string | null; key?: string | null };
            const label = (rec.label?.trim() || rec.key?.trim() || null);
            if (label) programLabelById.set(String(rec.id), label);
        }
    }

    // Batch room labels for room values that are location ids.
    const roomLocationIds = [
        ...new Set(
            mine
                .map((pi) => metaStr(pi.metadata, "room_location_id") ?? metaStr(pi.metadata, "program_room_cohort_key"))
                .filter((v): v is string => !!v && UUID_RE.test(v)),
        ),
    ];
    const siteLocationIds = [
        ...new Set(
            mine
                .map((pi) => metaStr(pi.metadata, "site_location_id") ?? metaStr(pi.metadata, "location_id"))
                .filter((v): v is string => !!v && UUID_RE.test(v)),
        ),
    ];
    const locationIdsForLabel = [...new Set([...roomLocationIds, ...siteLocationIds])];
    const locationLabelById = new Map<string, string>();
    if (locationIdsForLabel.length) {
        const { data } = await supabase.from("locations").select("id, label").eq("org_id", orgId).in("id", locationIdsForLabel);
        for (const r of data ?? []) {
            const rec = r as { id: string; label?: string | null };
            if (rec.label?.trim()) locationLabelById.set(String(rec.id), rec.label.trim());
        }
    }

    for (const pi of mine) {
        const programCategoryId = metaStr(pi.metadata, "program_category_id");
        const roomRaw = metaStr(pi.metadata, "room_location_id") ?? metaStr(pi.metadata, "program_room_cohort_key");
        const scheduleType = metaStr(pi.metadata, "schedule_type");
        const startDate = metaStr(pi.metadata, "start_date");
        const siteLocationId = metaStr(pi.metadata, "site_location_id") ?? metaStr(pi.metadata, "location_id");
        const programLabel = programCategoryId ? programLabelById.get(programCategoryId) ?? null : null;
        const roomLabel = roomRaw
            ? (locationLabelById.get(roomRaw) ?? (UUID_RE.test(roomRaw) ? null : humanizeToken(roomRaw)))
            : null;
        const siteLocationLabel = siteLocationId ? locationLabelById.get(siteLocationId) ?? null : null;
        // Location-only Create Lead participation must still surface (site is often set before program).
        if (!programLabel && !roomLabel && !scheduleType && !startDate && !programCategoryId && !siteLocationId) {
            continue;
        }
        out.set(pi.subject_id, {
            programLabel,
            roomLabel,
            scheduleLabel: humanizeToken(scheduleType),
            startDate,
            programCategoryId,
            siteLocationId,
            siteLocationLabel,
        });
    }
    return out;
}
