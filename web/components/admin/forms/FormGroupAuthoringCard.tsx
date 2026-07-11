"use client";

import clsx from "clsx";
import type { FormField } from "@/lib/forms/schema";
import {
    buildFormsAuthorableCollectionBindingSeeds,
    findFormsCollectionBindingProvider,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import {
    collectionBindingFromProvider,
    collectionRequiredContextForProvider,
    iterationContextFromCollectionBinding,
} from "@/lib/fields/formsCollectionRepeatBinding";
import {
    filterSystemFieldsForCollectionIteration,
    nestedFieldCompatibilityForIteration,
    partitionNestedFieldsForProviderSwitch,
} from "@/lib/forms/collection/formsCollectionNestedFieldEligibility";
import { COLLECTION_AUTHORING_COPY } from "@/lib/forms/formFieldAuthoringPresentation";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import type { SystemFieldRegistryEntry } from "@/lib/forms/systemFieldRegistry";
import { opActionLink, opContextLabel, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

const inputClass =
    "w-full rounded-md border border-alloy-midnight/10 bg-white px-2 py-1 text-sm text-alloy-midnight shadow-sm";
const selectClass =
    "rounded-md border border-alloy-midnight/10 bg-white px-1.5 py-1 text-xs text-alloy-midnight";

export type FormGroupAuthoringCardProps = {
    field: FormField & { type: "group" };
    systemFields: readonly SystemFieldRegistryEntry[];
    disabled?: boolean;
    highlighted?: boolean;
    onFieldChange: (next: FormField & { type: "group" }) => void;
    onRemove: () => void;
    onFocus?: () => void;
};

export function FormGroupAuthoringCard({
    field,
    systemFields,
    disabled = false,
    highlighted = false,
    onFieldChange,
    onRemove,
    onFocus,
}: FormGroupAuthoringCardProps) {
    const providers = buildFormsAuthorableCollectionBindingSeeds();
    const bindingRef = field.collection_binding?.collection_provider_ref ?? "";
    const provider = bindingRef ? findFormsCollectionBindingProvider(bindingRef) : undefined;
    const requiredContext = bindingRef ? collectionRequiredContextForProvider(bindingRef) : [];
    const iterationContext = field.collection_binding
        ? iterationContextFromCollectionBinding(field.collection_binding)
        : null;
    const eligibleFields =
        iterationContext != null
            ? filterSystemFieldsForCollectionIteration(systemFields, iterationContext)
            : systemFields;
    const usedNestedIds = new Set(field.fields.map((f) => f.id));

    const handleProviderChange = (nextRef: string) => {
        const nextProvider = findFormsCollectionBindingProvider(nextRef);
        if (!nextProvider) return;
        const nextBinding = collectionBindingFromProvider(nextProvider);
        const { keep, incompatible } = partitionNestedFieldsForProviderSwitch(field.fields, nextBinding);
        if (incompatible.length > 0) {
            const ok = window.confirm(
                `Switching collection will remove ${incompatible.length} incompatible nested field(s). Continue?`,
            );
            if (!ok) return;
        }
        onFieldChange({
            ...field,
            collection_binding: nextBinding,
            repeat: field.repeat ?? { min: 0, max: 10 },
            fields: keep,
        });
    };

    const addNestedField = (entryId: string) => {
        const entry = systemFields.find((e) => e.id === entryId);
        if (!entry) return;
        const nested = formFieldFromRegistryEntry(entry, {});
        if (usedNestedIds.has(nested.id)) return;
        onFieldChange({ ...field, fields: [...field.fields, nested] });
    };

    const removeNestedField = (nestedId: string) => {
        onFieldChange({ ...field, fields: field.fields.filter((f) => f.id !== nestedId) });
    };

    const moveNestedField = (index: number, dir: -1 | 1) => {
        const next = [...field.fields];
        const j = index + dir;
        if (j < 0 || j >= next.length) return;
        [next[index], next[j]] = [next[j]!, next[index]!];
        onFieldChange({ ...field, fields: next });
    };

    return (
        <li
            id={`form-group-row-${field.id}`}
            className={clsx(
                "rounded-md border border-alloy-midnight/10 px-3 py-2 transition-colors",
                highlighted ? "bg-alloy-blue/[0.06] ring-1 ring-alloy-blue/30" : "bg-white",
            )}
            data-testid={`form-group-authoring-card-${field.id}`}
            onClick={() => onFocus?.()}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                    <p className={opMetadata}>{COLLECTION_AUTHORING_COPY.repeatableSection}</p>
                    <p className={opMutedMeta}>{COLLECTION_AUTHORING_COPY.proposedEditHint}</p>
                    <label className="block space-y-0.5">
                        <span className={opContextLabel}>{COLLECTION_AUTHORING_COPY.sectionLabel}</span>
                        <input
                            className={inputClass}
                            disabled={disabled}
                            value={field.label}
                            onChange={(e) => onFieldChange({ ...field, label: e.target.value })}
                            data-testid={`form-group-label-${field.id}`}
                        />
                    </label>
                    <label className="block space-y-0.5">
                        <span className={opContextLabel}>{COLLECTION_AUTHORING_COPY.collectionProvider}</span>
                        <select
                            className={selectClass}
                            disabled={disabled}
                            value={bindingRef}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            data-testid={`form-group-collection-provider-${field.id}`}
                        >
                            <option value="" disabled>
                                Select collection…
                            </option>
                            {providers.map((p) => (
                                <option key={p.refKey} value={p.refKey}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {provider ?
                        <p className={opMutedMeta} data-testid={`form-group-item-entity-${field.id}`}>
                            {COLLECTION_AUTHORING_COPY.itemEntity}: {provider.settingsEntity ?? "—"}
                            {requiredContext.length ?
                                ` · ${COLLECTION_AUTHORING_COPY.requiredContext}: ${requiredContext.join(", ")}`
                            :   null}
                        </p>
                    :   null}
                    <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-1 text-xs">
                            <span className={opContextLabel}>{COLLECTION_AUTHORING_COPY.minRows}</span>
                            <input
                                type="number"
                                min={0}
                                className={clsx(selectClass, "w-16")}
                                disabled={disabled}
                                value={field.repeat?.min ?? 0}
                                onChange={(e) => {
                                    const min = Math.max(0, Number(e.target.value) || 0);
                                    onFieldChange({
                                        ...field,
                                        repeat: { ...field.repeat, min, max: field.repeat?.max ?? 10 },
                                    });
                                }}
                                data-testid={`form-group-repeat-min-${field.id}`}
                            />
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                            <span className={opContextLabel}>{COLLECTION_AUTHORING_COPY.maxRows}</span>
                            <input
                                type="number"
                                min={1}
                                className={clsx(selectClass, "w-16")}
                                disabled={disabled}
                                value={field.repeat?.max ?? 10}
                                onChange={(e) => {
                                    const max = Math.max(1, Number(e.target.value) || 1);
                                    onFieldChange({
                                        ...field,
                                        repeat: { min: field.repeat?.min ?? 0, max },
                                    });
                                }}
                                data-testid={`form-group-repeat-max-${field.id}`}
                            />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-alloy-midnight/75">
                            <input
                                type="checkbox"
                                disabled={disabled}
                                checked={field.required}
                                onChange={(e) => onFieldChange({ ...field, required: e.target.checked })}
                                data-testid={`form-group-required-${field.id}`}
                            />
                            Required
                        </label>
                    </div>

                    <div className="space-y-1 border-t border-alloy-midnight/[0.06] pt-2">
                        <span className={opContextLabel}>{COLLECTION_AUTHORING_COPY.nestedFieldsLabel}</span>
                        {field.fields.length === 0 ?
                            <p className={opMutedMeta}>{COLLECTION_AUTHORING_COPY.nestedFieldsEmpty}</p>
                        :   <ul className="space-y-1">
                                {field.fields.map((nested, ni) => {
                                    const compat =
                                        iterationContext != null
                                            ? nestedFieldCompatibilityForIteration(nested, iterationContext)
                                            : { status: "compatible" as const };
                                    return (
                                        <li
                                            key={nested.id}
                                            className={clsx(
                                                "flex flex-wrap items-center gap-2 rounded px-1 py-0.5 text-xs",
                                                compat.status !== "compatible" && "bg-amber-50 text-amber-950",
                                            )}
                                            data-testid={`form-group-nested-${field.id}-${nested.id}`}
                                        >
                                            <span className="font-medium">{nested.label}</span>
                                            {compat.status !== "compatible" ?
                                                <span className="text-[10px]">{compat.reason}</span>
                                            :   null}
                                            <button
                                                type="button"
                                                className={opActionLink}
                                                disabled={disabled || ni === 0}
                                                onClick={() => moveNestedField(ni, -1)}
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                className={opActionLink}
                                                disabled={disabled || ni >= field.fields.length - 1}
                                                onClick={() => moveNestedField(ni, 1)}
                                            >
                                                ↓
                                            </button>
                                            <button
                                                type="button"
                                                className="text-alloy-ember"
                                                disabled={disabled}
                                                onClick={() => removeNestedField(nested.id)}
                                            >
                                                Remove
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        }
                        <label className="mt-1 block">
                            <span className="sr-only">Add nested field</span>
                            <select
                                className={selectClass}
                                disabled={disabled || eligibleFields.length === 0}
                                value=""
                                onChange={(e) => {
                                    if (e.target.value) addNestedField(e.target.value);
                                    e.target.value = "";
                                }}
                                data-testid={`form-group-add-nested-${field.id}`}
                            >
                                <option value="">Add nested field…</option>
                                {eligibleFields.map((e) => (
                                    <option key={e.id} value={e.id} disabled={usedNestedIds.has(e.field_key)}>
                                        {e.default_label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>
                <button
                    type="button"
                    className={clsx(opActionLink, "text-alloy-ember")}
                    disabled={disabled}
                    onClick={onRemove}
                    data-testid={`form-group-remove-${field.id}`}
                >
                    {COLLECTION_AUTHORING_COPY.removeSection}
                </button>
            </div>
        </li>
    );
}
