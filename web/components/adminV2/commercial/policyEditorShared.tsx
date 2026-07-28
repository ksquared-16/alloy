"use client";

import {
    COMMERCIAL_POLICY_CATEGORY_LABELS,
    COMMERCIAL_POLICY_REGISTRY,
    commercialPolicyTypesByCategory,
    commercialPolicyValueSummary,
    type CommercialPolicyType,
    type PolicyField,
} from "@/lib/commercial/execution/policy/policyTypes";
import type { CommercialPolicyApiRow } from "@/app/api/admin/commercial/policies/route";
import {
    LocationMultiSelect,
    type LocationApplicabilityMode,
} from "@/components/adminV2/settings/configurationRuntime/LocationMultiSelect";
import {
    locationApplicabilityFromMetadata,
    POLICY_LOCATION_IDS_META_KEY,
} from "@/lib/financials/applicability/locationApplicability";

export { POLICY_LOCATION_IDS_META_KEY };

export type ProgramLite = { key: string; label: string };
export type LocationLite = { id: string; name: string };
export type OfferingLite = { id: string; label: string; program_key: string };
export type VariantLite = { id: string; label: string; offering_id: string };

/** "location" retained for backward compat with legacy rows; no longer offered as a primary scope option. */
export type PolicyScopeType = "org" | "location" | "program" | "offering" | "variant";

export const POLICY_SCOPE_OPTIONS: { value: PolicyScopeType; label: string; hint: string }[] = [
    { value: "org", label: "Whole organization", hint: "Applied across the organization" },
    { value: "program", label: "One program", hint: "Applied to a single program" },
    { value: "offering", label: "One Tuition Plan", hint: "Applied to a Tuition Plan" },
    { value: "variant", label: "One Enrollment Commitment", hint: "Applied to a specific enrollment commitment" },
];

const inputCls =
    "mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1.5 text-sm text-alloy-midnight placeholder:text-alloy-midnight/38 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20";
const labelCls = "text-xs font-medium text-alloy-midnight/70";

export type PolicyFormState = {
    id: string | null;
    policy_type: CommercialPolicyType;
    label: string;
    values: Record<string, string>;
    scope_type: PolicyScopeType;
    location_id: string;
    program_key: string;
    offering_id: string;
    variant_id: string;
    effective_start: string;
    effective_end: string;
    is_active: boolean;
    locationMode: LocationApplicabilityMode;
    locationIds: string[];
};

export function emptyPolicyForm(type: CommercialPolicyType = "discount"): PolicyFormState {
    return {
        id: null,
        policy_type: type,
        label: "",
        values: {},
        scope_type: "org",
        location_id: "",
        program_key: "",
        offering_id: "",
        variant_id: "",
        effective_start: "",
        effective_end: "",
        is_active: true,
        locationMode: "all",
        locationIds: [],
    };
}

export function buildPolicyValuePayload(
    type: CommercialPolicyType,
    values: Record<string, string>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of COMMERCIAL_POLICY_REGISTRY[type].fields) {
        const raw = values[f.key];
        if (f.showWhen && !f.showWhen.in.includes(String(values[f.showWhen.field] ?? ""))) continue;
        if (f.control === "select") out[f.key] = raw ?? "";
        else if (f.control === "yesno") out[f.key] = raw === "yes" || raw === "true";
        else if (f.control === "money") out[f.key] = Math.round((Number(raw) || 0) * 100);
        else out[f.key] = Math.round(Number(raw) || 0);
    }
    return out;
}

export function policyValuesFromRow(row: CommercialPolicyApiRow): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of COMMERCIAL_POLICY_REGISTRY[row.policy_type].fields) {
        const v = row.value[f.key];
        if (v == null) continue;
        if (f.control === "money") out[f.key] = String(Number(v) / 100);
        else if (f.control === "yesno") out[f.key] = v ? "yes" : "no";
        else out[f.key] = String(v);
    }
    return out;
}

export function policyFormFromRow(row: CommercialPolicyApiRow): PolicyFormState {
    // Legacy "location" scoped policies are coerced to org scope; the specific
    // location becomes the seed selection for the Locations multi-select instead.
    const isLegacyLocationScope = row.scope_type === "location";
    const locationApplicability = locationApplicabilityFromMetadata(
        row.metadata,
        POLICY_LOCATION_IDS_META_KEY,
        isLegacyLocationScope ? row.location_id : null,
    );
    return {
        id: row.id,
        policy_type: row.policy_type,
        label: row.label ?? "",
        values: policyValuesFromRow(row),
        scope_type: isLegacyLocationScope ? "org" : (row.scope_type as PolicyScopeType),
        location_id: row.location_id ?? "",
        program_key: row.program_key ?? "",
        offering_id: row.offering_id ?? "",
        variant_id: row.variant_id ?? "",
        effective_start: row.effective_start && row.effective_start !== "2000-01-01" ? row.effective_start : "",
        effective_end: row.effective_end ?? "",
        is_active: row.is_active,
        locationMode: locationApplicability.mode,
        locationIds: locationApplicability.locationIds,
    };
}

function FieldInput({ field, value, onChange }: { field: PolicyField; value: string; onChange: (v: string) => void }) {
    if (field.control === "select") {
        return (
            <div>
                <label className={labelCls}>{field.label}</label>
                <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {(field.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {field.help ? <p className="mt-0.5 text-[11px] text-alloy-midnight/40">{field.help}</p> : null}
            </div>
        );
    }
    if (field.control === "yesno") {
        return (
            <div className="flex items-center gap-2 pt-5">
                <input
                    id={`f-${field.key}`}
                    type="checkbox"
                    checked={value === "yes" || value === "true"}
                    onChange={(e) => onChange(e.target.checked ? "yes" : "no")}
                    className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-bend-pine focus:ring-alloy-bend-pine/30"
                />
                <label htmlFor={`f-${field.key}`} className="text-sm text-alloy-midnight/70">
                    {field.label}
                </label>
            </div>
        );
    }
    const prefix = field.control === "money" ? "$" : null;
    return (
        <div>
            <label className={labelCls}>{field.label}</label>
            <div className="relative">
                {prefix ?
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-alloy-midnight/45">
                        {prefix}
                    </span>
                :   null}
                <input
                    type="number"
                    min="0"
                    step={field.control === "money" ? "0.01" : "1"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.control === "money" ? "0.00" : "0"}
                    className={`${inputCls} ${prefix ? "pl-5" : ""} ${field.suffix ? "pr-8" : ""}`}
                />
                {field.suffix ?
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-alloy-midnight/45">
                        {field.suffix}
                    </span>
                :   null}
            </div>
            {field.help ? <p className="mt-0.5 text-[11px] text-alloy-midnight/40">{field.help}</p> : null}
        </div>
    );
}

export function PolicyEditorForm({
    form,
    setForm,
    programs,
    locations,
    offerings,
    variants,
    onSave,
    onCancel,
    saving,
    focusProgramKey,
}: {
    form: PolicyFormState;
    setForm: (f: PolicyFormState | null) => void;
    programs: ProgramLite[];
    locations: LocationLite[];
    offerings: OfferingLite[];
    variants: VariantLite[];
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    focusProgramKey?: string;
}) {
    const def = COMMERCIAL_POLICY_REGISTRY[form.policy_type];
    const setVal = (k: string, v: string) => setForm({ ...form, values: { ...form.values, [k]: v } });
    const visibleFields = def.fields.filter(
        (f) => !f.showWhen || f.showWhen.in.includes(String(form.values[f.showWhen.field] ?? "")),
    );
    const previewValue = buildPolicyValuePayload(form.policy_type, form.values);

    return (
        <div className="rounded-lg border border-alloy-stone/25 bg-white p-5 max-w-2xl" data-testid="policy-editor-form">
            <h3 className="text-sm font-semibold text-alloy-midnight">{form.id ? "Edit policy" : "New policy"}</h3>

            {!form.id ?
                <div className="mt-3 space-y-4" data-testid="policy-editor-type-groups">
                    <p className="text-xs text-alloy-midnight/55">
                        Choose a specialized policy type. Name it for the rule it describes (e.g. Registration Fee
                        Waiver), not a generic “policy.”
                    </p>
                    {commercialPolicyTypesByCategory().map((group) => (
                        <div key={group.category}>
                            <div className="mb-1.5">
                                <span className={labelCls}>{group.label}</span>
                                <p className="text-[11px] text-alloy-midnight/45">{group.help}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {group.types.map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() =>
                                            setForm({
                                                ...emptyPolicyForm(t),
                                                scope_type: form.scope_type,
                                                location_id: form.location_id,
                                                program_key: form.program_key,
                                                offering_id: form.offering_id,
                                                variant_id: form.variant_id,
                                                locationMode: form.locationMode,
                                                locationIds: form.locationIds,
                                            })
                                        }
                                        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                                            form.policy_type === t
                                                ? "border-alloy-bend-pine bg-alloy-bend-pine/5 text-alloy-midnight"
                                                : "border-alloy-stone/25 text-alloy-midnight/70 hover:border-alloy-bend-pine/40"
                                        }`}
                                        data-testid={`policy-editor-type-${t}`}
                                    >
                                        <span className="block font-medium">{COMMERCIAL_POLICY_REGISTRY[t].label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            :   null}
            <p className="mt-2 text-xs text-alloy-midnight/50">
                <span className="font-medium text-alloy-midnight/60">
                    {COMMERCIAL_POLICY_CATEGORY_LABELS[def.category]}
                </span>
                {" · "}
                {def.description} <span className="italic text-alloy-midnight/40">e.g. {def.example}</span>
            </p>

            <div className="mt-3">
                <label className={labelCls}>
                    Rule name <span className="text-alloy-midnight/35">(recommended)</span>
                </label>
                <input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="e.g. Registration Fee Waiver"
                    className={inputCls}
                    data-testid="policy-editor-label"
                />
            </div>

            {visibleFields.length > 0 ?
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {visibleFields.map((f) => (
                        <FieldInput
                            key={`${f.key}:${f.control}`}
                            field={f}
                            value={form.values[f.key] ?? ""}
                            onChange={(v) => setVal(f.key, v)}
                        />
                    ))}
                </div>
            :   null}

            <div className="mt-4 border-t border-alloy-stone/15 pt-3">
                <label className={labelCls}>Applied to</label>
                <p className="mb-1.5 text-[11px] text-alloy-midnight/45">
                    Which commercial object this rule attaches to. Fees and add-ons as direct targets come later;
                    use Program or Tuition Plan for product-scoped rules today.
                </p>
                <select
                    value={form.scope_type}
                    onChange={(e) =>
                        setForm({
                            ...form,
                            scope_type: e.target.value as PolicyScopeType,
                            location_id: "",
                            program_key: focusProgramKey ?? "",
                            offering_id: "",
                            variant_id: "",
                        })
                    }
                    className={inputCls}
                    data-testid="policy-editor-scope"
                >
                    {POLICY_SCOPE_OPTIONS.filter(
                        (scope) =>
                            !focusProgramKey
                            || scope.value === "program"
                            || scope.value === "offering"
                            || scope.value === "variant",
                    ).map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
                {(form.scope_type === "program" || form.scope_type === "offering" || form.scope_type === "variant")
                    && !focusProgramKey ?
                    <select
                        value={form.program_key}
                        onChange={(e) =>
                            setForm({ ...form, program_key: e.target.value, offering_id: "", variant_id: "" })
                        }
                        className={`${inputCls} mt-2`}
                    >
                        <option value="">Select a program…</option>
                        {programs.map((p) => (
                            <option key={p.key} value={p.key}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                :   null}
                {focusProgramKey
                    && (form.scope_type === "program" || form.scope_type === "offering" || form.scope_type === "variant") ?
                    <p className="mt-2 text-xs font-medium text-alloy-midnight/60">
                        {programs.find((program) => program.key === focusProgramKey)?.label ?? "Selected Program"}
                    </p>
                :   null}
                {(form.scope_type === "offering" || form.scope_type === "variant") && form.program_key ?
                    <select
                        value={form.offering_id}
                        onChange={(e) => setForm({ ...form, offering_id: e.target.value, variant_id: "" })}
                        className={`${inputCls} mt-2`}
                    >
                        <option value="">Select a Tuition Plan…</option>
                        {offerings.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                :   null}
                {form.scope_type === "variant" && form.offering_id ?
                    <select
                        value={form.variant_id}
                        onChange={(e) => setForm({ ...form, variant_id: e.target.value })}
                        className={`${inputCls} mt-2`}
                    >
                        <option value="">Select an Enrollment Commitment…</option>
                        {variants.map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.label}
                            </option>
                        ))}
                    </select>
                :   null}
            </div>

            <div className="mt-4 border-t border-alloy-stone/15 pt-3">
                <LocationMultiSelect
                    locations={locations}
                    mode={form.locationMode}
                    selectedIds={form.locationIds}
                    onModeChange={(mode) => setForm({ ...form, locationMode: mode })}
                    onSelectedIdsChange={(ids) => setForm({ ...form, locationIds: ids })}
                    testId="policy-editor-locations"
                    legend="Locations"
                />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                    <label className={labelCls}>
                        Starts <span className="text-alloy-midnight/35">(optional)</span>
                    </label>
                    <input
                        type="date"
                        value={form.effective_start}
                        onChange={(e) => setForm({ ...form, effective_start: e.target.value })}
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>
                        Ends <span className="text-alloy-midnight/35">(optional)</span>
                    </label>
                    <input
                        type="date"
                        value={form.effective_end}
                        onChange={(e) => setForm({ ...form, effective_end: e.target.value })}
                        className={inputCls}
                    />
                </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
                <input
                    id="pol-active"
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-bend-pine focus:ring-alloy-bend-pine/30"
                />
                <label htmlFor="pol-active" className="text-sm text-alloy-midnight/70">
                    Active
                </label>
            </div>

            <div className="mt-4 rounded-md bg-alloy-stone/15 px-3 py-2 text-xs text-alloy-midnight/65">
                <span className="font-medium text-alloy-midnight/75">Preview:</span>{" "}
                {commercialPolicyValueSummary(form.policy_type, previewValue) || "—"}
            </div>

            <div className="mt-4 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                    data-testid="policy-editor-save"
                >
                    {saving ? "Saving…" : form.id ? "Save changes" : "Create policy"}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/60 hover:text-alloy-midnight"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
