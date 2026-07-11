"use client";

import { useCallback, useMemo } from "react";
import type { FormField, FormFieldLayoutWidth, FormSchemaV1 } from "@/lib/forms/schema";
import {
    isCustomUnmappedField,
    uiKindForField,
    type UiScalarKind,
} from "@/lib/forms/formFieldAuthoringPresentation";
import { patchSchemaComposition, resolveDocumentComposition } from "@/lib/forms/documentCompositionAuthoring";
import {
    registryEntryForFormField,
    pickerValueForFormField,
    systemFieldByIdFromPicker,
    type FieldDefinitionPickerRow,
} from "@/lib/fields/formFieldRegistryPicker";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";
import { customUnmappedTextField, formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import {
    buildFormsAuthorableCollectionBindingSeeds,
    findFormsCollectionBindingProvider,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { collectionBindingFromProvider } from "@/lib/fields/formsCollectionRepeatBinding";

const EMAIL_PATTERN = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
const PHONE_PATTERN = "^[+0-9()\\-\\s]{7,}$";

function isTypeLocked(entry: SystemFieldRegistryEntry | null, custom: boolean): boolean {
    if (custom || !entry) return false;
    const k = entry.suggested_kind;
    return k === "date" || k === "number" || k === "checkbox" || k === "signature" || k === "select";
}

function layoutPassThrough(field: FormField): { layout_width?: FormFieldLayoutWidth } {
    if (
        "layout_width" in field &&
        (field.layout_width === "half" ||
            field.layout_width === "third" ||
            field.layout_width === "quarter" ||
            field.layout_width === "full")
    ) {
        return { layout_width: field.layout_width };
    }
    return {};
}

function applyTextLikeKind(field: FormField, kind: UiScalarKind, preserveId: string): FormField {
    const label = field.label;
    const required = field.required;
    const description = field.description;
    const placeholder = field.placeholder;
    const src = field.field_source;
    const base = { id: preserveId, label, required, description, placeholder, field_source: src, ...layoutPassThrough(field) };
    switch (kind) {
        case "text":
            return { ...base, type: "text" };
        case "textarea":
            return { ...base, type: "text", multiline: true };
        case "email":
            return { ...base, type: "text", validate: { pattern: EMAIL_PATTERN } };
        case "phone":
            return { ...base, type: "text", validate: { pattern: PHONE_PATTERN } };
        default:
            return { ...base, type: "text" };
    }
}

function buildFieldFromUiCustom(kind: UiScalarKind, id: string, label: string): FormField {
    const base = { id, label, required: false };
    switch (kind) {
        case "text":
            return { ...base, type: "text" };
        case "textarea":
            return { ...base, type: "text", multiline: true };
        case "email":
            return { ...base, type: "text", validate: { pattern: EMAIL_PATTERN } };
        case "phone":
            return { ...base, type: "text", validate: { pattern: PHONE_PATTERN } };
        case "number":
            return { ...base, type: "number" };
        case "date":
            return { ...base, type: "date" };
        case "checkbox":
            return { ...base, type: "boolean" };
        case "select":
            return {
                ...base,
                type: "select",
                static_options: [
                    { value: "a", label: "Option A" },
                    { value: "b", label: "Option B" },
                ],
            };
        case "signature":
            return { ...base, type: "signature", signature: {} };
        default:
            return { ...base, type: "text" };
    }
}

function commitSchema(next: FormSchemaV1, onChange: (next: FormSchemaV1) => void) {
    const composition = resolveDocumentComposition(next);
    onChange(patchSchemaComposition(next, composition));
}

export type FormSchemaFieldAuthoringOptions = {
    /** Canonical-derived picker entries — not OPERATIONAL_FORM_SYSTEM_FIELDS directly. */
    systemFields?: readonly SystemFieldRegistryEntry[];
    relationshipFields?: readonly SystemFieldRegistryEntry[];
};

export function useFormSchemaFieldAuthoring(
    schema: FormSchemaV1,
    onChange: (next: FormSchemaV1) => void,
    options?: FormSchemaFieldAuthoringOptions,
) {
    const systemFields = options?.systemFields ?? OPERATIONAL_FORM_SYSTEM_FIELDS;
    const relationshipFields = options?.relationshipFields ?? [];
    const systemFieldById = useMemo(
        () => systemFieldByIdFromPicker([...systemFields, ...relationshipFields]),
        [systemFields, relationshipFields],
    );

    const mainSection = schema.sections[0];
    const topFields = useMemo(
        () => mainSection?.field_ids.map((id) => schema.fields.find((f) => f.id === id)).filter(Boolean) as FormField[],
        [mainSection?.field_ids, schema.fields],
    );

    const patchSchema = useCallback(
        (patch: Partial<FormSchemaV1>) => {
            commitSchema({ ...schema, ...patch }, onChange);
        },
        [onChange, schema],
    );

    const setFieldAt = useCallback(
        (index: number, nextField: FormField) => {
            const ids = [...(mainSection?.field_ids ?? [])];
            const oldId = ids[index];
            const nextFields = schema.fields.map((f) => (f.id === oldId ? nextField : f));
            if (oldId !== nextField.id) {
                ids[index] = nextField.id;
                for (let s = 0; s < schema.sections.length; s++) {
                    const sec = schema.sections[s];
                    const fi = sec.field_ids.indexOf(oldId);
                    if (fi >= 0) {
                        const nf = [...sec.field_ids];
                        nf[fi] = nextField.id;
                        const nextSecs = [...schema.sections];
                        nextSecs[s] = { ...sec, field_ids: nf };
                        patchSchema({ fields: nextFields, sections: nextSecs });
                        return;
                    }
                }
            }
            patchSchema({ fields: nextFields });
        },
        [mainSection?.field_ids, patchSchema, schema],
    );

    const addField = useCallback(() => {
        const used = new Set(topFields.map((f) => f.id));
        const nextSys = systemFields.find((e) => !used.has(e.field_key));
        const f = nextSys ? formFieldFromRegistryEntry(nextSys, {}) : customUnmappedTextField();
        const sec0 = schema.sections[0] ?? { id: "main", title: "Questions", field_ids: [] as string[] };
        patchSchema({
            fields: [...schema.fields, f],
            sections: [{ ...sec0, field_ids: [...sec0.field_ids, f.id] }, ...schema.sections.slice(1)],
        });
    }, [patchSchema, schema.fields, schema.sections, systemFields, topFields]);

    const addCollectionBoundGroup = useCallback(
        (providerRef?: string) => {
            const providers = buildFormsAuthorableCollectionBindingSeeds();
            const provider =
                (providerRef ? findFormsCollectionBindingProvider(providerRef) : null)
                ?? providers[0];
            if (!provider) return null;
            const id = `group_${provider.refKey.replace(/[^a-z0-9]+/gi, "_")}_${Math.random().toString(36).slice(2, 7)}`;
            const groupField: FormField = {
                id,
                type: "group",
                label: provider.label,
                required: false,
                repeat: { min: 0, max: 10 },
                collection_binding: collectionBindingFromProvider(provider),
                fields: [],
            };
            const sec0 = schema.sections[0] ?? { id: "main", title: "Questions", field_ids: [] as string[] };
            patchSchema({
                fields: [...schema.fields, groupField],
                sections: [{ ...sec0, field_ids: [...sec0.field_ids, groupField.id] }, ...schema.sections.slice(1)],
            });
            return groupField.id;
        },
        [patchSchema, schema.fields, schema.sections],
    );

    const updateGroupField = useCallback(
        (fieldId: string, next: FormField & { type: "group" }) => {
            patchSchema({
                fields: schema.fields.map((f) => (f.id === fieldId ? next : f)),
            });
        },
        [patchSchema, schema.fields],
    );

    const removeFieldAt = useCallback(
        (index: number) => {
            const ids = [...(mainSection?.field_ids ?? [])];
            const rid = ids[index];
            if (!rid) return;
            ids.splice(index, 1);
            const nextFields = schema.fields.filter((x) => x.id !== rid);
            const nextSecs = schema.sections.map((s, i) =>
                i === 0 ? { ...s, field_ids: ids.filter((fid) => nextFields.some((f) => f.id === fid)) } : s,
            );
            patchSchema({ fields: nextFields, sections: nextSecs });
        },
        [mainSection?.field_ids, patchSchema, schema],
    );

    const removeFieldById = useCallback(
        (fieldId: string) => {
            const idx = topFields.findIndex((f) => f.id === fieldId);
            if (idx >= 0) removeFieldAt(idx);
        },
        [removeFieldAt, topFields],
    );

    const move = useCallback(
        (index: number, dir: -1 | 1) => {
            const ids = [...(mainSection?.field_ids ?? [])];
            const j = index + dir;
            if (j < 0 || j >= ids.length) return;
            const tmp = ids[index];
            ids[index] = ids[j]!;
            ids[j] = tmp!;
            const s0 = schema.sections[0];
            if (!s0) return;
            patchSchema({ sections: [{ ...s0, field_ids: ids }, ...schema.sections.slice(1)] });
        },
        [mainSection?.field_ids, patchSchema, schema.sections],
    );

    const moveFieldById = useCallback(
        (fieldId: string, dir: -1 | 1) => {
            const idx = topFields.findIndex((f) => f.id === fieldId);
            if (idx >= 0) move(idx, dir);
        },
        [move, topFields],
    );

    const registryEntryForField = useCallback(
        (f: FormField) => registryEntryForFormField(f, systemFields, relationshipFields),
        [systemFields, relationshipFields],
    );

    const pickerValueForField = useCallback(
        (f: FormField) => pickerValueForFormField(f, systemFields, relationshipFields),
        [systemFields, relationshipFields],
    );

    const handlePickerChange = useCallback(
        (index: number, value: string) => {
            const field = topFields[index];
            if (!field) return;

            if (value.startsWith("kind:")) {
                const nextKind = value.slice(5) as UiScalarKind;
                const entry = registryEntryForField(field);
                const custom = isCustomUnmappedField(field);
                const locked = isTypeLocked(entry, custom);
                if (locked) return;
                const textKinds: UiScalarKind[] = ["text", "textarea", "email", "phone"];
                if (custom) {
                    const nf = buildFieldFromUiCustom(nextKind, field.id, field.label);
                    setFieldAt(index, {
                        ...nf,
                        ...layoutPassThrough(field),
                        required: field.required,
                        description: field.description,
                        placeholder: field.placeholder,
                        field_source: { entity_type: "custom", field_key: "unmapped" },
                    } as FormField);
                    return;
                }
                if (entry && textKinds.includes(entry.suggested_kind) && textKinds.includes(nextKind)) {
                    setFieldAt(index, applyTextLikeKind(field, nextKind, field.id));
                }
                return;
            }

            if (value === "__custom") {
                setFieldAt(index, customUnmappedTextField());
                return;
            }
            if (value.startsWith("sys:")) {
                const rid = value.slice(4);
                const ent = systemFieldById.get(rid);
                if (ent) setFieldAt(index, formFieldFromRegistryEntry(ent, {}));
            }
        },
        [registryEntryForField, setFieldAt, systemFieldById, topFields],
    );

    const takenIdsForIndex = useCallback(
        (index: number) => new Set(topFields.filter((_, i) => i !== index).map((f) => f.id)),
        [topFields],
    );

    const fieldIndexById = useCallback((fieldId: string) => topFields.findIndex((f) => f.id === fieldId), [topFields]);

    return {
        topFields,
        patchSchema,
        setFieldAt,
        addField,
        addCollectionBoundGroup,
        updateGroupField,
        removeFieldAt,
        removeFieldById,
        move,
        moveFieldById,
        handlePickerChange,
        takenIdsForIndex,
        fieldIndexById,
        registryEntryForField,
        pickerValueForField,
        isTypeLocked,
        isCustomUnmappedField,
        uiKindForField,
        systemFields,
        relationshipFields,
    };
}

export type { FieldDefinitionPickerRow };
