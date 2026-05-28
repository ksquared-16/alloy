"use client";

import clsx from "clsx";
import { useMemo } from "react";
import { FormFieldAuthoringCard } from "@/components/admin/forms/FormFieldAuthoringCard";
import { DocumentCompositionBlockCard } from "@/components/admin/forms/documentComposition/DocumentCompositionBlockCard";
import type { DocumentBlock, DocumentComposition } from "@/lib/forms/documentComposition";
import { sortDocumentBlocks } from "@/lib/forms/documentComposition";
import {
    COMPOSITION_BLOCK_COPY,
    addCompositionBlock,
    addFieldIdToRegion,
    canRemoveFieldRegion,
    fieldById,
    listFieldRegionBlocks,
    moveCompositionBlock,
    patchSchemaComposition,
    removeCompositionBlock,
    removeFieldIdFromComposition,
    resolveDocumentComposition,
    updateCompositionBlock,
} from "@/lib/forms/documentCompositionAuthoring";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { useFormSchemaFieldAuthoring } from "@/lib/forms/useFormSchemaFieldAuthoring";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { customUnmappedTextField, formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import {
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opTechnicalSurface,
} from "@/lib/operational/ui/operationalVisualTokens";

function newBlockId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
    schema: FormSchemaV1;
    onChange: (next: FormSchemaV1) => void;
    disabled?: boolean;
    selectedFieldId?: string | null;
    onSelectField?: (fieldId: string) => void;
    onMoveFieldInRegion?: (regionId: string, fieldId: string, dir: -1 | 1) => void;
    onMoveFieldToRegion?: (fieldId: string, toRegionId: string) => void;
};

/** Document composition workspace — fields + blocks (FD-8 / FD-13). */
export function DocumentCompositionEditor({
    schema,
    onChange,
    disabled = false,
    selectedFieldId = null,
    onSelectField,
    onMoveFieldInRegion,
    onMoveFieldToRegion,
}: Props) {
    const composition = resolveDocumentComposition(schema);
    const sortedBlocks = sortDocumentBlocks(composition.blocks);
    const fieldRegions = listFieldRegionBlocks(composition);
    const fieldAuthoring = useFormSchemaFieldAuthoring(schema, onChange);

    const applyComposition = (next: DocumentComposition) => {
        onChange(patchSchemaComposition(schema, next));
    };

    const replaceBlock = (block: DocumentBlock) => {
        applyComposition(updateCompositionBlock(composition, block.id, block));
    };

    const handleAddBlock = (type: DocumentBlock["type"]) => {
        let block: DocumentBlock;
        const id = newBlockId(type);
        switch (type) {
            case "text":
                block = {
                    id,
                    type: "text",
                    content: "Add instruction text for families.",
                    format: "plain",
                    order: composition.blocks.length,
                };
                break;
            case "heading":
                block = { id, type: "heading", content: "Section title", level: "h2", order: composition.blocks.length };
                break;
            case "divider":
                block = { id, type: "divider", style: "solid", order: composition.blocks.length };
                break;
            case "spacer":
                block = { id, type: "spacer", size: "md", order: composition.blocks.length };
                break;
            case "signature":
                block = { id, type: "signature", label: "Signature", order: composition.blocks.length };
                break;
            case "image":
                block = {
                    id,
                    type: "image",
                    src: "pending:org-logo",
                    alt: "Organization logo",
                    role: "logo",
                    order: composition.blocks.length,
                };
                break;
            case "field_region":
                block = {
                    id,
                    type: "field_region",
                    title: `Section ${fieldRegions.length + 1}`,
                    layout: "one_column",
                    field_ids: [],
                    order: composition.blocks.length,
                };
                break;
            default:
                return;
        }
        applyComposition(addCompositionBlock(composition, block));
    };

    const addFieldToRegion = (regionId: string) => {
        const used = new Set(schema.fields.map((f) => f.id));
        const nextSys = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => !used.has(e.field_key));
        const f = nextSys ? formFieldFromRegistryEntry(nextSys, {}) : customUnmappedTextField();
        const sec0 = schema.sections[0] ?? { id: "main", title: "Questions", field_ids: [] as string[] };
        const nextComp = addFieldIdToRegion(composition, regionId, f.id);
        onChange(
            patchSchemaComposition(
                {
                    ...schema,
                    fields: [...schema.fields, f],
                    sections: [{ ...sec0, field_ids: [...sec0.field_ids, f.id] }, ...schema.sections.slice(1)],
                },
                nextComp
            )
        );
        onSelectField?.(f.id);
    };

    const removeField = (fieldId: string) => {
        const nextComp = removeFieldIdFromComposition(composition, fieldId);
        const nextFields = schema.fields.filter((f) => f.id !== fieldId);
        const nextSecs = schema.sections.map((s) => ({
            ...s,
            field_ids: s.field_ids.filter((id) => id !== fieldId),
        }));
        onChange(patchSchemaComposition({ ...schema, fields: nextFields, sections: nextSecs }, nextComp));
        if (selectedFieldId === fieldId) onSelectField?.("");
    };

    const regionOptions = useMemo(
        () =>
            fieldRegions.map((r, i) => ({
                id: r.id,
                label: r.title?.trim() || `Section ${i + 1}`,
            })),
        [fieldRegions]
    );

    let fieldRegionOrdinal = 0;

    return (
        <div className="space-y-2" data-testid="document-composition-editor">
            <p className={opMetadata}>{COMPOSITION_BLOCK_COPY.workspaceLead}</p>

            <div className="space-y-2">
                {sortedBlocks.map((block) => {
                    if (block.type === "field_region") {
                        const regionIndex = fieldRegionOrdinal++;
                        const regionFields = block.field_ids
                            .map((fid) => fieldById(schema, fid))
                            .filter(Boolean);
                        const otherRegions = regionOptions.filter((r) => r.id !== block.id);

                        return (
                            <div key={block.id} data-testid={`document-field-region-${block.id}`}>
                                <DocumentCompositionBlockCard
                                    block={block}
                                    schema={schema}
                                    disabled={disabled}
                                    onChange={replaceBlock}
                                    canRemoveSection={canRemoveFieldRegion(block)}
                                    onRemoveSection={() => applyComposition(removeCompositionBlock(composition, block.id))}
                                    onMoveSection={(dir) =>
                                        applyComposition(moveCompositionBlock(composition, block.id, dir))
                                    }
                                    sectionPosition={regionIndex}
                                    sectionTotal={fieldRegions.length}
                                />
                                <div className="mt-1 space-y-1" data-testid={`document-field-region-editor-${block.id}`}>
                                    {regionFields.length === 0 ?
                                        <p className={clsx("rounded-lg px-3 py-3 text-center text-sm", opTechnicalSurface)}>
                                            {COMPOSITION_BLOCK_COPY.fieldRegionEmpty}
                                        </p>
                                    :   <ul className={opGroupedSurface}>
                                            {block.field_ids.map((fid, fi) => {
                                                const field = fieldById(schema, fid);
                                                if (!field) return null;
                                                const idx = fieldAuthoring.fieldIndexById(fid);
                                                if (idx < 0) return null;
                                                const entry = fieldAuthoring.registryEntryForField(field);
                                                const custom = fieldAuthoring.isCustomUnmappedField(field);
                                                return (
                                                    <FormFieldAuthoringCard
                                                        key={field.id}
                                                        field={field}
                                                        index={idx}
                                                        total={fieldAuthoring.topFields.length}
                                                        disabled={disabled}
                                                        entry={entry}
                                                        custom={custom}
                                                        locked={fieldAuthoring.isTypeLocked(entry, custom)}
                                                        kind={fieldAuthoring.uiKindForField(field)}
                                                        pickerValue={fieldAuthoring.pickerValueForField(field)}
                                                        systemFields={OPERATIONAL_FORM_SYSTEM_FIELDS}
                                                        takenFieldIds={fieldAuthoring.takenIdsForIndex(idx)}
                                                        onPickerChange={fieldAuthoring.handlePickerChange}
                                                        onFieldChange={fieldAuthoring.setFieldAt}
                                                        compact
                                                        highlighted={selectedFieldId === field.id}
                                                        regionPosition={fi}
                                                        regionTotal={block.field_ids.length}
                                                        onMove={(_, dir) =>
                                                            onMoveFieldInRegion ?
                                                                onMoveFieldInRegion(block.id, fid, dir)
                                                            :   fieldAuthoring.moveFieldById(fid, dir)
                                                        }
                                                        onRemove={() => removeField(fid)}
                                                        onFocus={() => onSelectField?.(field.id)}
                                                    />
                                                );
                                            })}
                                        </ul>
                                    }
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        className="rounded-md border border-alloy-midnight/10 bg-white px-2 py-1 text-xs font-medium text-alloy-midnight shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40"
                                        disabled={disabled}
                                        onClick={() => addFieldToRegion(block.id)}
                                        data-testid={`document-add-question-${block.id}`}
                                    >
                                        {COMPOSITION_BLOCK_COPY.addQuestionToSection}
                                    </button>
                                    {otherRegions.length > 0 ?
                                        <label className="flex items-center gap-1 text-xs text-alloy-midnight/70">
                                            <span className="sr-only">Move selected question to section</span>
                                            <select
                                                className="rounded-md border border-alloy-midnight/10 bg-white px-1.5 py-1 text-xs"
                                                disabled={disabled || !selectedFieldId || !block.field_ids.includes(selectedFieldId)}
                                                defaultValue=""
                                                data-testid={`document-move-field-section-${block.id}`}
                                                onChange={(e) => {
                                                    const target = e.target.value;
                                                    if (target && selectedFieldId && onMoveFieldToRegion) {
                                                        onMoveFieldToRegion(selectedFieldId, target);
                                                    }
                                                    e.target.value = "";
                                                }}
                                            >
                                                <option value="" disabled>
                                                    Move selected here…
                                                </option>
                                                {otherRegions.map((r) => (
                                                    <option key={r.id} value={r.id}>
                                                        {r.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    :   null}
                                </div>
                            </div>
                        );
                    }

                    return (
                        <DocumentCompositionBlockCard
                            key={block.id}
                            block={block}
                            schema={schema}
                            disabled={disabled}
                            onChange={replaceBlock}
                            onRemove={() => applyComposition(removeCompositionBlock(composition, block.id))}
                        />
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-2" data-testid="document-composition-add-blocks">
                <button
                    type="button"
                    className="rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => handleAddBlock("field_region")}
                    data-testid="document-add-section"
                >
                    {COMPOSITION_BLOCK_COPY.addFieldRegion}
                </button>
                <button
                    type="button"
                    className="rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => handleAddBlock("text")}
                >
                    {COMPOSITION_BLOCK_COPY.addInstruction}
                </button>
                <button
                    type="button"
                    className="rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => handleAddBlock("divider")}
                >
                    {COMPOSITION_BLOCK_COPY.addDivider}
                </button>
                <button
                    type="button"
                    className="rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => handleAddBlock("spacer")}
                >
                    {COMPOSITION_BLOCK_COPY.addSpacer}
                </button>
                <button
                    type="button"
                    className="rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => handleAddBlock("signature")}
                >
                    {COMPOSITION_BLOCK_COPY.addSignature}
                </button>
                <button
                    type="button"
                    className="rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => handleAddBlock("image")}
                >
                    {COMPOSITION_BLOCK_COPY.addBranding}
                </button>
            </div>

            <details className={clsx("rounded-lg px-3 py-2", opTechnicalSurface)} data-testid="form-field-authoring-technical">
                <summary className="cursor-pointer text-sm font-medium text-alloy-midnight/80">
                    Technical details (internal keys)
                </summary>
                <p className={clsx("mt-2 leading-relaxed", opMetadata)}>
                    Internal keys align submissions with CRM mapping — you normally do not need to edit these.
                </p>
                <ul className="mt-2 list-disc pl-5 font-mono text-[11px] text-alloy-midnight/75">
                    {fieldAuthoring.topFields.map((f) => (
                        <li key={f.id}>
                            {f.id}
                            {f.field_source ? ` · ${f.field_source.entity_type}.${f.field_source.field_key}` : ""}
                        </li>
                    ))}
                </ul>
                {!schema.document_composition ?
                    <p className={clsx("mt-2", opMutedMeta)}>
                        Composition is generated from fields until you save — public intake still uses field schema only.
                    </p>
                :   null}
            </details>
        </div>
    );
}
