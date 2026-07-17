/**
 * Operational execution receipts — past-tense outcomes (BOS UX Card 16).
 */

import type { ConfigAssistApplyOutcomePresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistApplyPresentation";
import { WORKFLOW_ASSIST_AUTOMATIONS_HREF } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";

export type BosExecutionReceiptOutcome =
    | "applied"
    | "scheduled"
    | "sent"
    | "created"
    | "saved"
    | "failed"
    | "partial";

export type BosExecutionReceiptOperationRow = {
    label: string;
    statusLabel: string;
};

export type BosExecutionReceiptPresentation = {
    outcome: BosExecutionReceiptOutcome;
    headline: string;
    detail: string;
    entityLabel?: string | null;
    occurredAt: string;
    followUp?: string | null;
    link?: { href: string; label: string } | null;
    operationRows?: readonly BosExecutionReceiptOperationRow[];
};

export function formatBosExecutionReceiptTimestamp(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function withEntity(detail: string, entityLabel?: string | null): string {
    const label = entityLabel?.trim();
    if (!label) return detail;
    return `${detail} · ${label}`;
}

export function buildTaskAssistSentReceipt(entityLabel: string): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    return {
        outcome: "sent",
        headline: "Sent",
        detail: withEntity("Message sent through Communications.", entityLabel),
        entityLabel,
        occurredAt: at,
    };
}

export function buildTaskAssistScheduledReceipt(entityLabel: string, scheduledLabel?: string | null): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    const when = scheduledLabel?.trim();
    return {
        outcome: "scheduled",
        headline: "Scheduled",
        detail: withEntity(
            when ? `Message scheduled for ${when}.` : "Message scheduled for a future send.",
            entityLabel
        ),
        entityLabel,
        occurredAt: at,
        followUp: "Review or cancel from Communications before send time.",
    };
}

export function buildTaskAssistReminderCreatedReceipt(entityLabel: string, title?: string | null): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    const t = title?.trim();
    return {
        outcome: "created",
        headline: "Created",
        detail: withEntity(t ? `Reminder task created: ${t}.` : "Reminder task created on this record.", entityLabel),
        entityLabel,
        occurredAt: at,
    };
}

export function buildTaskAssistDraftSavedReceipt(entityLabel: string): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    return {
        outcome: "saved",
        headline: "Saved",
        detail: withEntity("Draft saved for review — not sent.", entityLabel),
        entityLabel,
        occurredAt: at,
    };
}

export function buildTaskAssistFailedReceipt(entityLabel: string, message: string): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    const msg = message.trim() || "The action did not complete.";
    return {
        outcome: "failed",
        headline: "Failed",
        detail: withEntity(msg, entityLabel),
        entityLabel,
        occurredAt: at,
    };
}

export function buildWorkflowAssistAppliedReceipt(args: {
    workflowId?: string | null;
    draftOnly?: boolean;
}): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    const id = args.workflowId?.trim();
    return {
        outcome: "applied",
        headline: args.draftOnly ? "Draft saved" : "Applied",
        detail: args.draftOnly ?
            "Disabled workflow draft saved for admin review."
        :   "Workflow change applied.",
        occurredAt: at,
        link: id ?
            { href: `${WORKFLOW_ASSIST_AUTOMATIONS_HREF}?workflow=${encodeURIComponent(id)}`, label: "Open in Automations" }
        :   { href: WORKFLOW_ASSIST_AUTOMATIONS_HREF, label: "Open Automations" },
    };
}

export function buildWorkflowAssistFailedReceipt(message: string): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    return {
        outcome: "failed",
        headline: "Failed",
        detail: message.trim() || "Workflow apply did not complete.",
        occurredAt: at,
    };
}

export function buildJobLayoutAppliedReceipt(): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    return {
        outcome: "applied",
        headline: "Applied",
        detail: "Job overview layout saved.",
        occurredAt: at,
    };
}

export function buildJobLayoutFailedReceipt(message: string): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    return {
        outcome: "failed",
        headline: "Failed",
        detail: message.trim() || "Layout apply did not complete.",
        occurredAt: at,
    };
}

const APPLY_ROW_STATUS_LABELS: Record<string, string> = {
    applied: "Applied",
    skipped: "Skipped",
    failed: "Failed",
    unverified: "Needs review",
};

export function configApplyOutcomeToExecutionReceipt(
    outcome: ConfigAssistApplyOutcomePresentation
): BosExecutionReceiptPresentation {
    const at = new Date().toISOString();
    const outcomeKind: BosExecutionReceiptOutcome =
        outcome.partialFailure ? "partial"
        : outcome.headline === "Failed" ? "failed"
        : "applied";

    return {
        outcome: outcomeKind,
        headline: outcome.headline,
        detail: outcome.summary,
        occurredAt: at,
        followUp: outcome.showLayoutIntegrityLink ?
            "Check layout integrity in Configuration → Surfaces."
        :   null,
        link: outcome.showLayoutIntegrityLink ?
            { href: "/admin/settings/layouts", label: "Configuration → Surfaces" }
        :   null,
        operationRows: outcome.rows.map((r) => ({
            label: r.label,
            statusLabel: APPLY_ROW_STATUS_LABELS[r.status] ?? r.status,
        })),
    };
}

export function formatBosExecutionReceiptPlainText(receipt: BosExecutionReceiptPresentation): string {
    const parts = [receipt.headline, receipt.detail];
    if (receipt.followUp?.trim()) parts.push(receipt.followUp.trim());
    return parts.filter(Boolean).join(" ");
}
