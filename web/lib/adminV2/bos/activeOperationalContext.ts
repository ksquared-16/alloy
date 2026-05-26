/**
 * Active operational context — drawer/queue → Orchestrator (BOS UX coherence V1).
 * @see docs/sprints/05_2026/bos_ux_coherence_design.md §6
 */

import type {
    GlobalAssistantAction,
    GlobalAssistantEntityContext,
    GlobalAssistantSourceSurface,
} from "@/contexts/GlobalAssistantContext";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import {
    buildOperationalRecommendationHandoffCopy,
    formatOrchestratorHandoffSeedFromCopy,
    hasStructuredOperationalHandoff,
} from "@/lib/adminV2/bos/operationalRecommendationHandoff";

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
            : null;
    const householdLabel =
        household && typeof household.label === "string" ? household.label.trim() : "";
    const customerName =
        typeof d._customer_name === "string" ? String(d._customer_name).trim() : "";
    const contactName =
        typeof d._primary_contact_name === "string" ?
            String(d._primary_contact_name).trim()
            : typeof d._contact_name === "string" ?
                String(d._contact_name).trim()
                : "";
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

export { STALE_OPERATIONAL_PROPOSAL_MESSAGE } from "@/lib/adminV2/bos/bosGovernanceCopy";

/**
 * Optional Orchestrator seed from drawer operational context (awareness → recommendation surface).
 * Does not trigger mutations — prefill only.
 */
/** Active opportunity from Orchestrator session context (drawer / queue / command bar). */
export function activeOpportunityFromContext(
    ctx: GlobalAssistantEntityContext | null | undefined
): { entity_id: string; label: string } | null {
    if (ctx?.entity_type !== "opportunities") return null;
    const entity_id = ctx.entity_id?.trim();
    if (!entity_id) return null;
    return { entity_id, label: ctx.label?.trim() || "Current opportunity" };
}

export function buildActiveOpportunitySearchCandidate(args: {
    entity_id: string;
    label: string;
}): TaskAssistEntitySearchCandidate {
    return {
        entity_type: "opportunities",
        entity_id: args.entity_id,
        label: args.label.trim() || "Current opportunity",
        subtitle: null,
        confidence: "high",
        source: "opportunity_name",
        matched_fields: ["ambient_context"],
    };
}

/** True when the operator explicitly asks to search or pick among records. */
export function commandExplicitlyRequestsRecordSearch(command: string): boolean {
    const t = command.trim();
    if (!t) return false;
    return /\b(find|search|look\s*up|lookup|which\s+(one|record|opportunity|inquiry|family)|list\s+(all|records|opportunities|families)|show\s+(me\s+)?(all|every)\s+(records|opportunities|families)|pick\s+(a\s+)?different|another\s+(record|opportunity|family|inquiry))\b/i.test(
        t
    );
}

/**
 * When an active drawer opportunity is set, Task Assist should use it directly unless the operator
 * explicitly requests a cross-record search.
 */
export function shouldShortCircuitTaskAssistEntitySearch(args: {
    command: string;
    activeOpportunity: { entity_id: string } | null;
}): boolean {
    if (!args.activeOpportunity?.entity_id) return false;
    return !commandExplicitlyRequestsRecordSearch(args.command);
}

export function usingActiveRecordNoticeText(label: string): string {
    const t = label.trim();
    return `Using active record: ${t || "this inquiry"}`;
}

export function orchestratorHandoffSeedCommand(args: {
    entityLabel: string | null | undefined;
    overviewData: Record<string, unknown> | null | undefined;
}): string | undefined {
    const label = args.entityLabel?.trim() || "this inquiry";
    if (!hasStructuredOperationalHandoff(args.overviewData)) {
        return `Draft message for ${label}`;
    }
    const copy = buildOperationalRecommendationHandoffCopy({
        entityLabel: args.entityLabel,
        overviewData: args.overviewData,
    });
    return formatOrchestratorHandoffSeedFromCopy(label, copy);
}
