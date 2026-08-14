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
import { formatTourStartLabel } from "@/lib/adminV2/runtime/focusPanel/tour/tourPresentation";

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

function truthScalar(truth: Record<string, unknown> | null | undefined, key: string): string | null {
    if (!truth) return null;
    const raw = truth[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    const value = String(raw ?? "").trim();
    return value || null;
}

/**
 * Durable membership / disposition label already on the subject truth bag.
 * Prefer this over work-progress chips ("In progress") when communicating where the subject is.
 */
export function resolveWhatsNextMembershipStatusLabel(
    truth: Record<string, unknown> | null | undefined,
): string | null {
    const keys = [
        "child.status",
        "outcome_status_label",
        "_outcome_status_label",
        "opportunity.status_label",
    ];
    for (const key of keys) {
        const value = truthScalar(truth, key);
        // Skip raw snake_case keys that leaked through without a display label.
        if (value && !/[_]/.test(value)) return value;
    }
    return null;
}

/**
 * Compact domain-agnostic context facts from signals + truth already on the Focus Panel.
 * Tour / billing / contact / placement contribute only when those facts exist — never invented.
 */
export function buildWhatsNextContextFacts(args: {
    surface: CurrentWorkSurfaceVM;
    context?: Pick<OperationalContext, "truth" | "signals"> | null;
    timeZone?: string | null;
}): WhatsNextContextFact[] {
    const facts: WhatsNextContextFact[] = [];
    const truth = args.context?.truth ?? null;
    const signals = args.context?.signals;

    const tracks = missionTracksFact(truth);
    if (tracks) facts.push(tracks);

    const participants = missionParticipantCountFact(truth);
    if (participants) facts.push(participants);

    const position =
        truthScalar(truth, "waitlist.positionLabel")
        ?? truthScalar(truth, "_placement_position_label");
    if (position) {
        facts.push({ key: "waitlist_position", label: "Position", value: position });
    }

    const waitingSince =
        truthScalar(truth, "waitlist.waitSince")
        ?? truthScalar(truth, "_placement_wait_since_label");
    if (waitingSince) {
        facts.push({ key: "waiting_since", label: "Waiting since", value: waitingSince });
    }

    const program =
        truthScalar(truth, "child.program")
        ?? truthScalar(truth, "inquiry_child.program")
        ?? truthScalar(truth, "waitlist.cohortLabel")
        ?? truthScalar(truth, "_program_label");
    if (program) {
        facts.push({ key: "program", label: "Program", value: program });
    }

    const location =
        truthScalar(truth, "child.location")
        ?? truthScalar(truth, "opportunity.location")
        ?? truthScalar(truth, "_location_label")
        ?? truthScalar(truth, "_site_label");
    if (location) {
        facts.push({ key: "location", label: "Location", value: location });
    }

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
    if (tour?.scheduled) {
        // Prefer early placement so the Scheduled Tour fact is not truncated by the fact cap
        // behind waitlist/program/contact rows on family All/Tours lenses.
        const startLabel = tour.startAt
            ? formatTourStartLabel(tour.startAt, args.timeZone) || tour.startAt
            : "Scheduled";
        facts.unshift({ key: "scheduled_tour", label: "Scheduled Tour", value: startLabel });
        // Only surface parent confirmation when the parent has affirmed — not "Awaiting response".
        if (
            tour.parentConfirmationLabel?.trim()
            && !/^awaiting response$/i.test(tour.parentConfirmationLabel.trim())
        ) {
            facts.splice(1, 0, {
                key: "tour_parent_confirmation",
                label: "Parent confirmation",
                value: tour.parentConfirmationLabel.trim(),
            });
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

    return facts.slice(0, 6);
}

/**
 * Stage owns process position; work owns operational detail.
 * Prefer stage label as the card headline when the runtime knows the stage.
 */
export function resolveWhatsNextHeadline(args: {
    surface: CurrentWorkSurfaceVM;
}): { title: string; currentWorkLabel: string | null } {
    const stageLabel = args.surface.runtime?.stage_label?.trim() || null;
    const workLabel =
        args.surface.primaryWorkItem?.label?.trim()
        || (args.surface.title.trim() && args.surface.title !== "No current work configured"
            ? args.surface.title.trim()
            : null);
    if (stageLabel) {
        const currentWorkLabel =
            workLabel && workLabel.toLowerCase() !== stageLabel.toLowerCase() ? workLabel : null;
        return { title: stageLabel, currentWorkLabel };
    }
    return { title: args.surface.title, currentWorkLabel: null };
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

function missionParticipantCountFact(
    truth: Record<string, unknown> | null | undefined,
): WhatsNextContextFact | null {
    if (!truth) return null;
    const count = truth._mission_participant_count;
    if (typeof count !== "number" || !Number.isFinite(count) || count < 2) return null;
    const n = Math.floor(count);
    return {
        key: "mission_participants",
        label: null,
        value: `${n} children`,
    };
}

function missionTracksFact(truth: Record<string, unknown> | null | undefined): WhatsNextContextFact | null {
    if (!truth || truth._mission_homogeneous !== false) return null;
    const keys = Array.isArray(truth._mission_stage_keys) ? truth._mission_stage_keys : [];
    const n = keys.filter((k) => typeof k === "string" && k.trim()).length;
    if (n < 2) return null;
    return {
        key: "mission_tracks",
        label: null,
        value: `${n} active tracks`,
    };
}

function buildDueChip(surface: CurrentWorkSurfaceVM): string | null {
    const dueRaw = surface.primaryWorkItem?.due_at?.trim() || null;
    if (!dueRaw) return null;
    const urgency = surface.primaryWorkItem?.due_urgency ?? null;
    if (urgency === "overdue") return "OVERDUE";
    if (urgency === "due_today") return "DUE TODAY";
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

    // Compact preview: latest 3 operator facts; remainder stays behind View all activity.
    const recentActivity: WhatsNextActivityItem[] = (args.activityItems ?? [])
        .slice(0, 3)
        .map((item, index) => ({
            key: `${item.label}-${item.occurredAt ?? index}`,
            label: item.label,
            occurredAt: item.occurredAt ?? null,
            kind: item.kind ?? null,
        }));

    const { title, currentWorkLabel } = resolveWhatsNextHeadline({ surface });
    const membershipStatus = resolveWhatsNextMembershipStatusLabel(args.context?.truth ?? null);

    return {
        title,
        currentWorkLabel,
        summaryLine,
        summarySource,
        statusLabel: membershipStatus || surface.statusLabel,
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
