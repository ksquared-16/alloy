/**
 * What's Next Card V2 presentation builder.
 *
 * Pure composition over CurrentWorkSurfaceVM + OperationalContext signals/truth.
 * No fetches. No domain-specific card branches by work title or stage key.
 */

import { formatTaskDueDate } from "@/lib/presentation/presentationDateFormat";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { CurrentWorkSurfaceVM } from "./currentWorkSurfaceTypes";
import { buildWhatsNextProgressPresentation } from "./buildWhatsNextProgressPresentation";
import type {
    WhatsNextActivityItem,
    WhatsNextCardPresentation,
    WhatsNextContextFact,
    WhatsNextStillNeededItem,
} from "./whatsNextCardTypes";

export type WhatsNextActivityPreviewLike = {
    label: string;
    occurredAt?: string | null;
    kind?: string | null;
};

function primaryContactName(truth: Record<string, unknown> | null | undefined): string | null {
    if (!truth) return null;
    const name = String(truth["person.primary_contact_name"] ?? truth._primary_contact_name ?? "").trim();
    return name || null;
}

function formatMoneyCents(cents: number): string {
    const dollars = cents / 100;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
}

function formatTourStartLabel(iso: string, timeZone?: string | null): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    try {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            ...(timeZone ? { timeZone } : {}),
        }).format(d);
    } catch {
        return null;
    }
}

/**
 * Compact domain-agnostic context facts from signals + truth already on the Focus Panel.
 * Tour / billing / contact contribute only when those facts exist — never invented.
 */
export function buildWhatsNextContextFacts(args: {
    surface: CurrentWorkSurfaceVM;
    context?: Pick<OperationalContext, "truth" | "signals"> | null;
    timeZone?: string | null;
}): WhatsNextContextFact[] {
    const facts: WhatsNextContextFact[] = [];
    const truth = args.context?.truth ?? null;
    const signals = args.context?.signals;

    const contact = primaryContactName(truth);
    if (contact) {
        facts.push({ key: "primary_contact", label: "Primary contact", value: contact });
    }

    const dueRaw = args.surface.primaryWorkItem?.due_at?.trim() || null;
    if (dueRaw) {
        const dueLabel = formatTaskDueDate(dueRaw) || dueRaw;
        facts.push({ key: "due", label: "Due", value: dueLabel });
    }

    const tour = signals?.tour;
    if (tour?.scheduled && tour.startAt) {
        const startLabel = formatTourStartLabel(tour.startAt, args.timeZone) || tour.startAt;
        facts.push({ key: "scheduled_at", label: null, value: startLabel });
        if (tour.statusLabel?.trim()) {
            // Operator-facing booking status only — never raw status keys.
            const status = tour.statusLabel.trim();
            if (!/[_]/.test(status)) {
                facts.push({ key: "booking_status", label: null, value: status });
            }
        }
    }

    const billing = signals?.billing;
    if (billing?.feeBalanceCents != null && billing.feeBalanceCents > 0) {
        facts.push({
            key: "amount_due",
            label: null,
            value: `${formatMoneyCents(billing.feeBalanceCents)} due`,
        });
    }
    if (billing?.tuitionRateLabel?.trim()) {
        facts.push({
            key: "tuition_rate",
            label: null,
            value: billing.tuitionRateLabel.trim(),
        });
    }

    return facts.slice(0, 4);
}

function buildStillNeeded(surface: CurrentWorkSurfaceVM): WhatsNextStillNeededItem[] {
    const items = surface.readiness.requirements?.items ?? [];
    return items
        .filter((item) => item.status === "missing" || item.status === "blocked")
        .map((item) => ({
            key: item.key,
            label: item.targetLabel?.trim()
                ? `${item.label} (${item.targetLabel.trim()})`
                : item.label,
        }))
        .slice(0, 4);
}

function buildDueChip(surface: CurrentWorkSurfaceVM): string | null {
    const dueRaw = surface.primaryWorkItem?.due_at?.trim() || null;
    if (!dueRaw) return null;
    const urgency = surface.primaryWorkItem?.due_urgency ?? null;
    if (urgency === "overdue") return "OVERDUE";
    if (urgency === "today") return "DUE TODAY";
    const formatted = formatTaskDueDate(dueRaw);
    if (!formatted) return null;
    return `DUE ${formatted}`.toUpperCase();
}

function resolveSummaryLine(args: {
    surface: CurrentWorkSurfaceVM;
    /** Future BOS contextual copy — when provided, replaces deterministic text. */
    contextualSummary?: string | null;
}): { summaryLine: string | null; summarySource: "deterministic" | "contextual" } {
    const contextual = args.contextualSummary?.trim() || null;
    if (contextual) {
        return { summaryLine: contextual, summarySource: "contextual" };
    }
    const deterministic =
        args.surface.description?.trim()
        || args.surface.operatorGuidance?.trim()
        || null;
    return { summaryLine: deterministic, summarySource: "deterministic" };
}

/**
 * Compose the reusable What's Next card presentation DTO.
 */
export function buildWhatsNextCardPresentation(args: {
    surface: CurrentWorkSurfaceVM;
    context?: Pick<OperationalContext, "truth" | "signals" | "stageWorkRuntime"> | null;
    activityItems?: WhatsNextActivityPreviewLike[] | null;
    timeZone?: string | null;
    /**
     * Optional future seam for contextual BOS summary copy.
     * When omitted, uses configured work description / purpose (deterministic).
     */
    contextualSummary?: string | null;
}): WhatsNextCardPresentation {
    const { surface } = args;
    const { summaryLine, summarySource } = resolveSummaryLine({
        surface,
        contextualSummary: args.contextualSummary,
    });

    const runtime = args.context?.stageWorkRuntime ?? surface.runtime;
    const progress = buildWhatsNextProgressPresentation({
        runtime,
        checklist: surface.checklist,
        primaryWorkItem: surface.primaryWorkItem,
    });

    const recentActivity: WhatsNextActivityItem[] = (args.activityItems ?? [])
        .slice(0, 2)
        .map((item, index) => ({
            key: `${item.label}-${item.occurredAt ?? index}`,
            label: item.label,
            occurredAt: item.occurredAt ?? null,
            kind: item.kind ?? null,
        }));

    return {
        title: surface.title,
        summaryLine,
        summarySource,
        statusLabel: surface.statusLabel,
        dueChip: buildDueChip(surface),
        progress,
        contextFacts: buildWhatsNextContextFacts({
            surface,
            context: args.context ?? null,
            timeZone: args.timeZone,
        }),
        stillNeeded: buildStillNeeded(surface),
        recentActivity,
    };
}
