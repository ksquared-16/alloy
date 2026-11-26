import {
    applyCreateLeadParseToDraft,
    buildCreateLeadBosPreview,
    revalidateCreateLeadDraft,
    type CreateLeadAdapterContext,
} from "@/lib/bos/commandSession/adapters/createLeadAdapter";
import {
    buildEffectiveCreateLeadIntakeSpec,
    labelForEffectiveField,
} from "@/lib/bos/commandSession/conversationIntake/buildEffectiveCreateLeadIntakeSpec";
import type {
    ConversationClarification,
    ConversationIntakeAdapter,
    ConversationUnderstandingSummary,
    EffectiveCreateLeadIntakeSpec,
} from "@/lib/bos/commandSession/conversationIntake/types";
import type { BosCommandDraft } from "@/lib/bos/commandSession/types";
import { bosDraftToEligiblePayload } from "@/lib/bos/commandSession/draftValues";

function toCreateLeadCtx(
    effective: EffectiveCreateLeadIntakeSpec,
    workspace: { departmentId?: string | null; workUnitId?: string | null; surface?: string }
): CreateLeadAdapterContext {
    return {
        departmentId: workspace.departmentId,
        workUnitId: workspace.workUnitId,
        surface: workspace.surface,
        spec: effective.actionIntakeSpec,
        fieldOptions: effective.fieldOptions,
        configRequiredInputs: effective.configRequiredInputs,
    };
}

function resolveFieldOptionLabel(
    fieldKey: string,
    raw: string,
    fieldOptions: EffectiveCreateLeadIntakeSpec["fieldOptions"] | undefined
): string {
    const options = fieldOptions?.[fieldKey];
    if (!options?.length) return raw;
    const hit = options.find((o) => String(o.value) === raw);
    const label = hit?.label?.trim();
    return label || raw;
}

function buildUnderstandingSummary(input: {
    draft: BosCommandDraft;
    effectiveSpec: EffectiveCreateLeadIntakeSpec;
}): ConversationUnderstandingSummary {
    const evidenceNotes: ConversationUnderstandingSummary["evidenceNotes"] = [];
    const lines: string[] = [];
    for (const value of input.draft.values) {
        if (
            value.state !== "parsed_from_source" &&
            value.state !== "inferred" &&
            value.state !== "confirmed" &&
            value.state !== "operator_entered"
        ) {
            continue;
        }
        const label = labelForEffectiveField(input.effectiveSpec, value.fieldKey);
        const note =
            value.evidence.find((e) => e.note)?.note ??
            (value.state === "inferred" ? "Suggested" : "From your note");
        const raw = String(value.value ?? "").trim();
        if (!raw) continue;
        const display = resolveFieldOptionLabel(
            value.fieldKey,
            raw,
            input.effectiveSpec.fieldOptions
        );
        evidenceNotes.push({
            fieldKey: value.fieldKey,
            label,
            note,
            value: display,
        });
        const tag = value.state === "inferred" ? " (suggested)" : "";
        lines.push(`${label}${tag}: ${display}`);
    }
    return {
        lines,
        evidenceNotes,
        unmappedPreserved: Boolean(input.draft.unmappedText?.trim()),
    };
}

function nextClarification(input: {
    draft: BosCommandDraft;
    effectiveSpec: EffectiveCreateLeadIntakeSpec;
    workspace: { departmentId?: string | null; workUnitId?: string | null; surface?: string };
}): ConversationClarification | null {
    const resolution = revalidateCreateLeadDraft(
        input.draft,
        toCreateLeadCtx(input.effectiveSpec, input.workspace)
    );
    if (resolution.readyForPreview || resolution.readyToExecute) {
        const unsupportedMissing = input.effectiveSpec.unsupportedForConversation.filter((u) =>
            input.effectiveSpec.requiredPayloadKeys.includes(u.payloadKey)
        );
        const filled = new Set(
            input.draft.values
                .filter((v) => v.value != null && String(v.value).trim() !== "")
                .map((v) => v.fieldKey)
        );
        const stillNeedForm = unsupportedMissing.filter((u) => !filled.has(u.payloadKey));
        if (stillNeedForm.length === 0) return null;
        return {
            prompt: stillNeedForm.map((u) => u.reason).join(" "),
            missingRequiredKeys: stillNeedForm.map((u) => u.payloadKey),
            formGuidance: "Switch to Form to finish these fields.",
        };
    }
    const messages = resolution.blockers.map((b) => b.message).filter(Boolean);
    const missingKeys = resolution.missingRequired
        .map((k) => String(k))
        .filter(Boolean);
    // One cluster: contact identity first, then others.
    const contactKeys = missingKeys.filter((k) =>
        ["first_name", "last_name", "email", "phone"].includes(k)
    );
    const clusterKeys = contactKeys.length > 0 ? contactKeys : missingKeys.slice(0, 3);
    const clusterLabels = clusterKeys.map((k) =>
        labelForEffectiveField(input.effectiveSpec, k)
    );
    const prompt =
        clusterLabels.length > 0
            ? `I still need: ${clusterLabels.join(", ")}.`
            : messages[0] || "A few required details are still missing.";

    const unsupportedHit = input.effectiveSpec.unsupportedForConversation.filter((u) =>
        missingKeys.includes(u.payloadKey)
    );
    return {
        prompt:
            unsupportedHit.length > 0
                ? `${prompt} ${unsupportedHit.map((u) => u.reason).join(" ")}`
                : prompt,
        missingRequiredKeys: clusterKeys.length ? clusterKeys : missingKeys,
        formGuidance:
            unsupportedHit.length > 0 ? "Switch to Form to finish these fields." : null,
    };
}

/**
 * Bounded Create Lead implementation of ConversationIntakeAdapter.
 * Processing Conversation Runtime may replace this later.
 */
export const createLeadConversationIntakeAdapter: ConversationIntakeAdapter = {
    actionKey: "create_lead",

    loadEffectiveSpec(input) {
        return buildEffectiveCreateLeadIntakeSpec({
            actionIntakeSpec: input.actionIntakeSpec,
            departmentId: input.departmentId,
            fieldOptions: input.fieldOptions,
        });
    },

    parseOperatorTurn(input) {
        return applyCreateLeadParseToDraft(
            input.draft,
            input.text,
            toCreateLeadCtx(input.effectiveSpec, {}),
            input.now
        );
    },

    buildUnderstandingSummary,

    nextClarification,

    syncDraftResolution(input) {
        return revalidateCreateLeadDraft(
            input.draft,
            toCreateLeadCtx(input.effectiveSpec, input.workspace)
        );
    },

    buildReview(input) {
        return buildCreateLeadBosPreview(
            input.draft,
            toCreateLeadCtx(input.effectiveSpec, input.workspace)
        );
    },
};

/** Helper for controllers that already hold an eligible draft payload. */
export function eligiblePayloadFromConversationDraft(draft: BosCommandDraft) {
    return bosDraftToEligiblePayload(draft);
}
