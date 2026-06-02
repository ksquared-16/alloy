/**
 * Lifecycle stage work unit queue presentation modes.
 * Waitlist stages use candidate-grain waitlist layout (same execution path as enrollment pipeline waitlist lane).
 */

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    applyStatusKeysToLifecycleStageQueueDefinition,
    primaryQueueKeyForLifecycleStage,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";

export type LifecycleStageQueuePresentationMode =
    | "standard_opportunity"
    | "waitlist_candidate"
    | "child_grain";

export function resolveLifecycleStageQueuePresentationMode(stageKey: string): LifecycleStageQueuePresentationMode {
    const operator = asOperatorStageKey(stageKey);
    if (operator === "waitlist") return "waitlist_candidate";
    if (operator === "enrollment") return "child_grain";
    return "standard_opportunity";
}

function filterListWithValues(filters: unknown, type: string, values: string[]): unknown[] {
    const list = Array.isArray(filters) ? [...filters] : [];
    let replaced = false;
    for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (f == null || typeof f !== "object") continue;
        const row = f as { type?: string };
        if (String(row.type ?? "") !== type) continue;
        list[i] = { ...row, operator: "in", values: [...values] };
        replaced = true;
        break;
    }
    if (!replaced && values.length) {
        list.push({ type, operator: "in", values: [...values] });
    }
    return list;
}

/** Candidate-grain waitlist queue — mirrors enrollment_pipeline waitlist lane semantics. */
export function buildLifecycleWaitlistStageQueueDefinition(params: {
    stageKey: string;
    label: string;
    statusKeys: readonly string[];
}): Record<string, unknown> {
    const stageKey = params.stageKey.trim();
    const label = params.label.trim() || "Waitlist";
    const queueKey = primaryQueueKeyForLifecycleStage(stageKey);
    const pipeline = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2;
    const waitlistTemplate = ([...pipeline.queues] as unknown[]).find(
        (q) => q != null && typeof q === "object" && (q as { key?: string }).key === "waitlist"
    ) as Record<string, unknown> | undefined;

    const statusValues = params.statusKeys.map((k) => k.trim()).filter(Boolean);
    const waitlistQueue = waitlistTemplate
        ? (structuredClone(waitlistTemplate) as Record<string, unknown>)
        : {
              key: "waitlist",
              label: "Waitlist",
              domain: "waitlist",
              grain: "candidate",
              filters: [
                  { type: "candidate_status", operator: "in", values: ["active", "paused"] },
                  { type: "child_lifecycle_status", operator: "in", values: ["waitlisted"] },
              ],
              filters_compat_v1: [{ type: "status", operator: "in", values: statusValues }],
          };

    waitlistQueue.key = queueKey;
    waitlistQueue.label = label;
    if (statusValues.length) {
        waitlistQueue.filters_compat_v1 = filterListWithValues(waitlistQueue.filters_compat_v1, "status", statusValues);
    }

    const doc: Record<string, unknown> = {
        version: 2,
        entity_type: "opportunity",
        ui: {
            layout: "single_section",
            primary_total_label: label,
            primary_total_queue: queueKey,
            suppress_active_queue_description: false,
            sections: [{ key: "primary", label, queue_keys: [queueKey] }],
            row_preview: {
                variant: "crm_compact",
                fields: ["title", "status", "primary_contact", "child_name", "program"],
                actions: ["open"],
            },
        },
        queues: [waitlistQueue],
    };
    loadQueueDefinitionBundle(doc);
    return doc;
}

export function buildLifecycleStageQueueDefinitionForPresentation(params: {
    stageKey: string;
    label: string;
    statusKeys: readonly string[];
}): Record<string, unknown> {
    const mode = resolveLifecycleStageQueuePresentationMode(params.stageKey);
    if (mode === "waitlist_candidate") {
        return buildLifecycleWaitlistStageQueueDefinition(params);
    }
    const queueKey = primaryQueueKeyForLifecycleStage(params.stageKey);
    const label = params.label.trim() || "Queue";
    const values = params.statusKeys.map((k) => k.trim()).filter(Boolean);
    const statusFilters = filterListWithValues([], "status", values);
    const caseFilters = filterListWithValues([], "case_status", values);
    const doc: Record<string, unknown> = {
        version: 2,
        entity_type: "opportunity",
        ui: {
            layout: "single_section",
            primary_total_label: label,
            primary_total_queue: queueKey,
            suppress_active_queue_description: false,
            sections: [{ key: "primary", label, queue_keys: [queueKey] }],
            row_preview: {
                variant: "crm_compact",
                fields: [
                    "title",
                    "status",
                    "primary_contact",
                    "phone",
                    "email",
                    "child_name",
                    "program",
                    "desired_start_date",
                ],
                actions: ["open"],
            },
        },
        queues: [
            {
                key: queueKey,
                label,
                grain: mode === "child_grain" ? ("child" as const) : ("case" as const),
                filters_compat_v1: statusFilters,
                filters: caseFilters,
            },
        ],
    };
    loadQueueDefinitionBundle(doc);
    return doc;
}
