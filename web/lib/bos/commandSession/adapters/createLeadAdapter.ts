import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { ActionRequiredInput } from "@/lib/adminV2/actions/actionTypes";
import type { IntakeSelectOption } from "@/lib/intake/types";
import {
    deriveCreateLeadCommandFromBosProposal,
} from "@/lib/platform/commands/createLead/createLeadCommandModel";
import { executeCreateLeadCommand } from "@/lib/platform/commands/createLead/executeCreateLeadCommand";
import {
    buildCreateLeadSuccess,
    createLeadProcessingCaseId,
    isCreateLeadProcessingReview,
} from "@/lib/platform/commands/createLead/createLeadSuccess";
import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";
import { nextBosSourceTextId } from "@/lib/bos/commandSession/createSession";
import { fingerprintBosCommandDraft } from "@/lib/bos/commandSession/fingerprint";
import { bosDraftToEligiblePayload, upsertBosDraftValue } from "@/lib/bos/commandSession/draftValues";
import type {
    BosCommandAdapter,
    BosCommandDraft,
    BosCommandExecutionResult,
    BosCommandPreview,
    BosCommandResolutionState,
    BosInputValueState,
} from "@/lib/bos/commandSession/types";

export type CreateLeadAdapterContext = {
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string;
    spec: ActionIntakeSpec;
    fieldOptions?: Partial<Record<string, readonly IntakeSelectOption[]>>;
    configRequiredInputs?: readonly ActionRequiredInput[];
};

function confidenceToState(
    confidence: string
): Extract<BosInputValueState, "parsed_from_source" | "inferred" | "invalid"> {
    if (confidence === "high") return "parsed_from_source";
    if (confidence === "invalid") return "invalid";
    return "inferred";
}

/**
 * Apply paste/NL extraction onto a draft. High-confidence → parsed_from_source;
 * medium/low → inferred (does not satisfy required until confirmed).
 */
export function applyCreateLeadParseToDraft(
    draft: BosCommandDraft,
    text: string,
    ctx: CreateLeadAdapterContext,
    now = new Date().toISOString()
): BosCommandDraft {
    const extraction = parseCreateLeadIntakeText({
        text,
        spec: ctx.spec,
        field_options: ctx.fieldOptions,
    });
    const sourceId = nextBosSourceTextId();
    let next: BosCommandDraft = {
        ...draft,
        sourceTexts: [
            ...draft.sourceTexts,
            { id: sourceId, text: text.trim(), capturedAt: now },
        ],
        unmappedText: extraction.unmapped_text?.trim()
            ? extraction.unmapped_text
            : draft.unmappedText,
        household: extraction.household ?? draft.household,
    };

    for (const field of extraction.fields) {
        const state = confidenceToState(field.confidence);
        // High confidence overwrites empty or prior parsed/inferred; never clobber operator edits.
        const existing = next.values.find((v) => v.fieldKey === field.payload_key);
        if (
            existing &&
            (existing.state === "operator_entered" || existing.state === "confirmed")
        ) {
            continue;
        }
        next = upsertBosDraftValue(next, {
            fieldKey: field.payload_key,
            value: field.value,
            state,
            optionResolved: false,
            evidence: [
                {
                    kind: "source_span",
                    sourceTextId: sourceId,
                    excerpt: String(field.value).slice(0, 80),
                    note:
                        state === "parsed_from_source"
                            ? "From your note"
                            : state === "invalid"
                              ? "Needs a valid value"
                              : "Suggested",
                    at: now,
                },
            ],
        });
    }

    return next;
}

function resolutionFromSnapshot(
    missingInputs: Array<{ field?: string; message: string; code: string }>,
    readyForPreview: boolean,
    readyToExecute: boolean
): BosCommandResolutionState {
    const missingRequired = missingInputs
        .filter((b) => b.code === "missing_required_input")
        .map((b) => b.field ?? b.message);
    return {
        missingRequired,
        missingOptional: [],
        invalid: [],
        ambiguous: [],
        blockers: missingInputs.map((b) => ({ code: b.code, message: b.message })),
        readyForPreview,
        readyToExecute,
    };
}

export function revalidateCreateLeadDraft(
    draft: BosCommandDraft,
    ctx: CreateLeadAdapterContext
): BosCommandResolutionState {
    const payload = bosDraftToEligiblePayload(draft);
    const snapshot = deriveCreateLeadCommandFromBosProposal({
        parsedValues: payload,
        departmentId: ctx.departmentId,
        workUnitId: ctx.workUnitId,
        configRequiredInputs: ctx.configRequiredInputs,
    });
    return resolutionFromSnapshot(
        snapshot.missingInputs,
        snapshot.readyForPreview,
        snapshot.readyToExecute
    );
}

export function buildCreateLeadBosPreview(
    draft: BosCommandDraft,
    ctx: CreateLeadAdapterContext
): BosCommandPreview {
    const payload = bosDraftToEligiblePayload(draft);
    const snapshot = deriveCreateLeadCommandFromBosProposal({
        parsedValues: payload,
        departmentId: ctx.departmentId,
        workUnitId: ctx.workUnitId,
        configRequiredInputs: ctx.configRequiredInputs,
    });
    const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim();
    const summaryLines: string[] = [...(snapshot.preview.changes ?? [])];
    if (name && !summaryLines.some((line) => line.includes(name))) {
        summaryLines.unshift(`Primary contact: ${name}`);
    }
    if (payload.email) summaryLines.push(`Email: ${String(payload.email)}`);
    if (payload.phone) summaryLines.push(`Phone: ${String(payload.phone)}`);
    if (payload.child_first_name || payload.child_last_name) {
        summaryLines.push(
            `Child: ${[payload.child_first_name, payload.child_last_name].filter(Boolean).join(" ")}`
        );
    }
    const warnings = snapshot.missingInputs.map((b) => b.message);
    for (const entry of draft.values) {
        if (entry.state === "inferred") {
            warnings.push("A suggested value still needs your confirmation.");
        }
        if (entry.state === "invalid") {
            warnings.push("One of the values looks invalid — please correct it.");
        }
    }

    return {
        title: snapshot.preview.summary || "Create Lead",
        summaryLines,
        householdSummary: draft.household ? "Household details included" : null,
        warnings,
        sideEffects: [
            "Continues to Processing review — records are created only after you approve and commit.",
        ],
        destination: {
            stageLabel: "Lead",
        },
        generatedAt: new Date().toISOString(),
        draftFingerprint: fingerprintBosCommandDraft(draft),
    };
}

export async function executeCreateLeadFromBosDraft(
    draft: BosCommandDraft,
    ctx: CreateLeadAdapterContext
): Promise<BosCommandExecutionResult> {
    const payload = bosDraftToEligiblePayload(draft);
    const result = await executeCreateLeadCommand({
        payload,
        departmentId: ctx.departmentId,
        workUnitId: ctx.workUnitId,
        surface: ctx.surface ?? "bos_recommendations",
    });
    if (!result.ok) {
        return {
            ok: false,
            errorMessage: result.error || "Create Lead could not continue.",
            retryable: true,
            recoveryHints: ["Your details are still here. Try again when ready."],
        };
    }
    const ok = result as ActionResultOk;
    const processingCaseId = createLeadProcessingCaseId(ok);
    if (isCreateLeadProcessingReview(ok) && processingCaseId) {
        return {
            ok: true,
            executionKind: "processing_intake",
            processingCaseId,
            success: null,
        };
    }
    const success = buildCreateLeadSuccess({ result: ok, knownInputs: payload });
    return {
        ok: true,
        executionKind: "processing_intake",
        opportunityId: success.createdRecordId,
        success,
    };
}

export const createLeadBosCommandAdapter: BosCommandAdapter = {
    actionKey: "create_lead",
    executionKind: "processing_intake",

    parseSourceText(text, draft, ctx) {
        return applyCreateLeadParseToDraft(draft, text, ctx as CreateLeadAdapterContext);
    },

    revalidate(draft, ctx) {
        return revalidateCreateLeadDraft(draft, ctx as CreateLeadAdapterContext);
    },

    buildPreview(draft, ctx) {
        return buildCreateLeadBosPreview(draft, ctx as CreateLeadAdapterContext);
    },

    toExecutePayload(draft, _ctx) {
        return bosDraftToEligiblePayload(draft);
    },

    execute(payload, ctx) {
        const adapterCtx = ctx as CreateLeadAdapterContext;
        // Reconstruct a minimal draft-shaped call path: payload already eligible.
        const draft: BosCommandDraft = {
            values: Object.entries(payload)
                .filter(([key]) => key !== "household_commit" && key !== "intake_notes")
                .map(([fieldKey, value]) => ({
                    fieldKey,
                    value,
                    state: "confirmed" as const,
                    evidence: [],
                    optionResolved: false,
                })),
            sourceTexts: [],
            household: payload.household_commit ?? null,
            unmappedText: null,
            schemaVersion: 1,
        };
        if (payload.intake_notes != null) {
            draft.values.push({
                fieldKey: "intake_notes",
                value: payload.intake_notes,
                state: "confirmed",
                evidence: [],
                optionResolved: false,
            });
        }
        return executeCreateLeadFromBosDraft(draft, adapterCtx);
    },

    mapSuccess(result, draft) {
        if (!result.ok) return null;
        if (result.success) return result.success;
        const opportunityId = result.opportunityId ?? "";
        return buildCreateLeadSuccess({
            result: {
                ok: true,
                correlationId: "",
                result: {
                    actionKey: "create_lead",
                    entityType: "opportunity",
                    entityId: opportunityId,
                    affectedId: opportunityId || null,
                    detail: { opportunity_id: opportunityId },
                },
            },
            knownInputs: bosDraftToEligiblePayload(draft),
        });
    },
};
