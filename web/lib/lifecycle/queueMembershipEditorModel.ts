/**
 * Draft + normalization helpers for queue_membership_v1 stage editor.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { defaultCountUnitForSubject } from "@/lib/lifecycle/queueMembershipUiLabels";
import {
    parseQueueMembershipV1,
    type QueueMembershipCountUnit,
    type QueueMembershipLocationScopeSource,
    type QueueMembershipPlacementScope,
    type QueueMembershipSubjectType,
    type QueueMembershipV1,
} from "@/lib/lifecycle/queueMembershipV1";
import { OPPORTUNITY_CASE_STATUS_KEYS } from "@/lib/admin/statusReseed/statusMvpCatalog";

export type QueueMembershipEditorDraft = {
    subject_type: QueueMembershipSubjectType;
    count_unit: QueueMembershipCountUnit;
    included_keys: string[];
    location_scope_source: QueueMembershipLocationScopeSource | null;
    placement_scope: QueueMembershipPlacementScope | null;
};

export function queueMembershipEditorDraftFromSaved(
    saved: QueueMembershipV1 | null | undefined,
    stageKey: string,
): QueueMembershipEditorDraft {
    const fallback = defaultEnrollmentQueueMembershipForStage(stageKey);
    const membership = saved ?? fallback;
    if (!membership) {
        return {
            subject_type: "case",
            count_unit: "cases",
            included_keys: [],
            location_scope_source: null,
            placement_scope: null,
        };
    }

    const statusKeys = membership.included_status_keys ?? [];
    const dispositionKeys = membership.included_disposition_keys ?? [];
    const included_keys = [...new Set([...statusKeys, ...dispositionKeys])];

    return {
        subject_type: membership.subject_type,
        count_unit: membership.count_unit,
        included_keys,
        location_scope_source: membership.location_scope_source ?? null,
        placement_scope: membership.placement_scope ?? null,
    };
}

export function queueMembershipDraftToPersisted(
    draft: QueueMembershipEditorDraft,
    stageKey: string,
    lifecycleKey: string = ENROLLMENT_PROCESS_KEY,
): QueueMembershipV1 | null {
    const sk = stageKey.trim();
    if (!sk) return null;

    const included_keys = draft.included_keys.map((k) => k.trim()).filter(Boolean);
    const membership: QueueMembershipV1 = {
        version: 1,
        lifecycle_key: lifecycleKey,
        stage_key: sk,
        subject_type: draft.subject_type,
        count_unit: draft.count_unit,
        included_disposition_keys: [],
    };

    if (draft.subject_type === "case") {
        const statusKeys = included_keys.filter((k) => OPPORTUNITY_CASE_STATUS_KEYS.has(k));
        const dispositionKeys = included_keys.filter((k) => !OPPORTUNITY_CASE_STATUS_KEYS.has(k));
        membership.included_disposition_keys = dispositionKeys;
        if (statusKeys.length) membership.included_status_keys = statusKeys;
    } else {
        membership.included_disposition_keys = included_keys;
    }

    if (draft.location_scope_source) {
        membership.location_scope_source = draft.location_scope_source;
    } else {
        membership.location_scope_source = null;
    }

    if (draft.subject_type === "candidate" && draft.placement_scope) {
        membership.placement_scope = draft.placement_scope;
    }

    return parseQueueMembershipV1(membership);
}

export function queueMembershipDraftDirty(
    saved: QueueMembershipV1 | null | undefined,
    draft: QueueMembershipEditorDraft,
    stageKey: string,
): boolean {
    const persisted = queueMembershipDraftToPersisted(draft, stageKey);
    const savedNorm = saved ? parseQueueMembershipV1(saved) : null;
    if (!persisted && !savedNorm) return false;
    return JSON.stringify(persisted) !== JSON.stringify(savedNorm);
}

export function applySubjectTypeChange(
    draft: QueueMembershipEditorDraft,
    nextSubject: QueueMembershipSubjectType,
): QueueMembershipEditorDraft {
    return {
        subject_type: nextSubject,
        count_unit: defaultCountUnitForSubject(nextSubject),
        included_keys: [],
        location_scope_source: nextSubject === "case" ? null : draft.location_scope_source,
        placement_scope: nextSubject === "candidate" ? null : null,
    };
}

/** Keep queue_membership included keys aligned with stage status rollups on save. */
export function queueMembershipWithSyncedStatusKeys(
    membership: QueueMembershipV1 | null | undefined,
    stageKey: string,
    selectedStatusKeys: readonly string[],
): QueueMembershipV1 | null {
    const draft = queueMembershipEditorDraftFromSaved(membership, stageKey);
    const synced: QueueMembershipEditorDraft = {
        ...draft,
        included_keys: [...new Set(selectedStatusKeys.map((k) => k.trim()).filter(Boolean))],
    };
    return queueMembershipDraftToPersisted(synced, stageKey);
}
