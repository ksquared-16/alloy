import type { QueueUiRowPreviewAction } from "@/lib/ui-v2/queueUiConfig";
import type { QueueItemQuickActionVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";

type OppRow = WorkspaceOpportunityQueueRuntime["items"][number];

function contactCapabilityForRow(row: OppRow): { emailMailto: boolean; phoneTel: boolean } {
    const email = Boolean((row as { _primary_email?: string | null })._primary_email?.trim());
    const phoneRaw = (row as { _primary_phone?: string | null })._primary_phone?.trim() ?? "";
    return { emailMailto: email, phoneTel: phoneRaw.replace(/\D/g, "").length >= 10 };
}

export type QueueRowPreviewQuickActionBuildInput = {
    previewActions: QueueUiRowPreviewAction[];
    opportunityId: string;
    personId?: string | null;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
    /** Minimal queue row fields for Orchestrator handoff when drawer record is not loaded. */
    rowRecord?: Record<string, unknown> | null;
    contactCapabilities?: { emailMailto: boolean; phoneTel: boolean };
};

function mailtoHref(email: string): string {
    return `mailto:${email.trim()}`;
}

function telHref(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    return digits.length === 11 && digits.startsWith("1") ? `tel:+${digits}` : `tel:${digits}`;
}

/**
 * Queue row preview actions from `ui.row_preview.actions` — Open (and optional Call/Email) only.
 * Message, Ask BOS, and other configurable actions must come from `action_placements`.
 */
export function buildQueueRowPreviewQuickActionsFromConfig(
    input: QueueRowPreviewQuickActionBuildInput
): QueueItemQuickActionVm[] {
    const out: QueueItemQuickActionVm[] = [];
    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    const cap = input.contactCapabilities ?? { emailMailto: Boolean(email), phoneTel: Boolean(phone && phone.replace(/\D/g, "").length >= 10) };

    for (const key of input.previewActions) {
        if (key === "open") {
            out.push({ id: "open", label: "Open", actionId: "open_record", variant: "primary" });
            continue;
        }
        if (key === "message" || key === "orchestrator" || key === "update_status") {
            continue;
        }
        if (key === "call" && cap.phoneTel && phone) {
            out.push({
                id: "call",
                label: "Call",
                actionId: "crm_tel",
                variant: "secondary",
                payload: { href: telHref(phone) },
            });
            continue;
        }
        if (key === "email" && cap.emailMailto && email) {
            out.push({
                id: "email",
                label: "Email",
                actionId: "crm_mailto",
                variant: "secondary",
                payload: { href: mailtoHref(email) },
            });
        }
    }
    return out;
}

/** Row-shaped helper for enrollment VM and adapters. */
export function buildQueueRowPreviewQuickActionsForOpportunityRow(
    row: OppRow,
    previewActions: QueueUiRowPreviewAction[]
): QueueItemQuickActionVm[] {
    const personId = (row as { _primary_person_id?: string | null })._primary_person_id?.trim() ?? "";
    const displayName =
        (row as { _primary_person_name?: string | null })._primary_person_name?.trim() ||
        (row as { _contact_name?: string | null })._contact_name?.trim() ||
        (row as { _customer_name?: string | null })._customer_name?.trim() ||
        undefined;
    const email = (row as { _primary_email?: string | null })._primary_email?.trim() || null;
    const phone = (row as { _primary_phone?: string | null })._primary_phone?.trim() || null;
    return buildQueueRowPreviewQuickActionsFromConfig({
        previewActions,
        opportunityId: row.id,
        personId,
        displayName,
        email,
        phone,
        rowRecord: row as unknown as Record<string, unknown>,
        contactCapabilities: contactCapabilityForRow(row),
    });
}
