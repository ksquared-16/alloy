import { findInquiryChildInOpportunityRecord } from "@/lib/admin/drawer/inquiryChildOpportunityRows";
import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";

export type WarmDrawerPersonTarget = {
    personId: string;
    openSource: string;
    presentationEmphasis: string | null;
};

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function inquiryChildPersonIds(record: Record<string, unknown>): string[] {
    const ids: string[] = [];
    const sources: unknown[] = [];
    const md = record.metadata;
    if (md && typeof md === "object" && !Array.isArray(md)) {
        const fromMd = (md as { inquiry_children?: unknown }).inquiry_children;
        if (Array.isArray(fromMd)) sources.push(...fromMd);
    }
    const fromRecord = record._inquiry_children;
    if (Array.isArray(fromRecord)) sources.push(...fromRecord);

    for (const raw of sources) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        let personId = trimId(row.person_id);
        if (!personId) {
            const cmId = trimId(row.customer_member_id);
            if (cmId && !cmId.startsWith("metadata_child:")) {
                const match = findInquiryChildInOpportunityRecord(record, { customerMemberId: cmId });
                personId = trimId(match?.person_id);
            }
        }
        if (personId) ids.push(personId);
    }
    return ids;
}

function opportunityContactPersonIds(record: Record<string, unknown>): string[] {
    const ids: string[] = [];
    const rows = record._opportunity_persons;
    if (!Array.isArray(rows)) return ids;
    for (const raw of rows) {
        if (!raw || typeof raw !== "object") continue;
        const personId = trimId((raw as { person_id?: unknown }).person_id);
        if (personId) ids.push(personId);
    }
    return ids;
}

/**
 * Resolve Person/Child VM warm targets from an Opportunity drawer VM above-fold record.
 * Supports production record shapes (identity, inquiry children, contact rows).
 */
export function resolveWarmDrawerTargetsFromOpportunityRecord(
    record: Record<string, unknown>
): WarmDrawerPersonTarget[] {
    const targets: WarmDrawerPersonTarget[] = [];
    const childIds = new Set(inquiryChildPersonIds(record));
    const seen = new Set<string>();

    const add = (personId: string, openSource: string, presentationEmphasis: string | null) => {
        const id = personId.trim();
        if (!id) return;
        const key = `${openSource}:${presentationEmphasis ?? ""}:${id}`;
        if (seen.has(key)) return;
        seen.add(key);
        targets.push({ personId: id, openSource, presentationEmphasis });
    };

    for (const childId of childIds) {
        add(childId, PERSON_DRAWER_CHILD_OPEN_SOURCE, "child_lifecycle");
    }

    const primary =
        resolveLeadSummaryPrimaryPersonId(record) ??
        primaryPersonIdFromOpportunityRecord(record);
    if (primary && !childIds.has(primary)) {
        add(primary, "opportunity_primary_contact", PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS);
    }

    for (const personId of opportunityContactPersonIds(record)) {
        if (childIds.has(personId) || personId === primary) continue;
        add(personId, "opportunity_primary_contact", null);
    }

    logDrawerVmRuntimeDiagnostic("work_unit_row_related_targets_resolved", {
        opportunity_id: trimId(record.id) ?? trimId(record.opportunity_id),
        primary_person_id: primary,
        child_count: childIds.size,
        warm_target_count: targets.length,
        warm_targets: targets.map((t) => ({
            person_id: t.personId,
            open_source: t.openSource,
            presentation_emphasis: t.presentationEmphasis,
        })),
    });

    return targets;
}
