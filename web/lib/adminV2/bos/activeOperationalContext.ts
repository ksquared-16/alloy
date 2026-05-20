/**
 * Active operational context — drawer/queue → Orchestrator (BOS UX coherence V1).
 * @see docs/sprints/05_2026/bos_ux_coherence_design.md §6
 */

import type {
    GlobalAssistantAction,
    GlobalAssistantEntityContext,
    GlobalAssistantSourceSurface,
} from "@/contexts/GlobalAssistantContext";

export type OpportunityQueuePreviewSeed = {
    title?: string | null;
    subtitle?: string | null;
    recordNumberHint?: string | null;
};

/** Default Task Assist actions available from opportunity operational surfaces. */
export const DEFAULT_OPPORTUNITY_OPERATIONAL_ACTIONS: GlobalAssistantAction[] = [
    "draft_sms",
    "draft_email",
    "schedule",
    "reminder",
];

export function entityOperationalContextEqual(
    a: GlobalAssistantEntityContext | null,
    b: GlobalAssistantEntityContext | null
): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const actionsA = a.available_actions ?? [];
    const actionsB = b.available_actions ?? [];
    return (
        a.entity_type === b.entity_type &&
        a.entity_id === b.entity_id &&
        a.label === b.label &&
        a.source_surface === b.source_surface &&
        actionsA.length === actionsB.length &&
        actionsA.every((x, i) => x === actionsB[i])
    );
}

/**
 * Resolve operator-facing label for an open opportunity drawer.
 * Prefer hydrated entity GET; fall back to queue preview seed while loading.
 */
export function resolveOpportunityOperationalContextLabel(args: {
    overviewData: Record<string, unknown> | null | undefined;
    queuePreviewSeed: OpportunityQueuePreviewSeed | null | undefined;
    opportunitySingular: string;
}): string {
    const { overviewData, queuePreviewSeed, opportunitySingular } = args;
    const seedTitle = queuePreviewSeed?.title?.trim();
    if (!overviewData || typeof overviewData !== "object") {
        return seedTitle || opportunitySingular;
    }

    const d = overviewData;
    const ident = (d._identity as Record<string, unknown> | null) ?? null;
    const household =
        ident && typeof ident.household === "object" ?
            (ident.household as Record<string, unknown>)
        :   null;
    const householdLabel =
        household && typeof household.label === "string" ? household.label.trim() : "";
    const customerName =
        typeof d._customer_name === "string" ? String(d._customer_name).trim() : "";
    const contactName =
        typeof d._primary_contact_name === "string" ?
            String(d._primary_contact_name).trim()
        : typeof d._contact_name === "string" ?
          String(d._contact_name).trim()
        :   "";
    const nm = typeof d.name === "string" ? String(d.name).trim() : "";

    const fromRecord = householdLabel || customerName || contactName || nm;
    if (fromRecord) return fromRecord;

    const previewSub = queuePreviewSeed?.subtitle?.trim();
    const recordHint = queuePreviewSeed?.recordNumberHint?.trim();
    if (previewSub && recordHint) return `${previewSub} · ${recordHint}`;
    if (previewSub) return previewSub;
    if (seedTitle) return seedTitle;
    if (recordHint) return recordHint;

    return opportunitySingular;
}

export function buildOpportunityOperationalContext(args: {
    entityId: string;
    overviewData: Record<string, unknown> | null | undefined;
    queuePreviewSeed: OpportunityQueuePreviewSeed | null | undefined;
    opportunitySingular: string;
    sourceSurface: GlobalAssistantSourceSurface;
}): GlobalAssistantEntityContext {
    return {
        entity_type: "opportunities",
        entity_id: args.entityId,
        label: resolveOpportunityOperationalContextLabel({
            overviewData: args.overviewData,
            queuePreviewSeed: args.queuePreviewSeed,
            opportunitySingular: args.opportunitySingular,
        }),
        source_surface: args.sourceSurface,
        available_actions: DEFAULT_OPPORTUNITY_OPERATIONAL_ACTIONS,
    };
}

/** True when a thread action card targets a different opportunity than the active operational context. */
export function isStaleOperationalProposalEntity(
    cardEntityId: string | null | undefined,
    activeOperationalEntityId: string | null | undefined
): boolean {
    const card = cardEntityId?.trim();
    const active = activeOperationalEntityId?.trim();
    if (!card || !active) return false;
    return card !== active;
}

export const STALE_OPERATIONAL_PROPOSAL_MESSAGE =
    "This proposal is for a different record than the active operational context. Open that record or confirm the target again.";

type AttentionSuggestionHandoff = {
    next_action?: { label?: string | null } | null;
} | null;

/**
 * Optional Orchestrator seed from drawer operational context (awareness → recommendation surface).
 * Does not trigger mutations — prefill only.
 */
export function orchestratorHandoffSeedCommand(args: {
    entityLabel: string | null | undefined;
    overviewData: Record<string, unknown> | null | undefined;
}): string | undefined {
    const label = args.entityLabel?.trim() || "this inquiry";
    const suggestion = args.overviewData?._attention_suggestion as AttentionSuggestionHandoff | undefined;
    const nextLabel = suggestion?.next_action?.label?.trim();
    if (nextLabel) {
        return `Follow up with ${label} — ${nextLabel}`;
    }
    return `Draft message for ${label}`;
}
