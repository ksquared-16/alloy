import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { normalizeEnrollmentQueueRowPreviewActions } from "@/lib/ui-v2/enrollmentQueueRowPreviewPolicy";
import type { QueueUiRowPreviewAction } from "@/lib/ui-v2/queueUiConfig";
import type { QueueItemQuickActionVm } from "@/lib/ui-v2/workspace-types";
import {
    buildQueueRowPreviewQuickActionsFromConfig,
    type QueueRowPreviewQuickActionBuildInput,
} from "@/lib/workspace/viewModels/queueRowPreviewQuickActions";

export { normalizeEnrollmentQueueRowPreviewActions } from "@/lib/ui-v2/enrollmentQueueRowPreviewPolicy";

function registryQuickActions(
    placements: ResolvedActionForClient[],
    row: Pick<QueueRowPreviewQuickActionBuildInput, "opportunityId" | "personId" | "displayName" | "email" | "phone">
): QueueItemQuickActionVm[] {
    const out: QueueItemQuickActionVm[] = [];
    for (const a of placements) {
        if (a.key === "open_record") continue;
        if (a.key === "quick_message" || a.key === "send_message_placeholder") {
            out.push({
                id: `registry-${a.key}`,
                label: a.label?.trim() || "Message",
                actionId: "quick_message",
                variant: "secondary",
                payload: {
                    source: "action_registry",
                    opportunityId: row.opportunityId,
                    personId: row.personId?.trim() || null,
                    displayName: row.displayName,
                    email: row.email ?? null,
                    phone: row.phone ?? null,
                },
            });
            continue;
        }
        if (a.key === "ask_bos") {
            out.push({
                id: "registry-ask_bos",
                label: a.label?.trim() || "Ask BOS",
                actionId: "ask_bos",
                variant: "secondary",
                payload: {
                    source: "action_registry",
                    opportunityId: row.opportunityId,
                    displayName: row.displayName,
                    rowRecord: row.rowRecord ?? { id: row.opportunityId },
                },
            });
            continue;
        }
        out.push({
            id: `registry-${a.key}`,
            label: a.label?.trim() || a.key,
            actionId: a.key,
            variant: "secondary",
            payload: {
                source: "action_registry",
                opportunityId: row.opportunityId,
                rowRecord: row.rowRecord ?? null,
            },
        });
    }
    return out;
}

function dedupeQuickActions(actions: QueueItemQuickActionVm[]): QueueItemQuickActionVm[] {
    const out: QueueItemQuickActionVm[] = [];
    const seen = new Set<string>();
    for (const a of actions) {
        const dispatch = (a.actionId ?? a.id).trim();
        if (!dispatch || seen.has(dispatch)) continue;
        seen.add(dispatch);
        out.push(a);
    }
    return out;
}

/**
 * Merge queue-definition preview chips with config-driven `queue_row` registry placements.
 */
export function mergeQueueRowQuickActions(input: {
    previewActions: QueueUiRowPreviewAction[];
    registryPlacements?: ResolvedActionForClient[] | null;
    row: QueueRowPreviewQuickActionBuildInput;
    enrollmentLike?: boolean;
}): QueueItemQuickActionVm[] {
    const previewActions = input.enrollmentLike
        ? normalizeEnrollmentQueueRowPreviewActions(input.previewActions)
        : input.previewActions;

    const fromPreview = buildQueueRowPreviewQuickActionsFromConfig({
        ...input.row,
        previewActions,
    });

    const registry = registryQuickActions(input.registryPlacements ?? [], input.row);

    return dedupeQuickActions([...fromPreview, ...registry]);
}

export function mergeQueueRowQuickActionsForOpportunityRow(
    row: QueueRowPreviewQuickActionBuildInput["rowRecord"] & { id: string },
    previewActions: QueueUiRowPreviewAction[],
    registryPlacements: ResolvedActionForClient[] | null | undefined,
    opts?: { enrollmentLike?: boolean }
): QueueItemQuickActionVm[] {
    const r = row as Record<string, unknown>;
    const personId = typeof r._primary_person_id === "string" ? r._primary_person_id.trim() : "";
    const displayName =
        (typeof r._primary_person_name === "string" ? r._primary_person_name.trim() : "") ||
        (typeof r._contact_name === "string" ? r._contact_name.trim() : "") ||
        (typeof r._customer_name === "string" ? r._customer_name.trim() : "") ||
        undefined;
    const email = typeof r._primary_email === "string" ? r._primary_email.trim() || null : null;
    const phone = typeof r._primary_phone === "string" ? r._primary_phone.trim() || null : null;

    return mergeQueueRowQuickActions({
        previewActions,
        registryPlacements,
        enrollmentLike: opts?.enrollmentLike,
        row: {
            previewActions,
            opportunityId: row.id,
            personId,
            displayName,
            email,
            phone,
            rowRecord: r,
        },
    });
}
