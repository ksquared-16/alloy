import {
    parseWorkflowScopeFromMetadata,
    type WorkflowScopeMetadataV1,
} from "@/lib/workflows/workflowScopeMetadata";
import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type { WorkflowAssistReminderIntentV1 } from "@/lib/agent/workflowAssist/workflowAssistMessageVariablesV1";

export type WorkflowAssistDuplicateMatchV1 = {
    workflow_id: string;
    name: string;
    enabled: boolean | null;
    event_type: string | null;
    entity_type: string | null;
    match_reasons: string[];
    scope_label: string;
};

export type WorkflowAssistDuplicateCheckV1 = {
    has_likely_duplicate: boolean;
    matches: WorkflowAssistDuplicateMatchV1[];
};

export type WorkflowAssistDuplicateProbeRowV1 = {
    id: string;
    name: string | null;
    enabled: boolean | null;
    event_type: string | null;
    entity_type: string | null;
    metadata?: unknown;
};

export type WorkflowAssistDuplicateProbeV1 = {
    template_id: WorkflowAssistCreateTemplateIdV1;
    proposed_name: string;
    event_type: string;
    entity_type: string;
    scope?: WorkflowScopeMetadataV1 | null;
    lead_days_before_tour?: number | null;
    reminder_intent_v1?: WorkflowAssistReminderIntentV1 | null;
};

function norm(s: string | null | undefined): string {
    return String(s ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ");
}

function scopeLabel(metadata: unknown, probeScope?: WorkflowScopeMetadataV1 | null): string {
    const rowScope = parseWorkflowScopeFromMetadata(metadata);
    if (probeScope?.work_unit_id && rowScope?.work_unit_id === probeScope.work_unit_id) {
        return "Same work unit";
    }
    if (probeScope?.department_id && rowScope?.department_id === probeScope.department_id) {
        return rowScope?.work_unit_id ? "Same department (other work unit)" : "Same department";
    }
    if (rowScope?.department_id || rowScope?.work_unit_id) return "Scoped (different scope)";
    return "Org-wide";
}

function scopesOverlap(a: WorkflowScopeMetadataV1 | null | undefined, b: WorkflowScopeMetadataV1 | null | undefined): boolean {
    const aWu = a?.work_unit_id?.trim() || null;
    const bWu = b?.work_unit_id?.trim() || null;
    const aDept = a?.department_id?.trim() || null;
    const bDept = b?.department_id?.trim() || null;

    if (aWu && bWu && aWu !== bWu) return false;
    if (aWu && !bWu) return false;
    if (!aWu && bWu) return false;
    if (aDept && bDept && aDept !== bDept) return false;
    if (aDept && !bDept && aWu) return false;
    if (!aDept && bDept && bWu) return false;
    return true;
}

function parseTemplateId(metadata: unknown): WorkflowAssistCreateTemplateIdV1 | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const wa = (metadata as Record<string, unknown>).workflow_assist;
    if (!wa || typeof wa !== "object" || Array.isArray(wa)) return null;
    const tid = (wa as Record<string, unknown>).template_id;
    if (tid === "tour_reminder" || tid === "enrollment_when_move" || tid === "generic_stub") return tid;
    return null;
}

function parseReminderIntent(metadata: unknown): WorkflowAssistReminderIntentV1 | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const wa = (metadata as Record<string, unknown>).workflow_assist;
    if (!wa || typeof wa !== "object" || Array.isArray(wa)) return null;
    const ri = (wa as Record<string, unknown>).reminder_intent_v1;
    if (!ri || typeof ri !== "object" || Array.isArray(ri)) return null;
    return ri as WorkflowAssistReminderIntentV1;
}

function nameSimilarity(proposed: string, existing: string | null): boolean {
    const p = norm(proposed);
    const e = norm(existing);
    if (!p || !e) return false;
    if (p === e) return true;
    if (e.includes(p) || p.includes(e)) return true;
    const tourTokens = ["tour", "reminder"];
    if (tourTokens.every((t) => p.includes(t)) && tourTokens.every((t) => e.includes(t))) return true;
    return false;
}

/**
 * Deterministic duplicate probe for Workflow Assist create proposals (no DB I/O).
 */
export function findWorkflowAssistDuplicates(
    rows: WorkflowAssistDuplicateProbeRowV1[],
    probe: WorkflowAssistDuplicateProbeV1
): WorkflowAssistDuplicateCheckV1 {
    const matches: WorkflowAssistDuplicateMatchV1[] = [];

    for (const row of rows) {
        const reasons: string[] = [];
        const rowEvent = norm(row.event_type);
        const rowEntity = norm(row.entity_type);
        const probeEvent = norm(probe.event_type);
        const probeEntity = norm(probe.entity_type);

        if (rowEvent && probeEvent && rowEvent === probeEvent) reasons.push("Same trigger event");
        if (rowEntity && probeEntity && rowEntity === probeEntity) reasons.push("Same entity type");

        const rowTemplate = parseTemplateId(row.metadata);
        if (rowTemplate && rowTemplate === probe.template_id) reasons.push("Same Assist template");

        if (nameSimilarity(probe.proposed_name, row.name)) reasons.push("Similar workflow name");

        const rowIntent = parseReminderIntent(row.metadata);
        if (
            probe.template_id === "tour_reminder" &&
            rowIntent &&
            probe.reminder_intent_v1 &&
            rowIntent.timing?.kind === probe.reminder_intent_v1.timing?.kind &&
            rowIntent.timing?.days === probe.reminder_intent_v1.timing?.days
        ) {
            reasons.push("Same reminder timing intent");
        }

        const rowScope = parseWorkflowScopeFromMetadata(row.metadata);
        if (reasons.length > 0 && !scopesOverlap(probe.scope, rowScope)) {
            continue;
        }

        const strongMatch =
            reasons.includes("Same Assist template") ||
            (reasons.includes("Same trigger event") && reasons.includes("Same entity type")) ||
            (reasons.includes("Same reminder timing intent") &&
                (reasons.includes("Same Assist template") || reasons.includes("Same trigger event"))) ||
            (reasons.includes("Similar workflow name") &&
                (reasons.includes("Same trigger event") || reasons.includes("Same Assist template")));

        if (strongMatch) {
            matches.push({
                workflow_id: row.id,
                name: row.name?.trim() || row.id.slice(0, 8),
                enabled: row.enabled,
                event_type: row.event_type,
                entity_type: row.entity_type,
                match_reasons: [...new Set(reasons)],
                scope_label: scopeLabel(row.metadata, probe.scope),
            });
        }
    }

    matches.sort((a, b) => b.match_reasons.length - a.match_reasons.length);

    return {
        has_likely_duplicate: matches.length > 0,
        matches: matches.slice(0, 5),
    };
}
