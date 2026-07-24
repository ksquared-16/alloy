"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import {
    OPERATIONAL_INTENT_CATALOG,
    buildOperationalIntentFormMetadataPatch,
    buildOperationalIntentLinkMetadataPatch,
    inferOperationalIntentFromContext,
    readStoredOperationalIntent,
    resolveEffectiveOperationalIntent,
    type OperationalIntentKey,
} from "@/lib/forms/operationalIntentTemplates";
import { humanizeOperatorSlug } from "@/lib/forms/operatorDisplayLabels";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { opMetadata, opMutedMeta, opSectionTitle } from "@/lib/operational/ui/operationalVisualTokens";

/** Concise, business-language one-liner describing what each purpose does. */
const INTENT_SUMMARY: Record<OperationalIntentKey, string> = {
    enrollment_lead: "Creates or updates a lead through Processing.",
    existing_family: "Attaches submissions to an existing family or record.",
    operational_document: "Collects an operational document for review.",
    waitlist: "Captures waitlist interest.",
    packet_step: "Runs as one step in an intake packet.",
    custom: "Uses your advanced intake settings.",
};

type Props = {
    formId: string;
    formKey: string;
    formMetadata: Record<string, unknown> | null | undefined;
    selectedLinkId: string | null;
    selectedLinkMetadata: Record<string, unknown> | null | undefined;
    canMutate?: boolean;
    hasOperationalLink: boolean;
    onFormMetadataUpdated: (metadata: Record<string, unknown>) => void;
    onLinkMetadataSaved?: (linkId: string, metadata: Record<string, unknown>) => void;
    onCreateLink?: () => void;
    creatingLink?: boolean;
    shareCreationBlocked?: boolean;
    shareBlockButtonLabel?: string;
};

/** “What is this form used for?” — operational intent templates (Forms MVP Card 1). */
export function FormOperationalIntentPicker({
    formId,
    formKey,
    formMetadata,
    selectedLinkId,
    selectedLinkMetadata,
    canMutate = false,
    hasOperationalLink,
    onFormMetadataUpdated,
    onLinkMetadataSaved,
    onCreateLink,
    creatingLink = false,
    shareCreationBlocked = false,
    shareBlockButtonLabel = "Add required fields first",
}: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const effectiveIntent = useMemo(
        () =>
            resolveEffectiveOperationalIntent({
                formMetadata,
                linkMetadata: selectedLinkMetadata,
                formKey,
            }),
        [formMetadata, selectedLinkMetadata, formKey]
    );

    const storedIntent = useMemo(() => readStoredOperationalIntent(formMetadata), [formMetadata]);

    const primaryTemplates = OPERATIONAL_INTENT_CATALOG.filter((t) => !t.advanced);
    const advancedTemplates = OPERATIONAL_INTENT_CATALOG.filter((t) => t.advanced);

    const applyIntent = useCallback(
        async (intent: OperationalIntentKey) => {
            if (!canMutate) return;
            setBusy(true);
            setError(null);
            try {
                const nextFormMetadata = buildOperationalIntentFormMetadataPatch(intent, formMetadata);
                const formRes = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ metadata: nextFormMetadata }),
                });
                const formJson = await formRes.json().catch(() => ({}));
                if (!formRes.ok) {
                    throw new Error((formJson as { error?: string }).error ?? "Could not save form intent");
                }
                const savedFormMeta =
                    (formJson as { data?: { metadata?: Record<string, unknown> } }).data?.metadata ?? nextFormMetadata;
                onFormMetadataUpdated(savedFormMeta);

                if (intent !== "custom" && selectedLinkId) {
                    const existingLinkMeta =
                        selectedLinkMetadata && typeof selectedLinkMetadata === "object" ?
                            { ...selectedLinkMetadata }
                        :   {};
                    const linkPatch = buildOperationalIntentLinkMetadataPatch(intent);
                    const mergedLinkMeta = { ...existingLinkMeta, ...linkPatch };
                    const linkRes = await fetch(
                        `/api/admin/forms/${encodeURIComponent(formId)}/public-links/${encodeURIComponent(selectedLinkId)}`,
                        {
                            method: "PATCH",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ metadata: mergedLinkMeta }),
                        }
                    );
                    const linkJson = await linkRes.json().catch(() => ({}));
                    if (!linkRes.ok) {
                        throw new Error((linkJson as { error?: string }).error ?? "Could not apply intent to share link");
                    }
                    const savedLinkMeta =
                        (linkJson as { data?: { metadata?: Record<string, unknown> } }).data?.metadata ?? mergedLinkMeta;
                    onLinkMetadataSaved?.(selectedLinkId, savedLinkMeta);
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Could not apply intent");
            } finally {
                setBusy(false);
            }
        },
        [
            canMutate,
            formId,
            formMetadata,
            onFormMetadataUpdated,
            onLinkMetadataSaved,
            selectedLinkId,
            selectedLinkMetadata,
        ]
    );

    const inferredLabel =
        effectiveIntent && !storedIntent ?
            inferOperationalIntentFromContext({ formMetadata, linkMetadata: selectedLinkMetadata, formKey })
        :   null;

    return (
        <div className="rounded-lg bg-white/95 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.07]" data-testid="form-operational-intent-picker">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className={opSectionTitle}>Form purpose</h3>
                    <p className={opMutedMeta}>Choose the operational purpose — Alloy configures intake behavior underneath.</p>
                </div>
                {effectiveIntent ?
                    <span
                        className="rounded-full bg-alloy-bend-pine/[0.10] px-2.5 py-0.5 text-xs font-semibold text-alloy-bend-pine"
                        data-testid="form-operational-intent-active-label"
                    >
                        {OPERATIONAL_INTENT_CATALOG.find((t) => t.key === effectiveIntent)?.label ??
                            humanizeOperatorSlug(effectiveIntent ?? "")}
                    </span>
                :   null}
            </div>

            {effectiveIntent ?
                <p className={clsx("mt-2 text-sm text-alloy-midnight/70", opMetadata)} data-testid="form-operational-intent-summary">
                    {INTENT_SUMMARY[effectiveIntent]}
                </p>
            :   null}

            {inferredLabel ?
                <p className={clsx("mt-2", opMetadata)} data-testid="form-operational-intent-inferred-note">
                    Detected from current settings — select an intent to make it explicit.
                </p>
            :   null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="form-operational-intent-options">
                {primaryTemplates.map((template) => {
                    const selected = effectiveIntent === template.key;
                    return (
                        <button
                            key={template.key}
                            type="button"
                            disabled={!canMutate || busy}
                            className={clsx(
                                "rounded-lg px-3 py-2.5 text-left ring-1 transition",
                                selected ?
                                    "bg-alloy-bend-pine/[0.10] ring-alloy-bend-pine/30"
                                :   "bg-white ring-alloy-midnight/[0.08] hover:bg-alloy-stone/10",
                                (!canMutate || busy) && "opacity-60"
                            )}
                            data-testid={`form-operational-intent-option-${template.key}`}
                            onClick={() => void applyIntent(template.key)}
                        >
                            <p className="text-sm font-semibold text-alloy-midnight">{template.label}</p>
                            <p className={clsx("mt-0.5", opMutedMeta)}>{template.description}</p>
                        </button>
                    );
                })}
            </div>

            {advancedTemplates.length > 0 ?
                <div className="mt-3 border-t border-alloy-midnight/[0.06] pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Advanced</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {advancedTemplates.map((template) => {
                            const selected = effectiveIntent === template.key;
                            return (
                                <button
                                    key={template.key}
                                    type="button"
                                    disabled={!canMutate || busy}
                                    className={clsx(
                                        "rounded-lg px-3 py-2 text-left ring-1 transition",
                                        selected ?
                                            "bg-alloy-stone/20 ring-alloy-midnight/15"
                                        :   "bg-white/80 ring-alloy-midnight/[0.06] hover:bg-alloy-stone/10",
                                        (!canMutate || busy) && "opacity-60"
                                    )}
                                    data-testid={`form-operational-intent-option-${template.key}`}
                                    onClick={() => void applyIntent(template.key)}
                                >
                                    <p className="text-xs font-semibold text-alloy-midnight/80">{template.label}</p>
                                    <p className={clsx("mt-0.5 text-xs", opMutedMeta)}>{template.description}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            :   null}

            {error ?
                <p className="mt-2 text-sm text-alloy-ember" data-testid="form-operational-intent-error">
                    {error}
                </p>
            :   null}
            {busy ?
                <p className={clsx("mt-2", opMetadata)}>Applying intent…</p>
            :   null}
        </div>
    );
}
