"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    TechnicalDetailDisclosure,
    TechnicalDetailJsonBlock,
} from "@/components/forms/review";
import {
    distributionIsPreviewLink,
    distributionLinkLabel,
    type DistributionLinkRow,
} from "@/lib/forms/distributionPresentation";
import type { OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";
import {
    mergeOutcomeConfigIntoLinkMetadata,
    parseOutcomeConfigEditForm,
    validateOutcomeConfigEditForm,
    type OutcomeConfigEditForm,
} from "@/lib/forms/outcomeConfigEditor";
import type { OutcomeConfigPickerOptions } from "@/lib/forms/resolveOutcomeConfigPickerOptions";
import {
    buildFormOutcomeConfigForLink,
    buildFormOutcomeConfigViewModel,
    type OutcomeStoryBullet,
} from "@/lib/forms/outcomeConfigPresentation";
import {
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opSectionSupport,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";

type Props = {
    formId: string;
    formMetadata: Record<string, unknown> | null | undefined;
    links: DistributionLinkRow[];
    formKey: string;
    documentGenerationConfigured: boolean;
    canMutate?: boolean;
    onLinkMetadataSaved?: (linkId: string, metadata: Record<string, unknown>) => void;
    /** Controlled runtime link — synced with orchestration panel (IC-5.7). */
    selectedLinkId?: string | null;
    onSelectedLinkChange?: (linkId: string) => void;
    /** Hide duplicate link selector when orchestration panel owns runtime selection. */
    hideLinkSelector?: boolean;
};

function operationalLinks(links: DistributionLinkRow[]): DistributionLinkRow[] {
    return links.filter((l) => !distributionIsPreviewLink(l));
}

function StoryBulletRow({ bullet }: { bullet: OutcomeStoryBullet }) {
    const icon =
        bullet.tone === "positive" ? "✓"
        : bullet.tone === "attention" ? "!"
        : "·";
    const toneClass =
        bullet.tone === "positive" ? "text-emerald-700"
        : bullet.tone === "attention" ? "text-amber-800"
        : "text-alloy-midnight/70";

    return (
        <li className="flex gap-2 py-1" data-testid="form-outcome-story-bullet">
            <span className={clsx("mt-0.5 shrink-0 text-xs font-semibold", toneClass)} aria-hidden>
                {icon}
            </span>
            <span className="text-xs leading-snug text-alloy-midnight">{bullet.text}</span>
        </li>
    );
}

function OutcomeItemRow({ label, value, status }: { label: string; value: string; status: string }) {
    return (
        <div
            className="rounded-lg bg-alloy-stone/10 px-3 py-2 ring-1 ring-alloy-midnight/[0.05]"
            data-testid="form-outcome-detail-card"
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="text-xs font-semibold text-alloy-midnight/80">{label}</span>
                {status === "varies" ?
                    <span className={clsx("text-[10px] font-semibold uppercase tracking-wide", "text-amber-700")}>
                        Varies
                    </span>
                :   null}
            </div>
            <p className={clsx("mt-0.5 text-xs leading-snug", value === "Not configured yet" ? opMutedMeta : opMetadata)}>
                {value}
            </p>
        </div>
    );
}

function SelectField({
    label,
    value,
    onChange,
    options,
    disabled,
    testId,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { id: string; label: string }[];
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <label className="block space-y-1">
            <span className="text-sm font-medium text-alloy-midnight">{label}</span>
            <select
                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm disabled:opacity-50"
                value={value}
                disabled={disabled}
                data-testid={testId}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">Not configured</option>
                {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function ToggleField({
    label,
    description,
    checked,
    onChange,
    disabled,
    testId,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5">
            <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                disabled={disabled}
                data-testid={testId}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="min-w-0">
                <span className="text-sm font-medium text-alloy-midnight">{label}</span>
                {description ?
                    <span className={clsx("mt-0.5 block", opMutedMeta)}>{description}</span>
                :   null}
            </span>
        </label>
    );
}

/** Operational outcome summary + distribution link editor (IC-1 / IC-1b / IC-1c). */
export function FormOutcomeConfigPanel({
    formId,
    formMetadata,
    links,
    formKey,
    documentGenerationConfigured,
    canMutate = false,
    onLinkMetadataSaved,
    selectedLinkId: controlledSelectedLinkId,
    onSelectedLinkChange,
    hideLinkSelector = false,
}: Props) {
    const [labelCatalog, setLabelCatalog] = useState<OutcomeRoutingLabelCatalog | null>(null);
    const [pickerOptions, setPickerOptions] = useState<OutcomeConfigPickerOptions | null>(null);
    const [labelsLoading, setLabelsLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [selectedLinkId, setSelectedLinkId] = useState<string>("");
    const [editForm, setEditForm] = useState<OutcomeConfigEditForm | null>(null);
    const [saveBusy, setSaveBusy] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);

    const editableLinks = useMemo(() => operationalLinks(links), [links]);

    const defaultSelectedLinkId = useMemo(() => {
        if (editableLinks.length === 0) return "";
        const preferred =
            [...editableLinks].sort((a, b) => b.created_at.localeCompare(a.created_at)).find((l) => l.is_active) ??
            editableLinks[0];
        return preferred?.id ?? "";
    }, [editableLinks]);

    const loadLabels = useCallback(async () => {
        if (!formId) {
            setLabelCatalog(null);
            setPickerOptions(null);
            setLabelsLoading(false);
            return;
        }
        setLabelsLoading(true);
        try {
            const qs = canMutate ? "?include_picker_options=1" : "";
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/outcome-labels${qs}`, {
                credentials: "include",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setLabelCatalog(null);
                setPickerOptions(null);
                return;
            }
            const data = json as {
                data?: OutcomeRoutingLabelCatalog & { pickerOptions?: OutcomeConfigPickerOptions | null };
            };
            const payload = data.data;
            if (!payload) {
                setLabelCatalog(null);
                setPickerOptions(null);
                return;
            }
            const { pickerOptions: pickers, ...catalog } = payload as OutcomeRoutingLabelCatalog & {
                pickerOptions?: OutcomeConfigPickerOptions | null;
            };
            setLabelCatalog(catalog);
            setPickerOptions(pickers ?? null);
        } catch {
            setLabelCatalog(null);
            setPickerOptions(null);
        } finally {
            setLabelsLoading(false);
        }
    }, [formId, canMutate]);

    useEffect(() => {
        void loadLabels();
    }, [loadLabels]);

    useEffect(() => {
        if (controlledSelectedLinkId != null) return;
        if (!selectedLinkId && defaultSelectedLinkId) {
            setSelectedLinkId(defaultSelectedLinkId);
        }
    }, [controlledSelectedLinkId, defaultSelectedLinkId, selectedLinkId]);

    const effectiveSelectedLinkId =
        controlledSelectedLinkId ?? (selectedLinkId || defaultSelectedLinkId);

    const setEffectiveSelectedLinkId = (linkId: string) => {
        if (onSelectedLinkChange) onSelectedLinkChange(linkId);
        else setSelectedLinkId(linkId);
    };

    const model = useMemo(
        () =>
            buildFormOutcomeConfigViewModel({
                formMetadata,
                links,
                formKey,
                documentGenerationConfigured,
                labelCatalog,
            }),
        [formMetadata, links, formKey, documentGenerationConfigured, labelCatalog]
    );

    const selectedLink = editableLinks.find((l) => l.id === effectiveSelectedLinkId) ?? null;

    const selectedLinkModel = useMemo(() => {
        if (!selectedLink) return null;
        return buildFormOutcomeConfigForLink({
            formMetadata,
            link: selectedLink,
            formKey,
            documentGenerationConfigured,
            labelCatalog,
            activeOperationalLinkCount: model.activeOperationalLinkCount,
            multipleActiveConfigs: model.multipleActiveConfigs,
        });
    }, [
        selectedLink,
        formMetadata,
        formKey,
        documentGenerationConfigured,
        labelCatalog,
        model.activeOperationalLinkCount,
        model.multipleActiveConfigs,
    ]);
    const formDefaults = metaObject(formMetadata?.intake_outcome ?? formMetadata);

    const validation = editForm ? validateOutcomeConfigEditForm(editForm) : { errors: [], warnings: [] };
    const intakeFieldsDisabled = !editForm?.leadCaptureEnabled;

    const beginEdit = () => {
        if (!selectedLink) return;
        setEditForm(parseOutcomeConfigEditForm(selectedLink.metadata, formDefaults));
        setSaveErr(null);
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
        setEditForm(null);
        setSaveErr(null);
    };

    const saveEdit = async () => {
        if (!selectedLink || !editForm) return;
        setSaveBusy(true);
        setSaveErr(null);
        try {
            const metadata = mergeOutcomeConfigIntoLinkMetadata(selectedLink.metadata, editForm);
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(formId)}/public-links/${encodeURIComponent(selectedLink.id)}`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ metadata }),
                }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((json as { error?: string }).error ?? "Could not save outcome settings");
            }
            const saved = (json as { data?: { metadata?: Record<string, unknown> } }).data?.metadata ?? metadata;
            onLinkMetadataSaved?.(selectedLink.id, saved);
            setEditing(false);
            setEditForm(null);
            await loadLabels();
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaveBusy(false);
        }
    };

    const updateForm = (patch: Partial<OutcomeConfigEditForm>) => {
        setEditForm((prev) => (prev ? { ...prev, ...patch } : prev));
    };

    return (
        <div
            className="rounded-xl bg-alloy-stone/[0.12] px-4 py-3 ring-1 ring-alloy-midnight/[0.06]"
            data-testid="form-operational-outcome-panel"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className={opSectionTitle}>What happens after submit</h2>
                    <p className={opSectionSupport}>Operational outcome for the public form selected above.</p>
                </div>
                {canMutate && editableLinks.length > 0 && !editing ?
                    <button
                        type="button"
                        className={intakeWorkspaceBtnSecondary}
                        data-testid="form-outcome-edit-button"
                        onClick={beginEdit}
                    >
                        Edit outcome
                    </button>
                :   null}
                {editing ?
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={intakeWorkspaceBtnSecondary}
                            data-testid="form-outcome-cancel-button"
                            disabled={saveBusy}
                            onClick={cancelEdit}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className={intakeWorkspaceBtnPrimary}
                            data-testid="form-outcome-save-button"
                            disabled={saveBusy || validation.errors.length > 0}
                            onClick={() => void saveEdit()}
                        >
                            {saveBusy ? "Saving…" : "Save outcome"}
                        </button>
                    </div>
                :   null}
            </div>

            {!hideLinkSelector && editableLinks.length > 0 ?
                <div className="mt-3">
                    <label className="block space-y-1">
                        <span className="text-sm font-medium text-alloy-midnight">Selected distribution link</span>
                        <span className={clsx("block", opMutedMeta)}>
                            These settings apply only to this link. Use separate links when different locations or
                            programs need different outcomes.
                        </span>
                        <select
                            className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-50"
                            value={effectiveSelectedLinkId}
                            disabled={editing && saveBusy}
                            data-testid="form-outcome-link-select"
                            onChange={(e) => {
                                setEffectiveSelectedLinkId(e.target.value);
                                if (editing) {
                                    const link = editableLinks.find((l) => l.id === e.target.value);
                                    if (link) setEditForm(parseOutcomeConfigEditForm(link.metadata, formDefaults));
                                }
                            }}
                        >
                            {editableLinks.map((link) => (
                                <option key={link.id} value={link.id}>
                                    {distributionLinkLabel(link, formKey)}
                                    {link.is_active ? "" : " (inactive)"}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            : hideLinkSelector ?
                    <p className={clsx("mt-2", opMutedMeta)}>
                        Outcome settings apply to the share link selected in setup above.
                    </p>
            :   <p className={clsx("mt-3", opMutedMeta)}>
                    Create a distribution link to configure intake outcome for families.
                </p>}

            {selectedLinkModel?.varianceCallout ?
                <div
                    className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2"
                    data-testid="form-outcome-variance-callout"
                >
                    <p className="text-xs font-semibold text-amber-900">{selectedLinkModel.varianceCallout.title}</p>
                    <p className={clsx("mt-0.5 text-xs leading-snug", opMetadata)}>{selectedLinkModel.varianceCallout.body}</p>
                </div>
            :   null}

            {!editing && selectedLinkModel && selectedLinkModel.whenSubmittedStory.length > 0 ?
                <div
                    className="mt-3 rounded-lg bg-white/90 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.06]"
                    data-testid="form-outcome-when-submitted-story"
                >
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/70">
                        When this form is submitted
                    </h3>
                    <ul className="mt-2 space-y-0.5">
                        {selectedLinkModel.whenSubmittedStory.map((bullet) => (
                            <StoryBulletRow key={bullet.text} bullet={bullet} />
                        ))}
                    </ul>
                </div>
            :   null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className={clsx(intakeWorkspaceBtnSecondary, "opacity-50 cursor-not-allowed")}
                    disabled
                    title="Coming soon"
                    data-testid="form-outcome-copy-settings-planned"
                >
                    Copy outcome settings — coming soon
                </button>
            </div>

            <p className={clsx("mt-2", opMetadata)} data-testid="form-outcome-resolution-note">
                {model.resolutionNote}
            </p>
            {labelsLoading ?
                <p className={clsx("mt-1", opMutedMeta)}>Loading routing labels…</p>
            :   null}
            {saveErr ?
                <p className="mt-2 text-sm text-alloy-ember" data-testid="form-outcome-save-error">
                    {saveErr}
                </p>
            :   null}

            {editing && editForm ?
                <div className="mt-4 space-y-4" data-testid="form-outcome-edit-mode">
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                            Intake behavior
                        </h3>
                        <div className="mt-2 space-y-1">
                            <ToggleField
                                label="Lead capture enabled"
                                description="Run CRM intake when families submit through this link."
                                checked={editForm.leadCaptureEnabled}
                                testId="form-outcome-lead-capture"
                                onChange={(v) => updateForm({ leadCaptureEnabled: v })}
                            />
                            <ToggleField
                                label="Create a new lead"
                                description="Create leads and attach to existing families when matched."
                                checked={editForm.autoCreateOpportunity}
                                disabled={intakeFieldsDisabled}
                                testId="form-outcome-create-lead"
                                onChange={(v) => updateForm({ autoCreateOpportunity: v })}
                            />
                            <ToggleField
                                label="Auto-operationalize clean intake"
                                description="High-confidence intake can skip review (requires exception-based review)."
                                checked={editForm.autoOperationalize}
                                disabled={intakeFieldsDisabled || editForm.reviewRequired}
                                testId="form-outcome-auto-operationalize"
                                onChange={(v) =>
                                    updateForm({
                                        autoOperationalize: v,
                                        reviewMode: v && !editForm.reviewMode ? "confidence" : editForm.reviewMode,
                                    })
                                }
                            />
                            <ToggleField
                                label="Always require operator review"
                                description="Overrides auto-operationalize — every submit needs review."
                                checked={editForm.reviewRequired}
                                disabled={intakeFieldsDisabled}
                                testId="form-outcome-review-required"
                                onChange={(v) =>
                                    updateForm({
                                        reviewRequired: v,
                                        autoOperationalize: v ? false : editForm.autoOperationalize,
                                    })
                                }
                            />
                        </div>
                        <label className="mt-3 block space-y-1">
                            <span className="text-sm font-medium text-alloy-midnight">Review mode</span>
                            <select
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-50"
                                value={editForm.reviewMode}
                                disabled={intakeFieldsDisabled || editForm.reviewRequired}
                                data-testid="form-outcome-review-mode"
                                onChange={(e) =>
                                    updateForm({
                                        reviewMode: e.target.value as OutcomeConfigEditForm["reviewMode"],
                                    })
                                }
                            >
                                <option value="">Legacy default (review new creates)</option>
                                <option value="always">Always review</option>
                                <option value="confidence">Review only exceptions</option>
                                <option value="never">Never review</option>
                            </select>
                        </label>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">Routing</h3>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            <SelectField
                                label="Location"
                                value={editForm.locationId}
                                options={pickerOptions?.locations ?? []}
                                disabled={intakeFieldsDisabled}
                                testId="form-outcome-location"
                                onChange={(v) => updateForm({ locationId: v })}
                            />
                            <SelectField
                                label="Work unit"
                                value={editForm.workUnitId}
                                options={pickerOptions?.workUnits ?? []}
                                disabled={intakeFieldsDisabled}
                                testId="form-outcome-work-unit"
                                onChange={(v) => updateForm({ workUnitId: v })}
                            />
                            <SelectField
                                label="Lead status"
                                value={editForm.statusKey}
                                options={pickerOptions?.opportunityStatusKeys ?? []}
                                disabled={intakeFieldsDisabled}
                                testId="form-outcome-status"
                                onChange={(v) => updateForm({ statusKey: v })}
                            />
                            <SelectField
                                label="Vertical"
                                value={editForm.verticalId}
                                options={pickerOptions?.verticals ?? []}
                                disabled={intakeFieldsDisabled}
                                testId="form-outcome-vertical"
                                onChange={(v) => updateForm({ verticalId: v })}
                            />
                            <SelectField
                                label="Department"
                                value={editForm.departmentId}
                                options={pickerOptions?.departments ?? []}
                                disabled={intakeFieldsDisabled}
                                testId="form-outcome-department"
                                onChange={(v) => updateForm({ departmentId: v })}
                            />
                            <label className="block space-y-1">
                                <span className="text-sm font-medium text-alloy-midnight">Source</span>
                                <select
                                    className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-50"
                                    value={editForm.source}
                                    disabled={intakeFieldsDisabled}
                                    data-testid="form-outcome-source"
                                    onChange={(e) =>
                                        updateForm({
                                            source: e.target.value as OutcomeConfigEditForm["source"],
                                        })
                                    }
                                >
                                    <option value="">Default</option>
                                    <option value="embed">Website embed</option>
                                    <option value="public_form">Public form link</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                            Automation
                        </h3>
                        <ul className={clsx(opGroupedSurface, "mt-2")}>
                            <li className={opGroupedRowInner}>
                                <p className="text-sm text-alloy-midnight/75">Trigger workflow — coming soon</p>
                            </li>
                            <li className={opGroupedRowInner}>
                                <p className="text-sm text-alloy-midnight/75">Create task — coming soon</p>
                            </li>
                            <li className={opGroupedRowInner}>
                                <p className="text-sm text-alloy-midnight/75">Send packet — coming soon</p>
                            </li>
                            <li className={opGroupedRowInner}>
                                <p className="text-sm text-alloy-midnight/75">
                                    Document generation —{" "}
                                    {documentGenerationConfigured ? "available after review" : "not configured on form"}
                                </p>
                            </li>
                        </ul>
                    </div>

                    {validation.warnings.length > 0 ?
                        <ul className={clsx("space-y-1", opMetadata)} data-testid="form-outcome-validation-warnings">
                            {validation.warnings.map((w) => (
                                <li key={w} className="text-amber-800">
                                    {w}
                                </li>
                            ))}
                        </ul>
                    :   null}
                </div>
            :   <div className="mt-3 space-y-3" data-testid="form-outcome-read-mode">
                    {(selectedLinkModel ?? model).sections.map((section) => (
                        <div key={section.id} data-testid={`form-outcome-section-${section.id}`}>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                {section.title}
                            </h3>
                            <div className="mt-1.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {section.items.map((row) => (
                                    <OutcomeItemRow
                                        key={`${section.id}-${row.label}`}
                                        label={row.label}
                                        value={row.value}
                                        status={row.status}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            }

            {model.linkSummaries.length > 0 ?
                <p className={clsx("mt-4", opMutedMeta)} data-testid="form-outcome-link-summary">
                    {model.activeOperationalLinkCount} active distribution link
                    {model.activeOperationalLinkCount === 1 ? "" : "s"}
                    {model.multipleActiveConfigs ?
                        " · outcome settings vary — check each link before sharing"
                    :   ""}
                </p>
            :   null}

            <div className="mt-3">
                <TechnicalDetailDisclosure title="Configuration source (debug)" helperText="Form defaults and link metadata">
                    <div className="mt-2 space-y-3">
                        <div>
                            <p className={opMutedMeta}>Form default metadata</p>
                            <TechnicalDetailJsonBlock
                                title="Form defaults"
                                value={
                                    Object.keys(model.debugLayers.formDefaults).length > 0 ?
                                        model.debugLayers.formDefaults
                                    :   { note: "No intake_outcome on form definition" }
                                }
                            />
                        </div>
                        {model.debugLayers.effectiveLink ?
                            <div>
                                <p className={opMutedMeta}>
                                    Representative link
                                    {model.representativeLink ? ` · ${model.representativeLink.label}` : ""}
                                </p>
                                <TechnicalDetailJsonBlock title="Link metadata" value={model.debugLayers.effectiveLink} />
                            </div>
                        :   null}
                        {labelCatalog ?
                            <div>
                                <p className={opMutedMeta}>Resolved routing labels</p>
                                <TechnicalDetailJsonBlock title="Label catalog" value={labelCatalog} />
                            </div>
                        :   null}
                    </div>
                </TechnicalDetailDisclosure>
            </div>
        </div>
    );
}

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}
