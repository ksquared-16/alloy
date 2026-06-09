/**
 * Queue row status pill tone — from status definition metadata when present, else status_key heuristics.
 */

import { parseLifecycleStageFromMetadata } from "@/lib/admin/statusDefinitionLifecycle";
import type { ProofRuntimeRecord } from "./proofRecordContext";

export type QueueRecordStatusPillTone = "info" | "success" | "warning" | "error" | "neutral";

const TONE_SET = new Set<QueueRecordStatusPillTone>(["info", "success", "warning", "error", "neutral"]);

function trimKey(v: unknown): string {
    if (v == null) return "";
    return String(v).trim().toLowerCase();
}

function toneFromLifecycleStage(stage: string): QueueRecordStatusPillTone {
    switch (stage) {
        case "success":
            return "success";
        case "failure":
            return "error";
        case "decision":
            return "warning";
        case "qualification":
        case "intake":
        case "execution":
            return "info";
        default:
            return "neutral";
    }
}

function readToneFromStatusDefinitionMetadata(raw: unknown): QueueRecordStatusPillTone | null {
    if (!raw || typeof raw !== "object") return null;
    const meta = (raw as Record<string, unknown>).metadata;
    if (!meta || typeof meta !== "object") return null;
    const record = meta as Record<string, unknown>;
    for (const key of ["pill_tone", "badge_tone", "status_tone", "tone"]) {
        const candidate = trimKey(record[key]);
        if (TONE_SET.has(candidate as QueueRecordStatusPillTone)) {
            return candidate as QueueRecordStatusPillTone;
        }
    }
    const stage = parseLifecycleStageFromMetadata(record);
    return stage ? toneFromLifecycleStage(stage) : null;
}

/** Map opportunity status_key → restrained Alloy pill tone. */
export function resolveQueueRecordStatusPillToneFromKey(statusKey: string): QueueRecordStatusPillTone {
    const k = trimKey(statusKey);
    if (!k) return "neutral";

    if (/(?:^|_)(?:enrolled|ready_to_enroll|ready|completed|success|won)(?:$|_)/.test(k)) return "success";
    if (/(?:^|_)(?:lost|failed|error|declined|blocked|missing|incomplete)(?:$|_)/.test(k)) return "error";
    if (/(?:^|_)(?:waitlisted|warning|attention|overdue|stale|tour_needed)(?:$|_)/.test(k)) return "warning";
    if (
        /(?:^|_)(?:contact_attempted|contacted|qualification|new_inquiry|new|scheduled|in_progress|tour_scheduled|tour_completed|application_in_progress|enrolling)(?:$|_)/.test(
            k,
        )
    ) {
        return "info";
    }

    return "neutral";
}

/** Resolve pill tone for queue status field from anchor record context. */
export function resolveQueueRecordStatusPillTone(anchorRecord: ProofRuntimeRecord): QueueRecordStatusPillTone {
    const fromDef =
        readToneFromStatusDefinitionMetadata(anchorRecord._status_definition)
        ?? readToneFromStatusDefinitionMetadata(anchorRecord.status_definition);
    if (fromDef) return fromDef;

    const lifecycleStage = trimKey(anchorRecord._status_lifecycle_stage);
    if (lifecycleStage) return toneFromLifecycleStage(lifecycleStage);

    const statusKey = trimKey(
        anchorRecord["opportunity.status_key"]
        ?? anchorRecord.status_key
        ?? anchorRecord._status_display,
    );
    return resolveQueueRecordStatusPillToneFromKey(statusKey);
}

export function queueRecordStatusPillToneClass(tone: QueueRecordStatusPillTone): string {
    return `queue-record-field--status-tone-${tone}`;
}
