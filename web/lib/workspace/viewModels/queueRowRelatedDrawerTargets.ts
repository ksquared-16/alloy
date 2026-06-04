import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";

/**
 * Resolve Person / Child drawer targets from queue preview rows for secondary row icons.
 * Reads runtime row fields only — queue rows are previews, not authoritative records.
 */

export type QueueRowRelatedDrawerTargets = {
    opportunityId: string;
    personId: string | null;
    childPersonId: string | null;
};

export type QueueRowRelatedDrawerResolveInput = {
    primaryPersonId?: string | null;
    /** Server-enriched alias on queue rows. */
    primaryChildPersonId?: string | null;
    inquiryChildren?: unknown[];
    activeMemberChildren?: Array<{ person_id?: string | null }>;
};

function trimId(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function inquiryChildrenFromRow(row: Record<string, unknown>): unknown[] {
    const direct = row._inquiry_children;
    if (Array.isArray(direct)) return direct;
    const md = row.metadata;
    if (md && typeof md === "object" && !Array.isArray(md)) {
        const ic = (md as { inquiry_children?: unknown }).inquiry_children;
        if (Array.isArray(ic)) return ic;
    }
    return [];
}

function firstChildPersonIdFromInquiryChildren(children: unknown[]): string | null {
    for (const raw of children) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
        const pid = trimId((raw as { person_id?: unknown }).person_id);
        if (pid) return pid;
    }
    return null;
}

function firstChildPersonIdFromMembers(
    members: Array<{ person_id?: string | null }>,
    excludePersonId: string | null
): string | null {
    for (const member of members) {
        const pid = trimId(member.person_id);
        if (!pid) continue;
        if (excludePersonId && pid === excludePersonId) continue;
        return pid;
    }
    for (const member of members) {
        const pid = trimId(member.person_id);
        if (pid) return pid;
    }
    return null;
}

/** Shared resolver for QueueService enrichment and client queue VM rows. */
export function resolveQueueRowRelatedDrawerPersonIds(
    input: QueueRowRelatedDrawerResolveInput
): { personId: string | null; childPersonId: string | null } {
    const personId = trimId(input.primaryPersonId) || null;
    const enrichedChild = trimId(input.primaryChildPersonId) || null;
    if (enrichedChild) {
        return { personId, childPersonId: enrichedChild };
    }
    const inquiryChildren = input.inquiryChildren ?? [];
    const fromInquiry = firstChildPersonIdFromInquiryChildren(inquiryChildren);
    if (fromInquiry) {
        return { personId, childPersonId: fromInquiry };
    }
    const fromMembers = firstChildPersonIdFromMembers(input.activeMemberChildren ?? [], personId);
    return { personId, childPersonId: fromMembers };
}

export function extractQueueRowRelatedDrawerTargets(
    row: Record<string, unknown> | null | undefined,
    opportunityId: string,
    opts?: { log?: boolean; queueKey?: string | null }
): QueueRowRelatedDrawerTargets {
    const oppId = trimId(opportunityId) || trimId(row?.id) || trimId(row?.opportunity_id);
    const inquiryChildren = row ? inquiryChildrenFromRow(row) : [];
    const resolved = resolveQueueRowRelatedDrawerPersonIds({
        primaryPersonId:
            trimId(row?._primary_person_id) ||
            trimId(row?.primary_person_id) ||
            null,
        primaryChildPersonId: trimId(
            (row as { _primary_child_person_id?: unknown } | undefined)?._primary_child_person_id
        ) || null,
        inquiryChildren,
    });

    const targets: QueueRowRelatedDrawerTargets = {
        opportunityId: oppId,
        personId: resolved.personId,
        childPersonId: resolved.childPersonId,
    };

    if (opts?.log) {
        logDrawerVmRuntimeDiagnostic("work_unit_row_related_targets_resolved", {
            opportunity_id: oppId,
            queue_key: opts.queueKey ?? null,
            person_id: targets.personId,
            child_person_id: targets.childPersonId,
            has_primary_person_id: Boolean(trimId(row?.primary_person_id) || trimId(row?._primary_person_id)),
            has_enriched_child_person_id: Boolean(
                trimId((row as { _primary_child_person_id?: unknown } | undefined)?._primary_child_person_id)
            ),
            inquiry_children_count: inquiryChildren.length,
            inquiry_children_with_person_id: inquiryChildren.filter(
                (raw) =>
                    raw != null &&
                    typeof raw === "object" &&
                    !Array.isArray(raw) &&
                    trimId((raw as { person_id?: unknown }).person_id)
            ).length,
        });
    }

    return targets;
}
