import type { SupabaseClient } from "@supabase/supabase-js";

import { applyEntityLabelToOperatorCopy } from "@/lib/admin/resolveEntityDisplayLabel";
import { resolveEntityLabelsForOrg } from "@/lib/admin/entityLabelsResolve";
import { personDisplayName } from "@/lib/adminFormatters";
import { humanizeGlobalSearchStatusLabel } from "@/lib/admin/globalSearch/globalRecordSearchStatusLabel";
import {
    displayLabelsFromDefinitions,
    fetchEffectiveStatusDefinitions,
} from "@/lib/admin/statusDefinitionsResolve";
import { resolveMyTasksGuardianFieldLabelFromRoleTypes } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import { resolvePlacementCandidateChildDisplayName } from "@/lib/orchestration/placement/resolvePlacementCandidateChildDisplayName";

import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

/** Presentation-only fields attached to workspace task rows (not persisted). */
export type OperationalTaskPresentationFields = {
    entity_label: string | null;
    household_label: string | null;
    contact_label: string | null;
    status_label: string | null;
    children_labels: string[];
    contact_field_label: string | null;
    location_id: string | null;
};

export type OperationalTaskWorkspaceRow = OperationalTaskRow & OperationalTaskPresentationFields;

type OpportunityEnrichmentRow = {
    id: string;
    name: string | null;
    title: string | null;
    status: string | null;
    status_key: string | null;
    customer_id: string | null;
    primary_person_id: string | null;
    location_id: string | null;
    metadata: unknown;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function opportunityDisplayLabel(row: OpportunityEnrichmentRow | undefined): string | null {
    if (!row) return null;
    return trimOrNull(row.name) ?? trimOrNull(row.title);
}

function emptyPresentation(): OperationalTaskPresentationFields {
    return {
        entity_label: null,
        household_label: null,
        contact_label: null,
        status_label: null,
        children_labels: [],
        contact_field_label: null,
        location_id: null,
    };
}

function childNameFromMetadataRow(row: Record<string, unknown>): string | null {
    const joined = [row.first_name, row.last_name]
        .filter((x) => typeof x === "string" && String(x).trim())
        .join(" ")
        .trim();
    return (
        trimOrNull(row.display_name) ??
        trimOrNull(row.child_name) ??
        trimOrNull(row.name) ??
        (joined || null)
    );
}

function parseMetadataChildNames(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== "object") return [];
    const kids = (metadata as { inquiry_children?: unknown }).inquiry_children;
    if (!Array.isArray(kids)) return [];
    const out: string[] = [];
    for (const raw of kids) {
        if (!raw || typeof raw !== "object") continue;
        const name = childNameFromMetadataRow(raw as Record<string, unknown>);
        if (name) out.push(name);
    }
    return out;
}

/** Pure merge — used by tests and server enrichment. */
export function attachOperationalTaskPresentationFields(
    task: OperationalTaskRow,
    contextByOpportunityId: Map<string, OperationalTaskPresentationFields>
): OperationalTaskWorkspaceRow {
    if (task.entity_type !== "opportunities" || !task.entity_id?.trim()) {
        return { ...task, ...emptyPresentation() };
    }
    const ctx = contextByOpportunityId.get(task.entity_id) ?? emptyPresentation();
    return { ...task, ...ctx };
}

/**
 * Bulk-load opportunity / household / contact / child labels for workspace task rows.
 * Fixed query budget: opportunities + customers + persons + OCM children + role types + status defs + entity labels.
 */
export async function enrichOperationalTasksForWorkspace(params: {
    supabase: SupabaseClient;
    orgId: string;
    tasks: OperationalTaskRow[];
}): Promise<OperationalTaskWorkspaceRow[]> {
    const { supabase, orgId, tasks } = params;
    if (!tasks.length) return [];

    const opportunityIds = [
        ...new Set(
            tasks
                .filter((t) => t.entity_type === "opportunities" && t.entity_id?.trim())
                .map((t) => t.entity_id!.trim())
                .filter(Boolean)
        ),
    ];

    if (!opportunityIds.length) {
        return tasks.map((t) => attachOperationalTaskPresentationFields(t, new Map()));
    }

    const { data: oppRows, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, name, title, status, status_key, customer_id, primary_person_id, location_id, metadata")
        .eq("org_id", orgId)
        .in("id", opportunityIds);

    if (oppErr) {
        console.error("[enrichOperationalTasksForWorkspace] opportunities", oppErr);
        return tasks.map((t) => attachOperationalTaskPresentationFields(t, new Map()));
    }

    const opps = (oppRows ?? []) as OpportunityEnrichmentRow[];
    const customerIds = [...new Set(opps.map((o) => trimOrNull(o.customer_id)).filter(Boolean) as string[])];
    const personIds = [...new Set(opps.map((o) => trimOrNull(o.primary_person_id)).filter(Boolean) as string[])];

    const [customerRes, personRes, ocmRes, roleTypeRes, statusDefs, entityLabelsPayload] = await Promise.all([
        customerIds.length ?
            supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", customerIds)
        :   Promise.resolve({ data: [], error: null }),
        personIds.length ?
            supabase.from("persons").select("id, full_name, first_name, last_name").eq("org_id", orgId).in("id", personIds)
        :   Promise.resolve({ data: [], error: null }),
        supabase
            .from("opportunity_customer_members")
            .select(
                "opportunity_id, customer_members(display_name, first_name, last_name, relationship, persons(first_name, last_name, full_name))"
            )
            .eq("org_id", orgId)
            .in("opportunity_id", opportunityIds),
        supabase
            .from("customer_person_role_types")
            .select("key, label")
            .eq("org_id", orgId)
            .eq("is_active", true),
        fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true }),
        resolveEntityLabelsForOrg(supabase, orgId),
    ]);

    if (customerRes.error) console.error("[enrichOperationalTasksForWorkspace] customers", customerRes.error);
    if (personRes.error) console.error("[enrichOperationalTasksForWorkspace] persons", personRes.error);
    if (ocmRes.error) console.error("[enrichOperationalTasksForWorkspace] ocm", ocmRes.error);
    if (roleTypeRes.error) console.error("[enrichOperationalTasksForWorkspace] role types", roleTypeRes.error);

    const entityLabelsMap: Record<string, { singular: string | null; plural: string | null }> = {};
    for (const row of entityLabelsPayload.effective) {
        entityLabelsMap[row.entity_type] = { singular: row.singular, plural: row.plural };
    }

    const guardianFieldLabel = resolveMyTasksGuardianFieldLabelFromRoleTypes(
        (roleTypeRes.data ?? []) as { key: string; label: string | null }[]
    );

    const householdByCustomerId = new Map<string, string>();
    for (const row of customerRes.data ?? []) {
        const id = String((row as { id: string }).id);
        const name = trimOrNull((row as { name?: string | null }).name);
        if (name) householdByCustomerId.set(id, name);
    }

    const contactByPersonId = new Map<string, string>();
    for (const row of personRes.data ?? []) {
        const id = String((row as { id: string }).id);
        const label = personDisplayName(row as { full_name?: string | null; first_name?: string | null; last_name?: string | null });
        if (label && label !== "—") contactByPersonId.set(id, label);
    }

    const childrenByOpportunityId = new Map<string, string[]>();
    for (const opp of opps) {
        const fromMd = parseMetadataChildNames(opp.metadata);
        if (fromMd.length) childrenByOpportunityId.set(opp.id, fromMd);
    }
    for (const raw of ocmRes.data ?? []) {
        const row = raw as {
            opportunity_id?: string;
            customer_members?: {
                display_name?: string | null;
                first_name?: string | null;
                last_name?: string | null;
                relationship?: string | null;
                persons?: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null;
            } | null;
        };
        const oppId = trimOrNull(row.opportunity_id);
        if (!oppId) continue;
        const member = row.customer_members;
        if (!member || trimOrNull(member.relationship)?.toLowerCase() !== "child") continue;
        const name = resolvePlacementCandidateChildDisplayName({ ocmMember: member });
        if (!name) continue;
        const existing = childrenByOpportunityId.get(oppId) ?? [];
        if (!existing.includes(name)) existing.push(name);
        childrenByOpportunityId.set(oppId, existing);
    }

    const statusLabelByKey = displayLabelsFromDefinitions(statusDefs);

    const contextByOpportunityId = new Map<string, OperationalTaskPresentationFields>();
    for (const opp of opps) {
        const customerId = trimOrNull(opp.customer_id);
        const personId = trimOrNull(opp.primary_person_id);
        const statusKey = trimOrNull(opp.status_key);
        const legacyStatus = trimOrNull(opp.status);

        const rawStatus =
            humanizeGlobalSearchStatusLabel(statusKey, statusLabelByKey) ??
            legacyStatus ??
            null;

        contextByOpportunityId.set(opp.id, {
            entity_label: opportunityDisplayLabel(opp),
            household_label: customerId ? householdByCustomerId.get(customerId) ?? null : null,
            contact_label: personId ? contactByPersonId.get(personId) ?? null : null,
            status_label: rawStatus ? applyEntityLabelToOperatorCopy(rawStatus, entityLabelsMap) : null,
            children_labels: childrenByOpportunityId.get(opp.id) ?? [],
            contact_field_label: guardianFieldLabel,
            location_id: trimOrNull(opp.location_id),
        });
    }

    return tasks.map((t) => attachOperationalTaskPresentationFields(t, contextByOpportunityId));
}
