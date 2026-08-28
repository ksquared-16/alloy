import { z } from "zod";
import type { FormField, FormSchemaV1 } from "./schema";
import { formSchemaV1Schema } from "./schema";
import { validateCollectionPayloadContract } from "@/lib/forms/collection/formsCollectionSubmissionValidation";

export type FormPayloadMode = "draft" | "submit";

const signatureEntrySchema = z
    .object({
        kind: z.enum(["typed", "drawn"]),
        typed_full_name: z.string().optional(),
        drawn_document_id: z.string().optional(),
        acknowledged_at: z.string().optional(),
    })
    .strict();

export type FormPayload = {
    values: Record<string, unknown>;
    groups?: Record<string, FormPayloadGroupRow[]>;
    signatures?: Record<string, FormPayloadSignature>;
    meta?: Record<string, unknown>;
};

export type FormPayloadGroupRowCollectionMeta = {
    provider_ref: string;
    item_id?: string;
    origin: "existing" | "respondent_added";
    iteration_entity_type: string;
};

export type FormPayloadGroupRow = {
    instance_key: string;
    values: Record<string, unknown>;
    groups?: Record<string, FormPayloadGroupRow[]>;
    /** Signatures for `signature` fields defined inside this group (required for repeatable / nested signatures). */
    signatures?: Record<string, FormPayloadSignature>;
    /** Optional runtime metadata for collection-bound repeaters — preserved in submission envelope for Processing (P5). */
    collection?: FormPayloadGroupRowCollectionMeta;
};

export type FormPayloadSignature = z.infer<typeof signatureEntrySchema>;

export type NormalizedValidationError = {
    path: string[];
    message: string;
    code?: string;
};

export type ValidateFormPayloadResult =
    | { ok: true; schema: FormSchemaV1; payload: FormPayload }
    | { ok: false; errors: NormalizedValidationError[] };

const formPayloadGroupRowCollectionMetaSchema = z
    .object({
        provider_ref: z.string().min(1),
        item_id: z.string().optional(),
        origin: z.enum(["existing", "respondent_added"]),
        iteration_entity_type: z.string().min(1),
    })
    .strict();

const formPayloadGroupRowSchema: z.ZodType<FormPayloadGroupRow> = z.lazy(() =>
    z
        .object({
            instance_key: z.string().min(1),
            values: z.record(z.string(), z.unknown()).default({}),
            groups: z.record(z.string(), z.array(formPayloadGroupRowSchema)).optional(),
            signatures: z.record(z.string(), signatureEntrySchema).optional(),
            collection: formPayloadGroupRowCollectionMetaSchema.optional(),
        })
        .strict()
);

const formPayloadSchema = z
    .object({
        values: z.record(z.string(), z.unknown()).default({}),
        groups: z.record(z.string(), z.array(formPayloadGroupRowSchema)).optional(),
        signatures: z.record(z.string(), signatureEntrySchema).optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeValidationErrors(error: z.ZodError): NormalizedValidationError[] {
    return error.issues.map((i) => ({
        path: i.path.map(String),
        message: i.message,
        code: i.code,
    }));
}

export function collectSchemaFieldIds(schema: FormSchemaV1): string[] {
    const ids: string[] = [];
    const walk = (fields: FormField[]) => {
        for (const f of fields) {
            ids.push(f.id);
            if (f.type === "group") walk(f.fields);
        }
    };
    walk(schema.fields);
    return ids;
}

function buildFieldMap(schema: FormSchemaV1): Map<string, FormField> {
    const map = new Map<string, FormField>();
    const walk = (fields: FormField[]) => {
        for (const f of fields) {
            map.set(f.id, f);
            if (f.type === "group") walk(f.fields);
        }
    };
    walk(schema.fields);
    return map;
}

function isTopLevelFieldId(schema: FormSchemaV1, fieldId: string): boolean {
    return schema.fields.some((f) => f.id === fieldId);
}

function visibilityValueMatches(actual: unknown, cond: { op: "eq" | "neq"; value: string | number | boolean | null }): boolean {
    const eq = valuesEqual(actual, cond.value);
    return cond.op === "eq" ? eq : !eq;
}

function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    if (typeof a === "number" && typeof b === "number") return Object.is(a, b);
    if (typeof a === "boolean" && typeof b === "boolean") return a === b;
    if (typeof a === "string" && typeof b === "string") return a === b;
    return false;
}

/**
 * Whether `fieldId` is visible given current answers. Conditions are AND-ed; each condition
 * consults the referenced field's visibility first, then compares values.
 */
export function evaluateFieldVisibility(
    fieldId: string,
    schema: FormSchemaV1,
    getValue: (fieldId: string) => unknown
): boolean {
    const map = buildFieldMap(schema);
    return evaluateFieldVisibilityWithMap(fieldId, map, getValue, new Map(), new Set());
}

function evaluateFieldVisibilityWithMap(
    fieldId: string,
    fieldMap: Map<string, FormField>,
    getValue: (fieldId: string) => unknown,
    memo: Map<string, boolean>,
    stack: Set<string>
): boolean {
    if (memo.has(fieldId)) return memo.get(fieldId)!;
    if (stack.has(fieldId)) {
        return false;
    }
    const field = fieldMap.get(fieldId);
    if (!field) {
        memo.set(fieldId, false);
        return false;
    }
    stack.add(fieldId);
    if (!field.visibility) {
        stack.delete(fieldId);
        memo.set(fieldId, true);
        return true;
    }
    let ok = true;
    for (const cond of field.visibility.all) {
        const refVisible = evaluateFieldVisibilityWithMap(cond.field_id, fieldMap, getValue, memo, stack);
        if (!refVisible) {
            ok = false;
            break;
        }
        const v = getValue(cond.field_id);
        if (!visibilityValueMatches(v, cond)) {
            ok = false;
            break;
        }
    }
    stack.delete(fieldId);
    memo.set(fieldId, ok);
    return ok;
}

function err(path: string[], message: string, code = "custom"): NormalizedValidationError {
    return { path, message, code };
}

function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}

function directChildGroupIds(group: FormField & { type: "group" }): string[] {
    return group.fields
        .filter((c: FormField): c is FormField & { type: "group" } => c.type === "group")
        .map((c: FormField & { type: "group" }) => c.id);
}

/** Trim all `text` field values in-place shape for persistence (after validation passes). */
export function trimFormPayloadTextFields(schema: FormSchemaV1, payload: FormPayload): FormPayload {
    const fieldMap = buildFieldMap(schema);
    const values = { ...payload.values };
    for (const key of Object.keys(values)) {
        const f = fieldMap.get(key);
        if (f?.type === "text" && typeof values[key] === "string") {
            values[key] = values[key].trim();
        }
    }

    let groups = payload.groups;
    if (groups) {
        const nextGroups: Record<string, FormPayloadGroupRow[]> = {};
        for (const [gk, rows] of Object.entries(groups)) {
            const gf = fieldMap.get(gk);
            if (gf?.type !== "group") continue;
            nextGroups[gk] = rows.map((row) => trimGroupRowTextFields(gf, row));
        }
        groups = nextGroups;
    }

    return { ...payload, values, groups };
}

function trimGroupRowTextFields(groupField: FormField & { type: "group" }, row: FormPayloadGroupRow): FormPayloadGroupRow {
    const rowValues = { ...row.values };
    for (const child of groupField.fields) {
        if (child.type !== "text") continue;
        const v = rowValues[child.id];
        if (typeof v === "string") rowValues[child.id] = v.trim();
    }

    let nested = row.groups;
    if (nested) {
        const nextNested: Record<string, FormPayloadGroupRow[]> = {};
        for (const [gk, rows] of Object.entries(nested)) {
            const nestedField = groupField.fields.find((x): x is FormField & { type: "group" } => x.id === gk && x.type === "group");
            if (!nestedField) continue;
            nextNested[gk] = rows.map((r) => trimGroupRowTextFields(nestedField, r));
        }
        nested = nextNested;
    }

    return { ...row, values: rowValues, groups: nested };
}

function textRequiredPresent(raw: unknown): boolean {
    if (raw === undefined || raw === null) return false;
    if (typeof raw === "string") return raw.trim() !== "";
    if (Array.isArray(raw)) return raw.length > 0;
    return raw !== "";
}

function isRequiredValueMissing(field: FormField, raw: unknown): boolean {
    if (field.type === "text") return !textRequiredPresent(raw);
    return raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
}

/** Hidden fields must be empty on submit (after trim for text). */
function violatesHiddenNonEmpty(field: FormField, raw: unknown): boolean {
    if (raw === undefined || raw === null) return false;
    if (field.type === "text" && typeof raw === "string") return raw.trim() !== "";
    return raw !== "";
}

/**
 * The one owner of "is this value valid for this authored field".
 *
 * Exported so the Participant Runtime can DELEGATE to it instead of restating its rules. That
 * matters more than it looks: this function is where `validate.min`, `validate.max`,
 * `validate.pattern`, the closed option set and the type checks live, and a conversational surface
 * that re-implemented any of them would drift from the artifact the parent eventually signs.
 */
export function validateScalarValue(
    field: FormField,
    raw: unknown,
    mode: FormPayloadMode,
    optionValuesByFieldId: Record<string, readonly string[]> | undefined,
    path: string[]
): NormalizedValidationError[] {
    const errors: NormalizedValidationError[] = [];
    if (field.type === "group" || field.type === "signature") return errors;

    if (raw === undefined || raw === null || raw === "") {
        return errors;
    }

    const rules = field.validate;

    switch (field.type) {
        case "text": {
            if (typeof raw !== "string") {
                errors.push(err(path, "Expected string", "invalid_type"));
                break;
            }
            const s = raw.trim();
            if (s === "") {
                return errors;
            }
            if (rules?.min_length !== undefined && s.length < rules.min_length) {
                errors.push(err(path, `min_length ${rules.min_length}`, "too_small"));
            }
            if (rules?.max_length !== undefined && s.length > rules.max_length) {
                errors.push(err(path, `max_length ${rules.max_length}`, "too_big"));
            }
            if (rules?.pattern) {
                try {
                    const re = new RegExp(rules.pattern);
                    if (!re.test(s)) {
                        errors.push(
                            err(
                                path,
                                rules.pattern.includes("@")
                                    ? "Enter a valid email address."
                                    : "pattern mismatch",
                                "invalid_string"
                            )
                        );
                    }
                } catch {
                    errors.push(err(path, "Invalid validate.pattern on field definition", "custom"));
                }
            }
            break;
        }
        case "number": {
            if (typeof raw !== "number" || Number.isNaN(raw)) {
                errors.push(err(path, "Expected number", "invalid_type"));
                break;
            }
            if (rules?.min !== undefined && raw < rules.min) {
                errors.push(err(path, `min ${rules.min}`, "too_small"));
            }
            if (rules?.max !== undefined && raw > rules.max) {
                errors.push(err(path, `max ${rules.max}`, "too_big"));
            }
            break;
        }
        case "date": {
            if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                errors.push(err(path, "Expected date string YYYY-MM-DD", "invalid_type"));
            }
            break;
        }
        case "boolean": {
            if (typeof raw !== "boolean") {
                errors.push(err(path, "Expected boolean", "invalid_type"));
            }
            break;
        }
        case "select": {
            if (typeof raw !== "string") {
                errors.push(err(path, "Expected string", "invalid_type"));
                break;
            }
            if (mode === "submit" || raw !== "") {
                const opts =
                    optionValuesByFieldId?.[field.id] ??
                    (field.static_options?.length ? field.static_options.map((o) => o.value) : undefined);
                if (!opts) {
                    errors.push(err(path, "optionValuesByFieldId missing for select field", "custom"));
                } else if (!opts.includes(raw)) {
                    errors.push(err(path, "Invalid option for select", "invalid_enum_value"));
                }
            }
            break;
        }
        case "multiselect": {
            if (!Array.isArray(raw)) {
                errors.push(err(path, "Expected string[]", "invalid_type"));
                break;
            }
            if (!raw.every((x) => typeof x === "string")) {
                errors.push(err(path, "Expected string[]", "invalid_type"));
                break;
            }
            const opts =
                optionValuesByFieldId?.[field.id] ??
                (field.static_options?.length ? field.static_options.map((o) => o.value) : undefined);
            if (mode === "submit" || raw.length > 0) {
                if (!opts) {
                    errors.push(err(path, "optionValuesByFieldId missing for multiselect field", "custom"));
                } else {
                    for (const v of raw) {
                        if (!opts.includes(v)) {
                            errors.push(err(path, `Invalid option: ${v}`, "invalid_enum_value"));
                        }
                    }
                }
            }
            break;
        }
        case "file_ref": {
            if (typeof raw !== "string" || !isUuid(raw)) {
                errors.push(err(path, "Expected document UUID string", "invalid_type"));
            }
            break;
        }
        default:
            break;
    }
    return errors;
}

function validateSignaturePayload(
    field: FormField & { type: "signature" },
    sig: FormPayloadSignature | undefined,
    mode: FormPayloadMode,
    path: string[]
): NormalizedValidationError[] {
    if (mode === "draft") return [];
    if (!field.required && sig === undefined) return [];
    if (sig === undefined) {
        return [err(path, "Signature required", "custom")];
    }
    const cfg = field.signature ?? {};
    const errors: NormalizedValidationError[] = [];

    if (sig.kind === "typed") {
        const name = sig.typed_full_name?.trim();
        if (!name) errors.push(err([...path, "typed_full_name"], "typed_full_name required", "custom"));
        if (cfg.require_typed_name && !name) {
            errors.push(err([...path, "typed_full_name"], "typed name required by field config", "custom"));
        }
    } else if (sig.kind === "drawn") {
        const id = sig.drawn_document_id;
        if (!id || !isUuid(id)) {
            errors.push(err([...path, "drawn_document_id"], "drawn_document_id UUID required", "custom"));
        }
        if (cfg.require_drawn_asset && (!id || !isUuid(id))) {
            errors.push(err([...path, "drawn_document_id"], "drawn asset required by field config", "custom"));
        }
    }

    if (cfg.require_acknowledgment && !sig.acknowledged_at) {
        errors.push(err([...path, "acknowledged_at"], "acknowledgment required", "custom"));
    }

    if (sig.kind === "typed" && sig.drawn_document_id) {
        errors.push(err(path, "typed signature must not include drawn_document_id", "custom"));
    }
    if (sig.kind === "drawn" && sig.typed_full_name) {
        errors.push(err(path, "drawn signature must not include typed_full_name", "custom"));
    }

    return errors;
}

function mergeLookup(chain: Record<string, unknown>[]): (id: string) => unknown {
    return (id: string) => {
        for (let i = chain.length - 1; i >= 0; i--) {
            if (Object.prototype.hasOwnProperty.call(chain[i], id)) return chain[i][id];
        }
        return undefined;
    };
}

function validateGroupInstances(
    groupField: FormField & { type: "group" },
    instances: FormPayloadGroupRow[] | undefined,
    mode: FormPayloadMode,
    optionValuesByFieldId: Record<string, readonly string[]> | undefined,
    lookupChain: Record<string, unknown>[],
    pathPrefix: string[],
    schema: FormSchemaV1,
    errors: NormalizedValidationError[]
): void {
    const rep = groupField.repeat ?? { min: 0, max: undefined };
    const min = rep.min;
    const max = rep.max;
    const list = instances ?? [];

    if (mode === "submit") {
        if (list.length < min) {
            errors.push(err([...pathPrefix, groupField.id], `Expected at least ${min} group instance(s)`, "too_small"));
        }
        if (max !== undefined && list.length > max) {
            errors.push(err([...pathPrefix, groupField.id], `Expected at most ${max} group instance(s)`, "too_big"));
        }
        if (groupField.required && list.length < 1) {
            errors.push(err([...pathPrefix, groupField.id], "Required group must have at least one instance", "custom"));
        }
    }

    const allowedChildIds = new Set(groupField.fields.map((c) => c.id));
    const childGroupIds = new Set(directChildGroupIds(groupField));
    const childSignatureIds = new Set(
        groupField.fields
            .filter((c: FormField): c is FormField & { type: "signature" } => c.type === "signature")
            .map((c: FormField & { type: "signature" }) => c.id)
    );

    for (let i = 0; i < list.length; i++) {
        const row = list[i];
        const rowPath = [...pathPrefix, groupField.id, String(i)];

        for (const k of Object.keys(row.values)) {
            if (!allowedChildIds.has(k)) {
                errors.push(err([...rowPath, "values", k], "Unknown field id in group instance", "custom"));
            }
        }

        if (row.groups) {
            for (const gk of Object.keys(row.groups)) {
                if (!childGroupIds.has(gk)) {
                    errors.push(err([...rowPath, "groups", gk], "Unknown nested group id", "custom"));
                }
            }
        }

        if (row.signatures) {
            for (const sk of Object.keys(row.signatures)) {
                if (!childSignatureIds.has(sk)) {
                    errors.push(err([...rowPath, "signatures", sk], "Unknown signature field id for this group", "custom"));
                }
            }
        }

        const rowLookup = mergeLookup([...lookupChain, row.values]);

        for (const child of groupField.fields) {
            if (child.type === "group") {
                validateGroupInstances(
                    child,
                    row.groups?.[child.id],
                    mode,
                    optionValuesByFieldId,
                    [...lookupChain, row.values],
                    rowPath,
                    schema,
                    errors
                );
                continue;
            }

            const vis = evaluateFieldVisibility(child.id, schema, rowLookup);

            if (child.type === "signature") {
                const sig = row.signatures?.[child.id];
                const sigPath = [...rowPath, "signatures", child.id];
                if (!vis) {
                    if (mode === "submit" && sig !== undefined) {
                        errors.push(err(sigPath, "Signature present but field is hidden", "custom"));
                    }
                    continue;
                }
                errors.push(...validateSignaturePayload(child, sig, mode, sigPath));
                continue;
            }

            const raw = row.values[child.id];
            if (!vis) {
                if (mode === "submit" && violatesHiddenNonEmpty(child, raw)) {
                    errors.push(err([...rowPath, "values", child.id], "Field is hidden and must be empty on submit", "custom"));
                }
                continue;
            }

            if (mode === "submit" && child.required) {
                if (isRequiredValueMissing(child, raw)) {
                    errors.push(err([...rowPath, "values", child.id], "Required field missing", "custom"));
                }
            }

            if (raw !== undefined && raw !== null && raw !== "" && !(child.type === "text" && typeof raw === "string" && raw.trim() === "")) {
                errors.push(
                    ...validateScalarValue(child, raw, mode, optionValuesByFieldId, [...rowPath, "values", child.id])
                );
            }
        }
    }
}

export function validateFormPayload(input: {
    schemaJson: unknown;
    payload: unknown;
    mode: FormPayloadMode;
    optionValuesByFieldId?: Record<string, readonly string[]>;
}): ValidateFormPayloadResult {
    const schemaParsed = formSchemaV1Schema.safeParse(input.schemaJson);
    if (!schemaParsed.success) {
        return { ok: false, errors: normalizeValidationErrors(schemaParsed.error) };
    }
    const schema = schemaParsed.data;

    const payloadParsed = formPayloadSchema.safeParse(input.payload);
    if (!payloadParsed.success) {
        return { ok: false, errors: normalizeValidationErrors(payloadParsed.error) };
    }
    const payload = payloadParsed.data;
    const mode = input.mode;
    const optionValuesByFieldId = input.optionValuesByFieldId;

    const fieldMap = buildFieldMap(schema);
    const errors: NormalizedValidationError[] = [];

    const topLevelGroupIds = new Set(
        schema.fields.filter((f): f is FormField & { type: "group" } => f.type === "group").map((f) => f.id)
    );

    for (const k of Object.keys(payload.values)) {
        if (!fieldMap.has(k)) {
            errors.push(err(["values", k], "Unknown field id", "custom"));
            continue;
        }
        const f = fieldMap.get(k)!;
        if (f.type === "group") {
            errors.push(err(["values", k], "Group field must not appear in values", "custom"));
        }
        if (f.type === "signature") {
            errors.push(err(["values", k], "Signature field must use payload.signatures", "custom"));
        }
    }

    if (payload.groups) {
        for (const gk of Object.keys(payload.groups)) {
            if (!topLevelGroupIds.has(gk)) {
                errors.push(err(["groups", gk], "Unknown or non-top-level group id", "custom"));
            }
        }
    }

    if (payload.signatures) {
        for (const sk of Object.keys(payload.signatures)) {
            if (!fieldMap.has(sk)) {
                errors.push(err(["signatures", sk], "Unknown field id", "custom"));
            } else if (fieldMap.get(sk)!.type !== "signature") {
                errors.push(err(["signatures", sk], "Not a signature field", "custom"));
            } else if (!isTopLevelFieldId(schema, sk)) {
                errors.push(
                    err(
                        ["signatures", sk],
                        "Nested signature fields must be provided on the parent group instance (row.signatures)",
                        "custom"
                    )
                );
            }
        }
    }

    /*
     * A SIGNATURE'S VALUE IS THE SIGNATURE.
     *
     * A condition may legitimately ask whether a signature was made — the Oregon CIS's "Update
     * signature — Date" applies only when there is an update signature — and a signature does not
     * live in `values`. Reading only `values` made such a field permanently hidden here while the
     * document renderer, which does consult `signatures`, considered it applicable. The two
     * disagreed, and the submission was refused for a value the platform had just written.
     *
     * `values` still wins where a field id appears in both, so nothing about existing conditions
     * changes: only signature ids, which never appear in `values`, resolve differently.
     */
    const signatureIds = new Set<string>();
    for (const field of schema.fields) {
        if (field.type === "signature") signatureIds.add(field.id);
        if (field.type === "group") {
            for (const child of (field as { fields: FormField[] }).fields) {
                if (child.type === "signature") signatureIds.add(child.id);
            }
        }
    }
    const rootValues = mergeLookup([payload.values]);
    const rootLookup = (fieldId: string): unknown => {
        const fromValues = rootValues(fieldId);
        if (fromValues !== undefined || !signatureIds.has(fieldId)) return fromValues;
        return payload.signatures?.[fieldId] ?? null;
    };

    for (const field of schema.fields) {
        if (field.type === "group") {
            validateGroupInstances(
                field,
                payload.groups?.[field.id],
                mode,
                optionValuesByFieldId,
                [payload.values],
                [],
                schema,
                errors
            );
            continue;
        }

        const vis = evaluateFieldVisibility(field.id, schema, rootLookup);

        if (field.type === "signature") {
            const sig = payload.signatures?.[field.id];
            if (!vis) {
                if (mode === "submit" && sig !== undefined) {
                    errors.push(err(["signatures", field.id], "Signature present but field is hidden", "custom"));
                }
                continue;
            }
            errors.push(...validateSignaturePayload(field, sig, mode, ["signatures", field.id]));
            continue;
        }

        const raw = payload.values[field.id];
        if (!vis) {
            if (mode === "submit" && violatesHiddenNonEmpty(field, raw)) {
                errors.push(err(["values", field.id], "Field is hidden and must be empty on submit", "custom"));
            }
            continue;
        }

        if (mode === "submit" && field.required) {
            if (isRequiredValueMissing(field, raw)) {
                errors.push(err(["values", field.id], "Required field missing", "custom"));
            }
        }

        if (
            raw !== undefined &&
            raw !== null &&
            raw !== "" &&
            !(field.type === "text" && typeof raw === "string" && raw.trim() === "")
        ) {
            errors.push(...validateScalarValue(field, raw, mode, optionValuesByFieldId, ["values", field.id]));
        }
    }

    errors.push(...validateCollectionPayloadContract(schema, payload, mode));

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return { ok: true, schema, payload: trimFormPayloadTextFields(schema, payload) };
}
