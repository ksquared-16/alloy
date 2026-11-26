"use client";

import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import PhoneInput from "@/components/ui/PhoneInput";
import { formatPhoneDisplay, isPhoneField } from "@/lib/phone/phonePresentation";
import { InlineFieldTokenText } from "@/components/forms/inline/InlineFieldTokenText";
import { sortDocumentBlocks, type DocumentBlock } from "@/lib/forms/documentComposition";
import { fieldById as schemaFieldById, resolveDocumentComposition } from "@/lib/forms/documentCompositionAuthoring";
import { fieldRegionPreviewLayoutClass, spacerPreviewHeight } from "@/lib/forms/documentCompositionPreviewPresentation";
import { collectInlineFieldTokenWarnings, resolveInlineFieldTokens } from "@/lib/forms/inlineFieldTokens";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type {
    FormPayload,
    FormPayloadGroupRow,
    FormPayloadSignature,
    NormalizedValidationError,
} from "@/lib/forms/validateSubmission";
import { evaluateFieldVisibility } from "@/lib/forms/validateSubmission";
import { isPlacementOnlyForParticipant } from "@/lib/forms/placementOnlyFields";
import { composeRuntimeRows, RUNTIME_FORM_CONTAINER_CLASS, runtimeCellSpanClass, runtimeRowClass } from "@/lib/forms/fieldLayoutChunks";
import { resolveFormDerivedValues } from "@/lib/forms/derived/resolveFormDerivedValues";
import { isCustomUnmappedField } from "@/lib/forms/formFieldAuthoringPresentation";
import { CUSTOM_UNMAPPED_FIELD_ADMIN_DESCRIPTION } from "@/lib/forms/systemFieldToFormField";
import { emptyPayload, ensureGroupRows, newRespondentAddedCollectionRow, setSignature, setTopLevelValue } from "./formEnginePayload";
import { groupFieldHasCollectionBinding } from "@/lib/fields/formsCollectionRepeatBinding";
import {
    resolveMarketingConsentLanguage,
    type IntakeMarketingConsentChoice,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";
import { MarketingConsentControl } from "./MarketingConsentControl";

export type FormEngineOptionChoice = { value: string; label: string };

export type FormEngineRendererProps = {
    schema: FormSchemaV1;
    payload: FormPayload;
    onChange: (next: FormPayload) => void;
    mode: "edit" | "readonly";
    optionValuesByFieldId?: Record<string, readonly string[]>;
    /** When set, select/multiselect use value + label (from public resolve). Falls back to optionValuesByFieldId. */
    optionChoicesByFieldId?: Record<string, readonly FormEngineOptionChoice[]>;
    variant?: "default" | "embed";
    /** When set (e.g. after submit), matching messages are shown next to groups and signatures. */
    validationErrors?: NormalizedValidationError[];
    /**
     * The family's answer to a Marketing consent question. It never lives in `values`: the owner sends
     * it as the consent evidence on submit. Absent (Studio Preview), the boxes keep a local answer that
     * is never sent anywhere.
     */
    marketingConsent?: {
        value: IntakeMarketingConsentChoice;
        onChange: (next: IntakeMarketingConsentChoice) => void;
        disabled?: boolean;
    };
};

function fieldById(fields: FormField[], id: string): FormField | undefined {
    return fields.find((f) => f.id === id);
}

function randomInstanceKey(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `i_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function errorsUnderPrefix(errors: NormalizedValidationError[] | undefined, prefix: string[]): NormalizedValidationError[] {
    if (!errors?.length || prefix.length === 0) return [];
    return errors.filter(
        (e) => prefix.length <= e.path.length && prefix.every((seg, i) => e.path[i] === seg)
    );
}

function fieldUsesEmailShape(field: FormField & { type: "text" }): boolean {
    const p = field.validate?.pattern ?? "";
    return (typeof p === "string" && p.includes("@")) || field.id.toLowerCase().includes("email");
}

function fieldUsesPhoneShape(field: FormField & { type: "text" }): boolean {
    const p = field.validate?.pattern;
    return isPhoneField({ id: field.id, pattern: typeof p === "string" ? p : null });
}

function titlesEquivalent(a: string, b: string): boolean {
    const left = a.trim();
    const right = b.trim();
    if (!left || !right) return false;
    return left.toLowerCase() === right.toLowerCase();
}

function publicFieldDescription(field: FormField, variant: "default" | "embed"): string {
    const desc =
        "description" in field && typeof (field as { description?: unknown }).description === "string"
            ? (field as { description?: string }).description!.trim()
            : "";
    if (!desc) return "";
    if (variant === "embed" && isCustomUnmappedField(field)) return "";
    if (variant === "embed" && desc === CUSTOM_UNMAPPED_FIELD_ADMIN_DESCRIPTION) return "";
    return desc;
}

export function FormEngineRenderer({
    schema,
    payload,
    onChange,
    mode,
    optionValuesByFieldId,
    optionChoicesByFieldId,
    variant = "default",
    validationErrors,
    marketingConsent,
}: FormEngineRendererProps) {
    const readonly = mode === "readonly";
    const [localConsent, setLocalConsent] = useState<IntakeMarketingConsentChoice>({ email: false, sms: false });

    /**
     * Show a field when the schema's own conditions say so AND it is not a placement-only
     * destination. Review keeps everything: a reviewer is reading the DOCUMENT, not filling it.
     */
    const shows = useCallback(
        (field: FormField) =>
            evaluateFieldVisibility(field.id, schema, (id) => payload.values[id]) &&
            (readonly || !isPlacementOnlyForParticipant(field, payload.values)),
        [schema, payload.values, readonly],
    );
    const loose = variant === "embed";
    // Label ↔ control association (P1-close): unique per renderer instance and per group row.
    const controlIdBase = useId();

    /*
     * CALCULATED ANSWERS ARE SHOWN, NOT ASKED.
     *
     * A field the schema declares `derived` (an age from a date of birth, the date the form is signed) is
     * filled by the platform — the submit path resolves it before validation. Rendering it as an input
     * asked the family for a number Alloy works out itself. It renders read-only here, with the value as
     * far as it can be known while the family is still answering. Nothing is written to the payload: the
     * submit path remains the one writer.
     */
    const derivedPreview = useMemo(
        () => resolveFormDerivedValues(schema, payload.values ?? {}, {}),
        [schema, payload.values],
    );

    const sectionModels = useMemo(() => {
        return schema.sections.map((s) => ({
            section: s,
            fields: s.field_ids.map((id) => fieldById(schema.fields, id)).filter(Boolean) as FormField[],
        }));
    }, [schema]);

    const renderScalarControl = useCallback(
        (
            field: FormField,
            cell: Record<string, unknown>,
            onCellChange: (fid: string, v: unknown) => void,
            errorPathPrefix?: string[]
        ) => {
            if (field.type === "group" || field.type === "signature") return null;
            if (field.type === "marketing_consent") {
                const language = resolveMarketingConsentLanguage(field);
                if (readonly) {
                    return (
                        <div className="space-y-1" data-form-field-marketing-consent={field.id}>
                            <p className="block text-sm font-medium text-neutral-800">{language.heading}</p>
                            <p className="text-xs text-neutral-600">
                                Answered as marketing consent ({language.version}) — recorded on the Processing case, not here.
                            </p>
                        </div>
                    );
                }
                return (
                    <MarketingConsentControl
                        className=""
                        language={language}
                        value={marketingConsent?.value ?? localConsent}
                        onChange={marketingConsent?.onChange ?? setLocalConsent}
                        disabled={marketingConsent?.disabled === true}
                    />
                );
            }
            const raw = cell[field.id];
            const fieldErrors = errorPathPrefix?.length
                ? errorsUnderPrefix(validationErrors, errorPathPrefix)
                : [];
            // One focusable control per field for these types: its label names it (screen readers, click-to-focus).
            const labelsControl = !readonly && !field.derived && ["text", "number", "date", "select"].includes(field.type);
            const controlId = `${controlIdBase}-${[...(errorPathPrefix ?? []), field.id].join("-")}`.replace(/[^A-Za-z0-9_-]/g, "_");
            const commonLabel = (
                <label
                    className={clsx("block text-sm font-medium text-neutral-800", loose && "text-[13px]")}
                    htmlFor={labelsControl ? controlId : undefined}
                >
                    {field.label}
                    {field.required ? <span className="text-red-600"> *</span> : null}
                </label>
            );
            const desc = publicFieldDescription(field, variant);
            const helpText = desc ? (
                <p className={clsx("text-xs text-neutral-600", loose && "text-[12px]")}>{desc}</p>
            ) : null;

            if (field.derived && !readonly) {
                const value = derivedPreview[field.id];
                const pending =
                    field.derived.kind === "execution_date"
                        ? "Filled in when you sign and submit."
                        : "Calculated once the dates it depends on are answered.";
                return (
                    <div className="space-y-1" data-form-field-calculated={field.id}>
                        <label className={clsx("block text-sm font-medium text-neutral-800", loose && "text-[13px]")}>
                            {field.label}
                        </label>
                        {helpText}
                        <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm text-neutral-800">
                            {value ?? <span className="text-neutral-500">{pending}</span>}
                        </div>
                        <p className="text-[11px] text-neutral-500">Calculated automatically.</p>
                    </div>
                );
            }

            if (readonly) {
                const display =
                    field.type === "multiselect" && Array.isArray(raw)
                        ? raw.join(", ")
                        : raw === undefined || raw === null || raw === ""
                          ? "—"
                          : field.type === "text" && fieldUsesPhoneShape(field)
                            ? formatPhoneDisplay(String(raw))
                            : String(raw);
                const preWrap = field.type === "text" && (field as { multiline?: boolean }).multiline;
                return (
                    <div className="space-y-1">
                        {commonLabel}
                        {helpText}
                        <div
                            className={clsx(
                                "rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm",
                                preWrap && "whitespace-pre-wrap"
                            )}
                        >
                            {display}
                        </div>
                    </div>
                );
            }

            switch (field.type) {
                case "text": {
                    const strVal = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
                    const emailLike = fieldUsesEmailShape(field);
                    const phoneLike = fieldUsesPhoneShape(field);
                    const inputType = loose && emailLike ? "email" : "text";
                    const autoComplete =
                        loose && emailLike ? "email" : loose && phoneLike ? "tel" : undefined;
                    const embedAutofillFix =
                        loose ?
                            {
                                onInput: (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                                    onCellChange(field.id, e.currentTarget.value);
                                },
                            }
                        :   {};
                    const ph = field.placeholder?.trim() || undefined;
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            {helpText}
                            {phoneLike && !field.multiline ?
                                <PhoneInput
                                    id={controlId}
                                    className={clsx(
                                        "w-full rounded border px-2 py-1.5 text-sm",
                                        fieldErrors.length ? "border-red-400 ring-1 ring-red-200" : "border-neutral-300"
                                    )}
                                    value={strVal}
                                    placeholder={ph ?? "(555) 555-5555"}
                                    onChange={(next) => onCellChange(field.id, next)}
                                />
                            : field.multiline && !emailLike ?
                                <textarea
                                    id={controlId}
                                    rows={5}
                                    className={clsx(
                                        "w-full rounded border px-2 py-1.5 text-sm",
                                        fieldErrors.length ? "border-red-400 ring-1 ring-red-200" : "border-neutral-300"
                                    )}
                                    value={strVal}
                                    placeholder={ph}
                                    onChange={(e) => onCellChange(field.id, e.target.value)}
                                    {...(embedAutofillFix as object)}
                                />
                            :   <input
                                    id={controlId}
                                    type={inputType}
                                    autoComplete={autoComplete}
                                    className={clsx(
                                        "w-full rounded border px-2 py-1.5 text-sm",
                                        fieldErrors.length ? "border-red-400 ring-1 ring-red-200" : "border-neutral-300"
                                    )}
                                    value={strVal}
                                    placeholder={ph}
                                    onChange={(e) => onCellChange(field.id, e.target.value)}
                                    {...embedAutofillFix}
                                    onBlur={
                                        loose && emailLike ?
                                            (e) => {
                                                const t = e.target.value.trim();
                                                if (t !== strVal) onCellChange(field.id, t);
                                            }
                                        :   undefined
                                    }
                                />
                            }
                            {fieldErrors.length ?
                                <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-700">
                                    {fieldErrors.map((er, i) => (
                                        <li key={i}>{er.message}</li>
                                    ))}
                                </ul>
                            : null}
                        </div>
                    );
                }
                case "number":
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            {helpText}
                            <input
                                id={controlId}
                                type="number"
                                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                                value={raw === undefined || raw === null || raw === "" ? "" : Number(raw)}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    onCellChange(field.id, v === "" ? undefined : Number(v));
                                }}
                            />
                        </div>
                    );
                case "date":
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            {helpText}
                            <input
                                id={controlId}
                                type="date"
                                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                                value={typeof raw === "string" ? raw : ""}
                                onChange={(e) => onCellChange(field.id, e.target.value)}
                            />
                        </div>
                    );
                case "boolean":
                    return (
                        <div className="space-y-1">
                            {helpText}
                            <label
                                htmlFor={`cb_${field.id}`}
                                className="flex cursor-pointer items-start gap-2 pt-1 text-sm font-medium text-neutral-800"
                            >
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={Boolean(raw)}
                                    onChange={(e) => onCellChange(field.id, e.target.checked)}
                                    id={`cb_${field.id}`}
                                />
                                <span>
                                    {field.label}
                                    {field.required ? <span className="text-red-600"> *</span> : null}
                                </span>
                            </label>
                        </div>
                    );
                case "select": {
                    const choices =
                        optionChoicesByFieldId?.[field.id] ??
                        (optionValuesByFieldId?.[field.id] ?? []).map((v) => ({ value: v, label: v }));
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            {helpText}
                            <select
                                id={controlId}
                                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                                value={typeof raw === "string" ? raw : ""}
                                onChange={(e) => onCellChange(field.id, e.target.value)}
                            >
                                <option value="">Select…</option>
                                {choices.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    );
                }
                case "multiselect": {
                    const choices =
                        optionChoicesByFieldId?.[field.id] ??
                        (optionValuesByFieldId?.[field.id] ?? []).map((v) => ({ value: v, label: v }));
                    const selected = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            {helpText}
                            <div className="flex flex-col gap-1 rounded border border-neutral-200 p-2">
                                {choices.map((o) => (
                                    <label key={o.value} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(o.value)}
                                            onChange={() => {
                                                const next = selected.includes(o.value)
                                                    ? selected.filter((x) => x !== o.value)
                                                    : [...selected, o.value];
                                                onCellChange(field.id, next);
                                            }}
                                        />
                                        {o.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                }
                case "file_ref":
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            {helpText}
                            <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-2 py-3 text-sm text-neutral-600">
                                File upload ships with documents integration. UUID:{" "}
                                {typeof raw === "string" ? raw || "—" : "—"}
                            </div>
                        </div>
                    );
                default:
                    return null;
            }
        },
        [loose, optionChoicesByFieldId, optionValuesByFieldId, readonly, validationErrors, derivedPreview, controlIdBase, marketingConsent, localConsent]
    );

    const renderSignatureControl = useCallback(
        (
            field: FormField & { type: "signature" },
            sig: FormPayloadSignature | undefined,
            updateSig: (next: FormPayloadSignature) => void,
            signatureErrorPrefix: string[]
        ) => {
            const cfg = field.signature ?? {};
            const requireAck = cfg.require_acknowledgment === true;
            const forceDrawn = cfg.require_drawn_asset === true;
            const inlineErrors = errorsUnderPrefix(validationErrors, signatureErrorPrefix);

            const commonLabel = (
                <label className={clsx("block text-sm font-medium text-neutral-800", loose && "text-[13px]")}>
                    {field.label}
                    {field.required ? <span className="text-red-600"> *</span> : null}
                </label>
            );

            if (readonly) {
                const summary =
                    sig?.kind === "typed"
                        ? `Typed: ${sig.typed_full_name ?? ""}`
                        : sig?.kind === "drawn"
                          ? sig.drawn_document_id
                              ? "Drawn signature (document on file)"
                              : "Drawn — pending document"
                          : "—";
                return (
                    <div className="space-y-1">
                        {commonLabel}
                        <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm">{summary}</div>
                    </div>
                );
            }

            const effectiveKind: "typed" | "drawn" = forceDrawn ? sig?.kind ?? "typed" : "typed";

            const patchTyped = (typed: string) =>
                updateSig({
                    kind: "typed",
                    typed_full_name: typed,
                    drawn_document_id: undefined,
                    ...(requireAck ? { acknowledged_at: sig?.acknowledged_at } : {}),
                });

            const patchDrawn = (docId: string | undefined) =>
                updateSig({
                    kind: "drawn",
                    drawn_document_id: docId,
                    typed_full_name: undefined,
                    ...(requireAck ? { acknowledged_at: sig?.acknowledged_at } : {}),
                });

            const setAcknowledged = (checked: boolean) => {
                if (effectiveKind === "drawn") {
                    updateSig({
                        kind: "drawn",
                        drawn_document_id: sig?.drawn_document_id,
                        typed_full_name: undefined,
                        acknowledged_at: checked ? new Date().toISOString() : undefined,
                    });
                } else {
                    updateSig({
                        kind: "typed",
                        typed_full_name: sig?.typed_full_name ?? "",
                        drawn_document_id: undefined,
                        acknowledged_at: checked ? new Date().toISOString() : undefined,
                    });
                }
            };

            return (
                <div className="space-y-2 rounded border border-neutral-200 p-3">
                    {commonLabel}
                    {forceDrawn ? (
                        <div className="flex flex-wrap gap-3 text-sm">
                            <label className="flex items-center gap-1.5">
                                <input
                                    type="radio"
                                    checked={effectiveKind === "typed"}
                                    onChange={() =>
                                        updateSig({
                                            kind: "typed",
                                            typed_full_name: sig?.typed_full_name ?? "",
                                            drawn_document_id: undefined,
                                            ...(requireAck ? { acknowledged_at: sig?.acknowledged_at } : {}),
                                        })
                                    }
                                />
                                Type full name
                            </label>
                            <label className="flex items-center gap-1.5">
                                <input
                                    type="radio"
                                    checked={effectiveKind === "drawn"}
                                    onChange={() =>
                                        updateSig({
                                            kind: "drawn",
                                            drawn_document_id: sig?.drawn_document_id,
                                            typed_full_name: undefined,
                                            ...(requireAck ? { acknowledged_at: sig?.acknowledged_at } : {}),
                                        })
                                    }
                                />
                                Draw (document ID)
                            </label>
                        </div>
                    ) : null}
                    {effectiveKind === "typed" ? (
                        <input
                            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                            placeholder="Type your full name"
                            value={sig?.typed_full_name ?? ""}
                            onChange={(e) => patchTyped(e.target.value)}
                        />
                    ) : (
                        <div className="space-y-2 text-sm text-neutral-700">
                            <p>Use your organization&apos;s process to capture a drawn signature, then link the stored document.</p>
                            <details className="rounded border border-neutral-200 bg-neutral-50 p-2">
                                <summary className="cursor-pointer text-xs font-medium text-neutral-800">
                                    Technical: drawn document ID
                                </summary>
                                <input
                                    className="mt-2 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                                    placeholder="Document UUID"
                                    value={sig?.drawn_document_id ?? ""}
                                    onChange={(e) => patchDrawn(e.target.value || undefined)}
                                    aria-label="Drawn document UUID"
                                />
                            </details>
                        </div>
                    )}
                    {requireAck ? (
                        <label className="flex items-start gap-2 text-sm text-neutral-800">
                            <input
                                type="checkbox"
                                className="mt-0.5 shrink-0"
                                checked={Boolean(sig?.acknowledged_at)}
                                onChange={(e) => setAcknowledged(e.target.checked)}
                            />
                            <span>I acknowledge this electronic signature applies to this form.</span>
                        </label>
                    ) : null}
                    {inlineErrors.length ? (
                        <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-700">
                            {inlineErrors.map((er, i) => (
                                <li key={i}>{er.message}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            );
        },
        [loose, readonly, validationErrors]
    );

    const renderGroup = useCallback(
        (field: FormField & { type: "group" }) => {
            const rep = field.repeat ?? { min: 0, max: undefined };
            const rows = payload.groups?.[field.id] ?? [];
            const vis = shows(field);
            if (!vis) return null;

            const groupInlineErrors = errorsUnderPrefix(validationErrors, [field.id]);
            const minEntries = Math.max(rep.min, field.required ? 1 : 0);

            const updateRows = (next: FormPayloadGroupRow[]) => {
                onChange(ensureGroupRows(payload, field.id, next));
            };

            const renderNestedGroup = (
                child: FormField & { type: "group" },
                row: FormPayloadGroupRow,
                rowIdx: number,
                allRows: FormPayloadGroupRow[]
            ) => {
                const nestedRows = row.groups?.[child.id] ?? [];
                const updateNested = (nn: FormPayloadGroupRow[]) => {
                    const next = [...allRows];
                    next[rowIdx] = {
                        ...row,
                        groups: { ...(row.groups ?? {}), [child.id]: nn },
                    };
                    updateRows(next);
                };
                const nrep = child.repeat ?? { min: 0, max: undefined };
                const nestedGroupErrors = errorsUnderPrefix(validationErrors, [field.id, String(rowIdx), child.id]);
                return (
                    <div key={child.id} className="ml-2 border-l border-neutral-200 pl-3">
                        <div className="text-sm font-semibold text-neutral-700">{child.label}</div>
                        {nestedGroupErrors.length ? (
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-red-700">
                                {nestedGroupErrors.map((er, i) => (
                                    <li key={i}>{er.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        {nestedRows.map((nr, j) => (
                            <div key={nr.instance_key} className="mt-2 space-y-2 rounded bg-neutral-50 p-2">
                                {child.fields.map((nf) => {
                                    const getVal = (fid: string) =>
                                        fid in nr.values ? nr.values[fid] : payload.values[fid];
                                    if (!shows(nf)) return null;
                                    if (nf.type === "signature") {
                                        const sig = nr.signatures?.[nf.id];
                                        const sigErrPrefix = [field.id, String(rowIdx), child.id, String(j), "signatures", nf.id];
                                        return (
                                            <div key={nf.id}>
                                                {renderSignatureControl(nf, sig, (nextSig) => {
                                                    const nrNext = [...nestedRows];
                                                    nrNext[j] = {
                                                        ...nr,
                                                        signatures: { ...(nr.signatures ?? {}), [nf.id]: nextSig },
                                                    };
                                                    updateNested(nrNext);
                                                }, sigErrPrefix)}
                                            </div>
                                        );
                                    }
                                    if (nf.type === "group") {
                                        return (
                                            <div key={nf.id} className="text-xs text-neutral-500">
                                                Deeply nested groups are not rendered in V1 UI.
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={nf.id}>
                                            {renderScalarControl(
                                                nf,
                                                nr.values,
                                                (fid, v) => {
                                                    const nrNext = [...nestedRows];
                                                    nrNext[j] = { ...nr, values: { ...nr.values, [fid]: v } };
                                                    updateNested(nrNext);
                                                },
                                                [field.id, String(rowIdx), child.id, String(j), "values", nf.id]
                                            )}
                                        </div>
                                    );
                                })}
                                {!readonly && nestedRows.length > nrep.min ? (
                                    <button
                                        type="button"
                                        className="text-xs text-red-700 underline"
                                        onClick={() => updateNested(nestedRows.filter((_, ii) => ii !== j))}
                                    >
                                        Remove this entry
                                    </button>
                                ) : null}
                            </div>
                        ))}
                        {!readonly && (nrep.max === undefined || nestedRows.length < nrep.max) ? (
                            <button
                                type="button"
                                className="mt-2 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 shadow-sm"
                                onClick={() =>
                                    updateNested([
                                        ...nestedRows,
                                        { instance_key: randomInstanceKey(), values: {}, signatures: {}, groups: {} },
                                    ])
                                }
                            >
                                Add item
                            </button>
                        ) : null}
                    </div>
                );
            };

            return (
                <div key={field.id} className="space-y-3">
                    <div className={clsx("text-base font-semibold text-neutral-900", loose && "text-[15px]")}>
                        {field.label}
                        {field.required ? <span className="text-red-600"> *</span> : null}
                    </div>
                    {!readonly && minEntries > 0 ? (
                        <p className={clsx("text-sm text-neutral-600", loose && "text-[13px]")}>
                            Add at least {minEntries} {minEntries === 1 ? "entry" : "entries"}.
                            {rows.length === 0
                                ? " Use Add item below to start."
                                : rows.length < minEntries
                                  ? " Use Add item until the minimum is met."
                                  : null}
                        </p>
                    ) : null}
                    {groupInlineErrors.length ? (
                        <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-700">
                            {groupInlineErrors.map((er, i) => (
                                <li key={i}>{er.message}</li>
                            ))}
                        </ul>
                    ) : null}
                    {rows.length === 0 && readonly ? (
                        <div className="text-sm text-neutral-500">No entries</div>
                    ) : null}
                    {rows.map((row, idx) => (
                        <div key={row.instance_key} className="space-y-3 rounded-lg border border-neutral-200 p-3">
                            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                                {field.label} #{idx + 1}
                            </div>
                            {composeRuntimeRows(field.fields.filter((child) => shows(child))).map((childRow) => (
                            <div key={childRow.map((c) => c.id).join("|")} className={runtimeRowClass(childRow)}>
                            {childRow.map((child) => {
                                const getVal = (fid: string) =>
                                    fid in row.values ? row.values[fid] : payload.values[fid];
                                if (child.type === "group") {
                                    return renderNestedGroup(child, row, idx, rows);
                                }
                                if (child.type === "signature") {
                                    const sig = row.signatures?.[child.id];
                                    const sigErrPrefix = [field.id, String(idx), "signatures", child.id];
                                    return (
                                        <div key={child.id} className={childRow.length > 1 ? runtimeCellSpanClass(child) : undefined}>
                                            {renderSignatureControl(child, sig, (nextSig) => {
                                                const next = [...rows];
                                                next[idx] = {
                                                    ...row,
                                                    signatures: { ...(row.signatures ?? {}), [child.id]: nextSig },
                                                };
                                                updateRows(next);
                                            }, sigErrPrefix)}
                                        </div>
                                    );
                                }
                                return (
                                    <div key={child.id} className={childRow.length > 1 ? runtimeCellSpanClass(child) : undefined}>
                                        {renderScalarControl(
                                            child,
                                            row.values,
                                            (fid, v) => {
                                                const next = [...rows];
                                                next[idx] = { ...row, values: { ...row.values, [fid]: v } };
                                                updateRows(next);
                                            },
                                            [field.id, String(idx), "values", child.id]
                                        )}
                                    </div>
                                );
                            })}
                            </div>
                            ))}
                            {!readonly && rows.length > rep.min ? (
                                <button
                                    type="button"
                                    className="text-xs text-red-700 underline"
                                    onClick={() => updateRows(rows.filter((_, i) => i !== idx))}
                                >
                                    Remove this entry
                                </button>
                            ) : null}
                        </div>
                    ))}
                    {!readonly && (rep.max === undefined || rows.length < rep.max) ? (
                        <button
                            type="button"
                            className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-medium text-white shadow-sm"
                            onClick={() =>
                                updateRows([
                                    ...rows,
                                    groupFieldHasCollectionBinding(field) && field.collection_binding
                                        ? newRespondentAddedCollectionRow(field.collection_binding)
                                        : {
                                              instance_key: randomInstanceKey(),
                                              values: {},
                                              groups: {},
                                              signatures: {},
                                          },
                                ])
                            }
                        >
                            Add item
                        </button>
                    ) : null}
                </div>
            );
        },
        [onChange, payload, readonly, renderScalarControl, renderSignatureControl, schema, validationErrors]
    );

    const documentComposition = useMemo(
        () => (schema.document_composition ? resolveDocumentComposition(schema) : null),
        [schema]
    );

    const inlineTokenWarnings = useMemo(() => {
        if (!documentComposition || !readonly) return [];
        return collectInlineFieldTokenWarnings(schema, payload, optionChoicesByFieldId);
    }, [documentComposition, readonly, schema, payload, optionChoicesByFieldId]);

    const renderFieldList = useCallback(
        (fields: FormField[]) =>
            composeRuntimeRows(
                fields.filter((field) => shows(field))
            ).map((row, ri) => (
                <div
                    key={`row-${ri}-${row.map((f) => f.id).join("-")}`}
                    className={runtimeRowClass(row)}
                >
                    {row.map((field) => {
                        if (field.type === "group") {
                            return <div key={field.id}>{renderGroup(field)}</div>;
                        }
                        if (field.type === "signature") {
                            const sig = payload.signatures?.[field.id];
                            return (
                                <div key={field.id}>
                                    {renderSignatureControl(field, sig, (nextSig) =>
                                        onChange(setSignature(payload, field.id, nextSig)), ["signatures", field.id]
                                    )}
                                </div>
                            );
                        }
                        return (
                            <div key={field.id} className={row.length > 1 ? runtimeCellSpanClass(field) : undefined}>
                                {renderScalarControl(
                                    field,
                                    payload.values,
                                    (fid, v) => {
                                        onChange(setTopLevelValue(payload, fid, v));
                                    },
                                    ["values", field.id]
                                )}
                            </div>
                        );
                    })}
                </div>
            )),
        [onChange, payload, renderGroup, renderScalarControl, renderSignatureControl, schema]
    );

    const renderCompositionBlock = useCallback(
        (block: DocumentBlock) => {
            switch (block.type) {
                case "heading": {
                    const Tag = block.level === "h1" ? "h1" : block.level === "h3" ? "h3" : "h2";
                    const size =
                        block.level === "h1" ? "text-xl font-semibold"
                        : block.level === "h3" ? "text-base font-semibold"
                        : "text-lg font-medium";
                    const resolution = resolveInlineFieldTokens(block.content, {
                        schema,
                        payload,
                        optionChoicesByFieldId,
                    });
                    const headingText =
                        typeof block.content === "string" ? block.content.trim() : String(block.content ?? "").trim();
                    if (block.level === "h1" && headingText && titlesEquivalent(headingText, schema.title ?? "")) {
                        return null;
                    }
                    if (block.level !== "h1" && headingText && titlesEquivalent(headingText, schema.title ?? "")) {
                        return null;
                    }
                    return (
                        <Tag
                            key={block.id}
                            className={clsx(size, "text-neutral-900", loose && block.level !== "h1" && "text-base")}
                            data-testid={`form-composition-heading-${block.id}`}
                        >
                            <InlineFieldTokenText resolution={resolution} mode="runtime" />
                        </Tag>
                    );
                }
                case "text": {
                    const resolution = resolveInlineFieldTokens(block.content, {
                        schema,
                        payload,
                        optionChoicesByFieldId,
                    });
                    return (
                        <p
                            key={block.id}
                            className={clsx("text-sm leading-relaxed text-neutral-800", loose && "text-[13px]")}
                            data-testid={`form-composition-text-${block.id}`}
                        >
                            <InlineFieldTokenText resolution={resolution} mode="runtime" />
                        </p>
                    );
                }
                case "field_region": {
                    const layout = block.layout ?? "one_column";
                    const fields = block.field_ids
                        .map((fid) => schemaFieldById(schema, fid))
                        .filter(Boolean) as FormField[];
                    const visibleFields = fields.filter((field) => shows(field));
                    const regionTitle = block.title?.trim() ?? "";
                    const showRegionTitle =
                        Boolean(regionTitle) && !titlesEquivalent(regionTitle, schema.title ?? "");
                    return (
                        <section key={block.id} className="space-y-3" data-testid={`form-composition-region-${block.id}`}>
                            {showRegionTitle ?
                                <h2 className={clsx("text-lg font-medium text-neutral-800", loose && "text-base")}>
                                    {block.title}
                                </h2>
                            :   null}
                            {block.helper ?
                                <p className={clsx("text-xs text-neutral-600", loose && "text-[12px]")}>{block.helper}</p>
                            :   null}
                            <div className={clsx("gap-4", fieldRegionPreviewLayoutClass(layout))}>
                                {visibleFields.map((field) => {
                                    if (field.type === "group") {
                                        return <div key={field.id}>{renderGroup(field)}</div>;
                                    }
                                    if (field.type === "signature") {
                                        const sig = payload.signatures?.[field.id];
                                        return (
                                            <div key={field.id}>
                                                {renderSignatureControl(field, sig, (nextSig) =>
                                                    onChange(setSignature(payload, field.id, nextSig)), [
                                                        "signatures",
                                                        field.id,
                                                    ]
                                                )}
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={field.id}>
                                            {renderScalarControl(
                                                field,
                                                payload.values,
                                                (fid, v) => {
                                                    onChange(setTopLevelValue(payload, fid, v));
                                                },
                                                ["values", field.id]
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                }
                case "signature": {
                    const boundField =
                        block.field_id ? schemaFieldById(schema, block.field_id) : undefined;
                    if (boundField?.type === "signature") {
                        const sig = payload.signatures?.[boundField.id];
                        return (
                            <div key={block.id} data-testid={`form-composition-signature-${block.id}`}>
                                {block.label ?
                                    <p className="mb-1 text-sm font-medium text-neutral-800">{block.label}</p>
                                :   null}
                                {renderSignatureControl(boundField, sig, (nextSig) =>
                                    onChange(setSignature(payload, boundField.id, nextSig)), ["signatures", boundField.id]
                                )}
                            </div>
                        );
                    }
                    return (
                        <div key={block.id} className="rounded border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500">
                            {block.label ?? "Signature"}
                        </div>
                    );
                }
                case "divider":
                    return (
                        <hr
                            key={block.id}
                            className={clsx(
                                "border-t",
                                block.style === "dashed" ? "border-dashed border-neutral-300"
                                : block.style === "brand" ? "border-blue-400"
                                : "border-neutral-200"
                            )}
                            data-testid={`form-composition-divider-${block.id}`}
                        />
                    );
                case "spacer":
                    return (
                        <div
                            key={block.id}
                            className={spacerPreviewHeight(block.size)}
                            data-testid={`form-composition-spacer-${block.id}`}
                            aria-hidden
                        />
                    );
                case "image":
                    return (
                        <div
                            key={block.id}
                            className="flex h-12 items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-xs text-neutral-500"
                            data-testid={`form-composition-image-${block.id}`}
                        >
                            {block.alt ?? "Image"}
                        </div>
                    );
                default:
                    return null;
            }
        },
        [loose, onChange, optionChoicesByFieldId, payload, renderGroup, renderScalarControl, renderSignatureControl, schema]
    );

    if (documentComposition) {
        const blocks = sortDocumentBlocks(documentComposition.blocks);
        const compositionHasTitleHeading = blocks.some(
            (block) =>
                block.type === "heading" &&
                block.level === "h1" &&
                typeof block.content === "string" &&
                titlesEquivalent(block.content, schema.title ?? "")
        );
        return (
            <div className={clsx(RUNTIME_FORM_CONTAINER_CLASS, "mx-auto max-w-xl space-y-8", loose && "max-w-full px-3 py-4")}>
                {!compositionHasTitleHeading ?
                    <header>
                        <h1 className={clsx("text-xl font-semibold text-neutral-900", loose && "text-lg")}>
                            {schema.title}
                        </h1>
                    </header>
                :   null}
                {readonly && inlineTokenWarnings.length > 0 ?
                    <div
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                        data-testid="form-inline-token-warnings"
                    >
                        <p className="font-semibold">Inline field references need attention</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                            {inlineTokenWarnings.flatMap((row) =>
                                row.warnings.map((w) => <li key={`${row.blockId}-${w}`}>{w}</li>)
                            )}
                        </ul>
                    </div>
                :   null}
                <div className="space-y-6">{blocks.map((block) => renderCompositionBlock(block))}</div>
            </div>
        );
    }

    return (
        <div className={clsx(RUNTIME_FORM_CONTAINER_CLASS, "mx-auto max-w-xl space-y-8", loose && "max-w-full px-3 py-4")}>
            <header>
                <h1 className={clsx("text-xl font-semibold text-neutral-900", loose && "text-lg")}>{schema.title}</h1>
            </header>
            {sectionModels.map(({ section, fields }) => (
                <section key={section.id} className="space-y-4">
                    {section.title && !titlesEquivalent(section.title, schema.title ?? "") ? (
                        <h2 className={clsx("text-lg font-medium text-neutral-800", loose && "text-base")}>
                            {section.title}
                        </h2>
                    ) : null}
                    <div className="space-y-4">
                        {renderFieldList(fields)}
                    </div>
                </section>
            ))}
        </div>
    );
}

export { emptyPayload };
