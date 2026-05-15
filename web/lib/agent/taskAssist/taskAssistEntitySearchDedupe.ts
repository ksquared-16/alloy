import { mergeMatchedNameLists } from "@/lib/agent/taskAssist/taskAssistEntitySearchDisambiguation";
import type {
    TaskAssistEntitySearchCandidate,
    TaskAssistEntitySearchConfidence,
    TaskAssistEntitySearchSource,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const SOURCE_RANK: Record<TaskAssistEntitySearchSource, number> = {
    uuid_match: 0,
    opportunity_name: 1,
    customer_family: 2,
    primary_person: 3,
    primary_contact: 4,
    customer_member: 5,
};

const CONFIDENCE_RANK: Record<TaskAssistEntitySearchConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
};

function candidateKey(c: TaskAssistEntitySearchCandidate): string {
    return `${c.entity_type}:${String(c.entity_id).trim()}`;
}

function pickHigherConfidence(
    a: TaskAssistEntitySearchConfidence,
    b: TaskAssistEntitySearchConfidence
): TaskAssistEntitySearchConfidence {
    return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

function pickPreferredSource(
    a: TaskAssistEntitySearchSource,
    b: TaskAssistEntitySearchSource
): TaskAssistEntitySearchSource {
    return SOURCE_RANK[a] <= SOURCE_RANK[b] ? a : b;
}

function mergeSubtitle(a: string | null, b: string | null): string | null {
    const parts = new Set<string>();
    for (const raw of [a, b]) {
        if (!raw?.trim()) continue;
        for (const part of raw.split(" · ").map((p) => p.trim()).filter(Boolean)) {
            parts.add(part);
        }
    }
    return parts.size ? [...parts].join(" · ") : null;
}

/** Merge two candidates for the same opportunity — prefer stronger source and union matched_fields. */
export function mergeTaskAssistEntitySearchCandidates(
    existing: TaskAssistEntitySearchCandidate,
    incoming: TaskAssistEntitySearchCandidate
): TaskAssistEntitySearchCandidate {
    const source = pickPreferredSource(existing.source, incoming.source);
    const confidence = pickHigherConfidence(existing.confidence, incoming.confidence);
    const matched_fields = [...new Set([...existing.matched_fields, ...incoming.matched_fields])];
    const disambiguation = {
        customer_name: existing.disambiguation?.customer_name ?? incoming.disambiguation?.customer_name ?? null,
        customer_id: existing.disambiguation?.customer_id ?? incoming.disambiguation?.customer_id ?? null,
        primary_person_id: existing.disambiguation?.primary_person_id ?? incoming.disambiguation?.primary_person_id ?? null,
        primary_contact_id: existing.disambiguation?.primary_contact_id ?? incoming.disambiguation?.primary_contact_id ?? null,
        opportunity_number: existing.disambiguation?.opportunity_number ?? incoming.disambiguation?.opportunity_number ?? null,
        location_name: existing.disambiguation?.location_name ?? incoming.disambiguation?.location_name ?? null,
        status_key: existing.disambiguation?.status_key ?? incoming.disambiguation?.status_key ?? null,
        child_display_name:
            existing.disambiguation?.child_display_name ?? incoming.disambiguation?.child_display_name ?? null,
        tour_date_hint: existing.disambiguation?.tour_date_hint ?? incoming.disambiguation?.tour_date_hint ?? null,
        created_at_hint: existing.disambiguation?.created_at_hint ?? incoming.disambiguation?.created_at_hint ?? null,
        matched_members: mergeMatchedNameLists(
            existing.disambiguation?.matched_members,
            incoming.disambiguation?.matched_members
        ),
        matched_contacts: mergeMatchedNameLists(
            existing.disambiguation?.matched_contacts,
            incoming.disambiguation?.matched_contacts
        ),
    };
    const label = existing.label.trim() || incoming.label.trim();
    return {
        entity_type: existing.entity_type,
        entity_id: existing.entity_id,
        label: label || incoming.label,
        subtitle: mergeSubtitle(existing.subtitle, incoming.subtitle),
        confidence,
        source,
        matched_fields,
        disambiguation,
    };
}

/** Final pass — dedupe by entity_type + entity_id, merge metadata, sort by source rank. */
export function dedupeTaskAssistEntitySearchCandidates(
    candidates: TaskAssistEntitySearchCandidate[]
): TaskAssistEntitySearchCandidate[] {
    const byKey = new Map<string, TaskAssistEntitySearchCandidate>();
    for (const c of candidates) {
        const id = String(c.entity_id ?? "").trim();
        if (!id) continue;
        const key = candidateKey(c);
        const prev = byKey.get(key);
        byKey.set(key, prev ? mergeTaskAssistEntitySearchCandidates(prev, c) : c);
    }
    return [...byKey.values()].sort((a, b) => {
        const sr = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
        if (sr !== 0) return sr;
        return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    });
}
