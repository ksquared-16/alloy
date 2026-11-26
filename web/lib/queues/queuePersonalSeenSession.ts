/**
 * Session-scoped personal seen overlay for queue rows.
 * Protects against stale queue responses restoring an unseen dot after acknowledgement.
 */

"use client";

import { useSyncExternalStore } from "react";
import {
    occurrenceKeyForAck,
    type StageMembershipAckInput,
} from "@/lib/queues/operatorStageMembershipAck";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

const seenKeys = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

export function markOccurrenceSeenLocally(occurrenceKey: string): void {
    const key = occurrenceKey.trim();
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    emit();
}

export function hydrateOccurrencesSeenLocally(keys: readonly string[]): void {
    let changed = false;
    for (const raw of keys) {
        const key = raw.trim();
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        changed = true;
    }
    if (changed) emit();
}

export function isOccurrenceSeenLocally(occurrenceKey: string | null | undefined): boolean {
    const key = occurrenceKey?.trim();
    return Boolean(key && seenKeys.has(key));
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): number {
    return seenKeys.size;
}

export function useLocallySeenOccurrenceCount(): number {
    return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

export function occurrenceKeyFromQueueRowContext(
    context: QueueRowContext | null | undefined,
    userId: string | null | undefined,
    orgId: string | null | undefined,
): string | null {
    if (!context?.operational_state?.entered_at || !context.operational_state.stage_key) return null;
    const uid = userId?.trim();
    const oid = orgId?.trim();
    if (!uid || !oid) return null;
    const subjectType = context.row_subject.subject_type;
    const subjectId = context.row_subject.subject_id;
    if (!subjectType || !subjectId) return null;
    return occurrenceKeyForAck({
        orgId: oid,
        userId: uid,
        subjectType,
        subjectId,
        stageKey: context.operational_state.stage_key,
        stageEnteredAtIso: context.operational_state.entered_at,
    });
}

export async function acknowledgeQueueRowOpened(params: {
    orgId: string;
    userId: string;
    context: QueueRowContext;
}): Promise<string | null> {
    const stage = params.context.operational_state;
    if (!stage?.entered_at || !stage.stage_key) return null;
    const input: StageMembershipAckInput = {
        orgId: params.orgId,
        userId: params.userId,
        subjectType: params.context.row_subject.subject_type,
        subjectId: params.context.row_subject.subject_id,
        stageKey: stage.stage_key,
        stageEnteredAtIso: stage.entered_at,
    };
    const occurrenceKey = occurrenceKeyForAck(input);
    markOccurrenceSeenLocally(occurrenceKey);

    try {
        const res = await fetch("/api/admin/queues/stage-membership-ack", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject_type: input.subjectType,
                subject_id: input.subjectId,
                stage_key: input.stageKey,
                stage_entered_at: input.stageEnteredAtIso,
            }),
        });
        if (!res.ok) {
            // Local clear already applied — persistence can retry on next open.
            console.warn("[stage-membership-ack] persist failed", res.status);
        }
    } catch (e) {
        console.warn("[stage-membership-ack] persist error", e);
    }
    return occurrenceKey;
}

/** Resolve whether the row should show the unseen indicator for the current viewer. */
export function resolveRowUnseen(params: {
    context: QueueRowContext | null | undefined;
    occurrenceKey: string | null;
}): boolean {
    if (!params.context || !params.occurrenceKey) return false;
    if (isOccurrenceSeenLocally(params.occurrenceKey)) return false;
    if (params.context.personal_seen) return params.context.personal_seen.unseen === true;
    // No server hydrate yet — treat as unseen until ack (optimistic product default).
    return true;
}
