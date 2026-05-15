import type { SupabaseClient } from "@supabase/supabase-js";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { loadOpportunityActivitySignal } from "@/lib/admin/loadOpportunityActivitySignal";
import { fetchOpportunityDrawerEmailRecipients } from "@/lib/communications/drawerEmailRecipients";
import type { TaskAssistRecipientCandidateV1 } from "@/lib/agent/taskAssist/types";

export type TaskAssistOpportunityContextV1 = {
    opportunity_id: string;
    /** Display label for templates (opportunity name or fallback). */
    opportunity_label: string;
    status_key: string | null;
    status_label: string | null;
    work_unit_id: string | null;
    customer_id: string | null;
    /** Customer / household display name when available — same class as drawer household label. */
    household_label: string | null;
    primary_person_id: string | null;
    /** Non-PII summary of linked inquiry child profiles (counts / structural only). */
    children_summary: string | null;
    /** First linked child display name when available — used for careful draft personalization only. */
    primary_child_display_name: string | null;
    /** From activity signals — short line, no payload dumps. */
    activity_summary: string | null;
    last_activity_at: string | null;
    recipient_candidates: TaskAssistRecipientCandidateV1[];
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function opportunityDisplayLabel(row: Record<string, unknown>): string {
    const name = trimOrNull(row.name);
    if (name) return name;
    const title = trimOrNull(row.title);
    if (title) return title;
    return "Opportunity";
}

/**
 * Summarize `metadata.inquiry_children` without echoing child names into logs-heavy paths by default.
 * Names may appear only inside opportunity-scoped draft text when the assembler chooses; here we keep a count line.
 */
function summarizeChildrenFromMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const m = metadata as Record<string, unknown>;
    if (Array.isArray(m.inquiry_children) && m.inquiry_children.length > 0) {
        const n = m.inquiry_children.length;
        return n === 1 ? "One inquiry child profile is linked." : `${n} inquiry child profiles are linked.`;
    }
    return null;
}

function primaryChildDisplayNameFromMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const kids = (metadata as { inquiry_children?: unknown }).inquiry_children;
    if (!Array.isArray(kids) || !kids.length) return null;
    for (const raw of kids) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const joinedName = [row.first_name, row.last_name]
            .filter((x) => typeof x === "string" && String(x).trim())
            .join(" ")
            .trim();
        const name =
            trimOrNull(row.display_name) ??
            trimOrNull(row.child_name) ??
            trimOrNull(row.name) ??
            (joinedName || null);
        if (name) return name;
    }
    return null;
}

/**
 * Card 3 — read-only opportunity context for Task Assist (org-scoped, no writes, no provider calls).
 */
export async function assembleTaskAssistOpportunityContextV1(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<
    | { ok: true; context: TaskAssistOpportunityContextV1 }
    | { ok: false; error: "ENTITY_NOT_FOUND"; status: 404 }
    | { ok: false; error: "ENTITY_LOAD_FAILED"; status: 500 }
> {
    const { supabase, orgId, opportunityId } = params;

    if (!(await assertRowOrg(supabase, "opportunities", opportunityId, orgId)).ok) {
        return { ok: false, error: "ENTITY_NOT_FOUND", status: 404 };
    }

    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, name, title, status_key, status, customer_id, primary_person_id, work_unit_id, metadata")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (oppErr) {
        console.error("[assembleTaskAssistOpportunityContextV1] opportunities", oppErr);
        return { ok: false, error: "ENTITY_LOAD_FAILED", status: 500 };
    }
    if (!opp || typeof opp !== "object") {
        return { ok: false, error: "ENTITY_NOT_FOUND", status: 404 };
    }

    const row = opp as Record<string, unknown>;
    const customerId = trimOrNull(row.customer_id);
    const workUnitId = trimOrNull(row.work_unit_id);
    const primaryPersonId = trimOrNull(row.primary_person_id);
    const statusKey = trimOrNull(row.status_key);
    const statusLabel = trimOrNull(row.status) ?? statusKey;

    let householdLabel: string | null = null;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).eq("org_id", orgId).maybeSingle();
        householdLabel = cust && typeof cust === "object" ? trimOrNull((cust as { name?: unknown }).name) : null;
    }

    const activity = await loadOpportunityActivitySignal({
        supabase,
        orgId,
        opportunityId,
        statusKey,
        workUnitId,
        preloadedOrgMetadata: null,
    });

    const drawerRows = await fetchOpportunityDrawerEmailRecipients(supabase, orgId, opportunityId);
    const recipient_candidates: TaskAssistRecipientCandidateV1[] = drawerRows.map((r) => ({
        person_id: r.person_id,
        display_label: r.display_name + (r.relationship_hint ? ` (${r.relationship_hint})` : ""),
        has_sms: r.phone != null && String(r.phone).trim() !== "",
        has_email: r.email != null && String(r.email).trim() !== "",
    }));

    const context: TaskAssistOpportunityContextV1 = {
        opportunity_id: opportunityId,
        opportunity_label: opportunityDisplayLabel(row),
        status_key: statusKey,
        status_label: statusLabel,
        work_unit_id: workUnitId,
        customer_id: customerId,
        household_label: householdLabel,
        primary_person_id: primaryPersonId,
        children_summary: summarizeChildrenFromMetadata(row.metadata),
        primary_child_display_name: primaryChildDisplayNameFromMetadata(row.metadata),
        activity_summary: activity.last_activity_summary,
        last_activity_at: activity.last_activity_at,
        recipient_candidates,
    };

    return { ok: true, context };
}
