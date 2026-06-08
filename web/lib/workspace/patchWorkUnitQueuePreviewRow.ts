import type { OpportunityQueueRowDisplayPatch } from "@/lib/admin/opportunityQueueRowDisplayPatch";
import type { QueueItemsResult } from "@/lib/queues/types";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function baseNameFromCrmChildPrimary(primary: string): string {
    const s = primary.trim().replace(/\s+/g, " ");
    const idx = s.lastIndexOf(" (");
    return (idx === -1 ? s : s.slice(0, idx)).trim().toLowerCase();
}

type CrmCompactLine = { primary: string; secondary: string | null };

function patchCrmCompactChildren(
    lines: CrmCompactLine[] | null | undefined,
    childPatch: NonNullable<OpportunityQueueRowDisplayPatch["child"]>
): CrmCompactLine[] | undefined {
    if (!lines?.length) return lines ?? undefined;
    const targetName = childPatch.display_name
        ? baseNameFromCrmChildPrimary(childPatch.display_name)
        : childPatch.primary
          ? baseNameFromCrmChildPrimary(childPatch.primary)
          : null;
    let touched = false;
    const next = lines.map((line) => {
        const lineKey = baseNameFromCrmChildPrimary(line.primary);
        const match =
            lines.length === 1 ||
            (targetName != null && targetName.length > 0 && lineKey === targetName);
        if (!match) return line;
        touched = true;
        return {
            primary: childPatch.primary ?? line.primary,
            secondary:
                childPatch.program_label !== undefined
                    ? childPatch.program_label
                    : line.secondary,
        };
    });
    return touched ? next : lines;
}

/** Patch one opportunity queue API preview row (display mirrors only). */
export function patchWorkUnitQueueApiRow(
    row: Record<string, unknown>,
    opportunityId: string,
    patch: OpportunityQueueRowDisplayPatch
): Record<string, unknown> | null {
    const rowOppId = trimOrNull(row.id ?? row.opportunity_id);
    if (rowOppId !== opportunityId) return null;

    let changed = false;
    const next: Record<string, unknown> = { ...row };

    const assign = (key: string, value: unknown) => {
        if (value === undefined) return;
        if (next[key] !== value) {
            next[key] = value;
            changed = true;
        }
    };

    if (patch.customer_name !== undefined) {
        assign("_customer_name", patch.customer_name);
        assign("title", patch.customer_name);
    }
    if (patch.primary_contact_line !== undefined) assign("_primary_contact_line", patch.primary_contact_line);
    if (patch.primary_phone !== undefined) assign("_primary_phone", patch.primary_phone);
    if (patch.primary_email !== undefined) assign("_primary_email", patch.primary_email);
    if (patch.location_label !== undefined) assign("_location_label", patch.location_label);
    if (patch.requested_program !== undefined) assign("_requested_program", patch.requested_program);
    if (patch.child_display_name !== undefined) assign("_child_display_name", patch.child_display_name);

    if (patch.child) {
        const existing = Array.isArray(next._crm_compact_children)
            ? (next._crm_compact_children as CrmCompactLine[])
            : undefined;
        const patchedChildren = patchCrmCompactChildren(existing, patch.child);
        if (patchedChildren && patchedChildren !== existing) {
            next._crm_compact_children = patchedChildren;
            changed = true;
        }
    }

    return changed ? next : null;
}

function patchCrmCompactChildLineVm(
    line: { primary: string; secondary?: string | null; programInline?: string | null },
    childPatch: NonNullable<OpportunityQueueRowDisplayPatch["child"]>
): typeof line | null {
    const targetName = childPatch.display_name
        ? baseNameFromCrmChildPrimary(childPatch.display_name)
        : childPatch.primary
          ? baseNameFromCrmChildPrimary(childPatch.primary)
          : null;
    const lineKey = baseNameFromCrmChildPrimary(line.primary);
    if (targetName && lineKey !== targetName) return null;
    return {
        ...line,
        primary: childPatch.primary ?? line.primary,
        secondary: childPatch.program_label !== undefined ? childPatch.program_label : line.secondary,
        programInline:
            childPatch.program_label !== undefined ? childPatch.program_label : line.programInline,
    };
}

/** Patch one rendered queue preview VM (display mirrors only). */
export function patchWorkUnitQueuePreviewItem(
    item: QueuePreviewItemVm,
    opportunityId: string,
    patch: OpportunityQueueRowDisplayPatch
): QueuePreviewItemVm | null {
    const itemOppId = trimOrNull(item.opportunityId ?? item.id);
    if (itemOppId !== opportunityId) return null;

    let changed = false;
    let next: QueuePreviewItemVm = item;

    if (patch.customer_name !== undefined) {
        const title = patch.customer_name ?? "";
        if (next.title !== title) {
            next = { ...next, title };
            changed = true;
        }
    }

    const compact = next.semanticCrmCompact;
    if (compact) {
        let compactNext = compact;
        if (patch.customer_name !== undefined && compact.primaryIdentity !== patch.customer_name) {
            compactNext = { ...compactNext, primaryIdentity: patch.customer_name ?? "" };
            changed = true;
        }
        if (patch.primary_contact_line !== undefined) {
            compactNext = {
                ...compactNext,
                contactDisplayName: patch.primary_contact_line,
                contactSnippet: patch.primary_contact_line,
            };
            changed = true;
        }
        if (patch.primary_phone !== undefined) {
            compactNext = { ...compactNext, contactPhoneDisplay: patch.primary_phone };
            changed = true;
        }
        if (patch.primary_email !== undefined) {
            compactNext = { ...compactNext, contactEmail: patch.primary_email };
            changed = true;
        }
        if (patch.location_label !== undefined) {
            compactNext = { ...compactNext, locationContext: patch.location_label };
            changed = true;
        }
        if (patch.requested_program !== undefined) {
            compactNext = { ...compactNext, programContext: patch.requested_program };
            changed = true;
        }
        if (patch.child_display_name !== undefined) {
            compactNext = { ...compactNext, childName: patch.child_display_name };
            changed = true;
        }
        if (patch.child) {
            if (compactNext.childrenLines?.length) {
                const lines = compactNext.childrenLines.map((line) => {
                    const patched = patchCrmCompactChildLineVm(line, patch.child!);
                    return patched ?? line;
                });
                compactNext = { ...compactNext, childrenLines: lines };
                changed = true;
            } else if (patch.child.primary ?? patch.child.display_name) {
                compactNext = {
                    ...compactNext,
                    childName: patch.child.primary ?? patch.child.display_name ?? compactNext.childName,
                };
                changed = true;
            }
            if (patch.child.program_label !== undefined) {
                compactNext = { ...compactNext, programContext: patch.child.program_label };
                changed = true;
            }
        }
        if (changed) {
            next = { ...next, semanticCrmCompact: compactNext };
        }
    }

    if (patch.child?.program_label !== undefined && next.placementWaitlistCandidate) {
        const cohort = patch.child.program_label ?? next.placementWaitlistCandidate.cohortLabel;
        if (cohort !== next.placementWaitlistCandidate.cohortLabel) {
            next = {
                ...next,
                placementWaitlistCandidate: {
                    ...next.placementWaitlistCandidate,
                    cohortLabel: cohort ?? next.placementWaitlistCandidate.cohortLabel,
                },
            };
            changed = true;
        }
    }

    return changed ? next : null;
}

export function patchWorkUnitQueueItemsResult(
    result: QueueItemsResult | null,
    opportunityId: string,
    patch: OpportunityQueueRowDisplayPatch
): QueueItemsResult | null {
    if (!result?.items?.length) return null;
    let anyChanged = false;
    const items = (result.items as Record<string, unknown>[]).map((row) => {
        const patched = patchWorkUnitQueueApiRow(row, opportunityId, patch);
        if (patched) {
            anyChanged = true;
            return patched;
        }
        return row;
    });
    return anyChanged ? { ...result, items } : null;
}

export function patchWorkUnitQueuePreviewItems(
    items: readonly QueuePreviewItemVm[],
    opportunityId: string,
    patch: OpportunityQueueRowDisplayPatch
): QueuePreviewItemVm[] | null {
    let anyChanged = false;
    const next = items.map((item) => {
        const patched = patchWorkUnitQueuePreviewItem(item, opportunityId, patch);
        if (patched) {
            anyChanged = true;
            return patched;
        }
        return item;
    });
    return anyChanged ? next : null;
}
