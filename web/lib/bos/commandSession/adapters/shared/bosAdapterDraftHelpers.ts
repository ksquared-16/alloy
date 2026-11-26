/**
 * Shared draft helpers for thin BOS preparation adapters.
 * Preparation only — execution always goes through executePlatformCommandViaActionsApi.
 */

import {
    bosDraftToEligiblePayload,
    bosDraftValueMap,
    upsertBosDraftValue,
} from "@/lib/bos/commandSession/draftValues";
import { fingerprintBosCommandDraft } from "@/lib/bos/commandSession/fingerprint";
import type {
    BosCommandDraft,
    BosCommandExecutionResult,
    BosCommandPreview,
    BosCommandResolutionState,
    BosInputValueState,
} from "@/lib/bos/commandSession/types";
import type { ActionResult } from "@/lib/adminV2/actions/actionTypes";

export type BosSubjectContext = {
    entityType: string;
    entityId: string;
    label?: string | null;
};

export function draftFieldString(draft: BosCommandDraft, fieldKey: string): string {
    const entry = bosDraftValueMap(draft)[fieldKey];
    if (!entry || entry.value == null) return "";
    return String(entry.value).trim();
}

export function upsertSystemDraftField(
    draft: BosCommandDraft,
    fieldKey: string,
    value: string,
    state: BosInputValueState = "confirmed"
): BosCommandDraft {
    const trimmed = value.trim();
    if (!trimmed) return draft;
    return upsertBosDraftValue(draft, {
        fieldKey,
        value: trimmed,
        state,
        evidence: [
            {
                kind: "system_default",
                note: "Resolved from active workspace subject",
                at: new Date().toISOString(),
            },
        ],
        optionResolved: true,
    });
}

export function seedSubjectOntoDraft(
    draft: BosCommandDraft,
    subject: BosSubjectContext | null
): BosCommandDraft {
    if (!subject?.entityId?.trim() || !subject.entityType?.trim()) return draft;
    let next = upsertSystemDraftField(draft, "entity_id", subject.entityId);
    next = upsertSystemDraftField(next, "entity_type", subject.entityType);
    if (subject.label?.trim()) {
        next = upsertSystemDraftField(next, "entity_label", subject.label.trim());
    }
    return next;
}

export function resolveSubjectFromDraft(draft: BosCommandDraft): BosSubjectContext | null {
    const entityId = draftFieldString(draft, "entity_id");
    const entityType = draftFieldString(draft, "entity_type") || "opportunity";
    if (!entityId) return null;
    return {
        entityType,
        entityId,
        label: draftFieldString(draft, "entity_label") || null,
    };
}

export function emptyResolution(
    overrides: Partial<BosCommandResolutionState> = {}
): BosCommandResolutionState {
    return {
        missingRequired: [],
        missingOptional: [],
        invalid: [],
        ambiguous: [],
        blockers: [],
        readyForPreview: false,
        readyToExecute: false,
        ...overrides,
    };
}

export function buildSimplePreview(input: {
    title: string;
    draft: BosCommandDraft;
    summaryLines: string[];
    warnings?: string[];
    sideEffects?: string[];
    previewToken?: string;
}): BosCommandPreview {
    return {
        title: input.title,
        summaryLines: input.summaryLines,
        householdSummary: null,
        warnings: input.warnings ?? [],
        sideEffects: input.sideEffects ?? [],
        destination: {},
        generatedAt: new Date().toISOString(),
        draftFingerprint: fingerprintBosCommandDraft(input.draft),
        previewToken: input.previewToken,
    };
}

export function mapActionResultToBosExecution(
    result: ActionResult,
    executionKind: Extract<
        BosCommandExecutionResult,
        { ok: true }
    >["executionKind"] = "direct_runtime_execute"
): BosCommandExecutionResult {
    if (!result.ok) {
        return {
            ok: false,
            errorMessage: result.error || "Command failed.",
            retryable: result.status === 0 || result.status >= 500,
            recoveryHints: ["Review the inputs and try again."],
        };
    }
    const detail = (result.result.detail ?? {}) as Record<string, unknown>;
    const opportunityId =
        (typeof detail.opportunity_id === "string" && detail.opportunity_id.trim()) ||
        result.result.affectedId ||
        undefined;
    return {
        ok: true,
        executionKind,
        opportunityId: opportunityId || undefined,
        success: {
            actionKey: result.result.actionKey,
            entityType: result.result.entityType,
            entityId: result.result.entityId,
            affectedId: result.result.affectedId,
            detail,
        },
    };
}

export function eligiblePayloadWithSubject(draft: BosCommandDraft): Record<string, unknown> {
    const payload = bosDraftToEligiblePayload(draft);
    // Internal subject seed fields stay in draft for resolution; strip UI-only labels.
    delete payload.entity_label;
    return payload;
}

/** Normalize GlobalAssistant entity_type ("opportunities") → runtime subject type. */
export function normalizeBosEntityType(raw: string | null | undefined): string {
    const t = String(raw ?? "").trim().toLowerCase();
    if (!t) return "";
    if (t === "opportunities" || t === "opportunity") return "opportunity";
    if (t === "persons" || t === "person") return "person";
    if (t === "children" || t === "child") return "child";
    if (t === "tour_bookings" || t === "tour_booking") return "tour_booking";
    return t;
}
