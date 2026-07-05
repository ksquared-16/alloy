"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    COMMERCIAL_POLICY_REGISTRY,
    COMMERCIAL_POLICY_TYPES,
    commercialPolicyValueSummary,
    type CommercialPolicyType,
    type PolicyField,
} from "@/lib/commercial/execution/policy/policyTypes";
import type { CommercialPolicyApiRow } from "@/app/api/admin/commercial/policies/route";

/**
 * Commercial Policies — operator authoring UI (registry-driven; forms are generated
 * from COMMERCIAL_POLICY_REGISTRY, not hand-coded). CRUD over /api/admin/commercial/policies.
 * Native to the Commercial workspace. No Billing objects, no IDs surfaced.
 */

type ProgramLite = { key: string; label: string };
type LocationLite = { id: string; name: string };
type OfferingLite = { id: string; label: string; program_key: string };
type VariantLite = { id: string; label: string; offering_id: string };

type ScopeType = "org" | "location" | "program" | "offering" | "variant";
const SCOPE_OPTIONS: { value: ScopeType; label: string; hint: string }[] = [
    { value: "org", label: "Whole organization", hint: "Applies everywhere" },
    { value: "location", label: "One location", hint: "Applies at a single site" },
    { value: "program", label: "One program", hint: "Applies to a program" },
    { value: "offering", label: "One offering", hint: "Applies to an attendance type" },
    { value: "variant", label: "One variant", hint: "Applies to a specific schedule" },
];

const inputCls =
    "mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1.5 text-sm text-alloy-midnight placeholder:text-alloy-midnight/38 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20";
const labelCls = "text-xs font-medium text-alloy-midnight/70";

type FormState = {
    id: string | null;
    policy_type: CommercialPolicyType;
    label: string;
    values: Record<string, string>; // raw string inputs, keyed by field key
    scope_type: ScopeType;
    location_id: string;
    program_key: string;
    offering_id: string;
    variant_id: string;
    effective_start: string;
    effective_end: string;
    is_active: boolean;
};

function emptyForm(type: CommercialPolicyType = "discount"): FormState {
    return { id: null, policy_type: type, label: "", values: {}, scope_type: "org", location_id: "", program_key: "", offering_id: "", variant_id: "", effective_start: "", effective_end: "", is_active: true };
}

/** Convert the form's string values into the typed jsonb `value` the API expects. */
function buildValuePayload(type: CommercialPolicyType, values: Record<string, string>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of COMMERCIAL_POLICY_REGISTRY[type].fields) {
        const raw = values[f.key];
        if (f.showWhen && !f.showWhen.in.includes(String(values[f.showWhen.field] ?? ""))) continue;
        if (f.control === "select") out[f.key] = raw ?? "";
        else if (f.control === "yesno") out[f.key] = raw === "yes" || raw === "true";
        else if (f.control === "money") out[f.key] = Math.round((Number(raw) || 0) * 100); // dollars → cents
        else out[f.key] = Math.round(Number(raw) || 0); // number | percent
    }
    return out;
}

/** Hydrate the form's string values from a stored policy row. */
function valuesFromRow(row: CommercialPolicyApiRow): Record<string, string> {
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

export default function CommercialPoliciesPanel({ programs, locations }: { programs: ProgramLite[]; locations: LocationLite[] }) {
    const [policies, setPolicies] = useState<CommercialPolicyApiRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [saving, setSaving] = useState(false);

    // Offering/variant cascade for scope selection (loaded on demand).
    const [offerings, setOfferings] = useState<OfferingLite[]>([]);
    const [variants, setVariants] = useState<VariantLite[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/commercial/policies?include_inactive=true");
            const json = (await res.json()) as { policies?: CommercialPolicyApiRow[]; error?: string };
            if (json.error) setError(json.error);
            setPolicies(json.policies ?? []);
        } catch (e) { setError(String(e)); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Load offerings for a program (scope=offering/variant), variants for an offering.
    useEffect(() => {
        const pk = form?.program_key;
        if (!pk || (form?.scope_type !== "offering" && form?.scope_type !== "variant")) return;
        void fetch(`/api/admin/programs/offerings?program_key=${encodeURIComponent(pk)}`)
            .then((r) => r.json() as Promise<{ offerings?: OfferingLite[] }>)
            .then((j) => setOfferings((j.offerings ?? []).map((o) => ({ id: o.id, label: o.label, program_key: pk }))))
            .catch(() => setOfferings([]));
    }, [form?.program_key, form?.scope_type]);

    useEffect(() => {
        const oid = form?.offering_id;
        if (!oid || form?.scope_type !== "variant") return;
        void fetch(`/api/admin/programs/offerings/${oid}/variants`)
            .then((r) => r.json() as Promise<{ variants?: VariantLite[] }>)
            .then((j) => setVariants((j.variants ?? []).map((v) => ({ id: v.id, label: v.label, offering_id: oid }))))
            .catch(() => setVariants([]));
    }, [form?.offering_id, form?.scope_type]);

    const grouped = useMemo(() => {
        const m = new Map<CommercialPolicyType, CommercialPolicyApiRow[]>();
        for (const p of policies) { if (!m.has(p.policy_type)) m.set(p.policy_type, []); m.get(p.policy_type)!.push(p); }
        return m;
    }, [policies]);

    function startCreate() { setForm(emptyForm()); setError(null); }
    function startEdit(p: CommercialPolicyApiRow) {
        setForm({
            id: p.id, policy_type: p.policy_type, label: p.label ?? "", values: valuesFromRow(p),
            scope_type: p.scope_type as ScopeType, location_id: p.location_id ?? "", program_key: p.program_key ?? "",
            offering_id: p.offering_id ?? "", variant_id: p.variant_id ?? "",
            effective_start: p.effective_start && p.effective_start !== "2000-01-01" ? p.effective_start : "",
            effective_end: p.effective_end ?? "", is_active: p.is_active,
        });
        setError(null);
    }

    async function save() {
        if (!form) return;
        setSaving(true); setError(null);
        try {
            const payload = {
                policy_type: form.policy_type,
                label: form.label.trim() || null,
                value: buildValuePayload(form.policy_type, form.values),
                scope_type: form.scope_type,
                location_id: form.location_id || null,
                program_key: form.program_key || null,
                offering_id: form.offering_id || null,
                variant_id: form.variant_id || null,
                effective_start: form.effective_start || null,
                effective_end: form.effective_end || null,
                is_active: form.is_active,
            };
            const url = form.id ? `/api/admin/commercial/policies/${form.id}` : "/api/admin/commercial/policies";
            const res = await fetch(url, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) { setError(json.error ?? "Save failed"); return; }
            setForm(null);
            await load();
        } catch (e) { setError(String(e)); }
        finally { setSaving(false); }
    }

    async function toggleActive(p: CommercialPolicyApiRow) {
        await fetch(`/api/admin/commercial/policies/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !p.is_active }) });
        await load();
    }
    async function remove(p: CommercialPolicyApiRow) {
        if (!window.confirm("Remove this policy? This cannot be undone.")) return;
        await fetch(`/api/admin/commercial/policies/${p.id}`, { method: "DELETE" });
        await load();
    }

    function scopeSummary(p: CommercialPolicyApiRow): string {
        switch (p.scope_type) {
            case "location": return locations.find((l) => l.id === p.location_id)?.name ?? "a location";
            case "program": return programs.find((pr) => pr.key === p.program_key)?.label ?? "a program";
            case "offering": return "an offering";
            case "variant": return "a schedule";
            default: return "Whole organization";
        }
    }

    return (
        <div className="flex flex-col min-h-0 flex-1 overflow-auto p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-base font-semibold text-alloy-midnight">Policies</h2>
                    <p className="mt-0.5 text-sm text-alloy-midnight/55 max-w-2xl">
                        Rules that adjust what you charge — discounts, sibling discounts, waivers, proration, and review requirements.
                        Policies change prices in the Simulator and in billing; they never create new charges.
                    </p>
                </div>
                {!form && (
                    <button type="button" onClick={startCreate} className="shrink-0 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-alloy-bend-pine/90">
                        + Add policy
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError(null)} className="ml-3 text-xs underline">dismiss</button>
                </div>
            )}

            {form ? (
                <PolicyForm
                    form={form} setForm={setForm} programs={programs} locations={locations} offerings={offerings} variants={variants}
                    onSave={save} onCancel={() => setForm(null)} saving={saving}
                />
            ) : loading ? (
                <p className="text-sm text-alloy-midnight/40">Loading policies…</p>
            ) : policies.length === 0 ? (
                <div className="rounded-lg border border-dashed border-alloy-stone/40 bg-white/60 px-6 py-10 text-center">
                    <p className="text-sm font-medium text-alloy-midnight/70">No policies yet</p>
                    <p className="mt-1 text-sm text-alloy-midnight/45 max-w-md mx-auto">
                        Add a policy to offer discounts, waive fees, prorate partial periods, or require review.
                        Without policies, prices are charged exactly as configured.
                    </p>
                    <button type="button" onClick={startCreate} className="mt-4 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-alloy-bend-pine/90">+ Add your first policy</button>
                </div>
            ) : (
                <div className="space-y-5">
                    {COMMERCIAL_POLICY_TYPES.filter((t) => grouped.has(t)).map((type) => (
                        <div key={type}>
                            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">{COMMERCIAL_POLICY_REGISTRY[type].label}</h3>
                            <div className="overflow-hidden rounded-lg border border-alloy-stone/20 bg-white">
                                {grouped.get(type)!.map((p, i) => (
                                    <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-alloy-stone/12" : ""} ${p.is_active ? "" : "opacity-55"}`}>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-alloy-midnight">{p.label || commercialPolicyValueSummary(p.policy_type, p.value)}</p>
                                            <p className="truncate text-xs text-alloy-midnight/50">
                                                {commercialPolicyValueSummary(p.policy_type, p.value)} · {scopeSummary(p)}
                                                {p.effective_start && p.effective_start !== "2000-01-01" ? ` · from ${p.effective_start}` : ""}
                                                {p.effective_end ? ` to ${p.effective_end}` : ""}
                                            </p>
                                        </div>
                                        {!p.is_active && <span className="shrink-0 rounded-full bg-alloy-stone/25 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/50">Disabled</span>}
                                        <button type="button" onClick={() => void toggleActive(p)} className="shrink-0 text-xs text-alloy-midnight/55 hover:text-alloy-bend-pine">{p.is_active ? "Disable" : "Enable"}</button>
                                        <button type="button" onClick={() => startEdit(p)} className="shrink-0 text-xs text-alloy-midnight/55 hover:text-alloy-bend-pine">Edit</button>
                                        <button type="button" onClick={() => void remove(p)} className="shrink-0 text-xs text-alloy-midnight/40 hover:text-red-500">Remove</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Registry-driven form ─────────────────────────────────────────────────────

function PolicyForm({ form, setForm, programs, locations, offerings, variants, onSave, onCancel, saving }: {
    form: FormState;
    setForm: (f: FormState | null) => void;
    programs: ProgramLite[];
    locations: LocationLite[];
    offerings: OfferingLite[];
    variants: VariantLite[];
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
}) {
    const def = COMMERCIAL_POLICY_REGISTRY[form.policy_type];
    const setVal = (k: string, v: string) => setForm({ ...form, values: { ...form.values, [k]: v } });
    const visibleFields = def.fields.filter((f) => !f.showWhen || f.showWhen.in.includes(String(form.values[f.showWhen.field] ?? "")));
    const previewValue = buildValuePayload(form.policy_type, form.values);

    return (
        <div className="rounded-lg border border-alloy-stone/25 bg-white p-5 max-w-2xl">
            <h3 className="text-sm font-semibold text-alloy-midnight">{form.id ? "Edit policy" : "New policy"}</h3>

            {/* Type picker */}
            {!form.id && (
                <div className="mt-3">
                    <span className={labelCls}>Policy type</span>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {COMMERCIAL_POLICY_TYPES.map((t) => (
                            <button key={t} type="button" onClick={() => setForm({ ...emptyForm(t), scope_type: form.scope_type })}
                                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${form.policy_type === t ? "border-alloy-bend-pine bg-alloy-bend-pine/5 text-alloy-midnight" : "border-alloy-stone/25 text-alloy-midnight/70 hover:border-alloy-bend-pine/40"}`}>
                                <span className="block font-medium">{COMMERCIAL_POLICY_REGISTRY[t].label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <p className="mt-2 text-xs text-alloy-midnight/50">{def.description} <span className="italic text-alloy-midnight/40">e.g. {def.example}</span></p>

            {/* Name */}
            <div className="mt-3">
                <label className={labelCls}>Name <span className="text-alloy-midnight/35">(optional)</span></label>
                <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Staff family discount" className={inputCls} />
            </div>

            {/* Generated fields */}
            {visibleFields.length > 0 && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {visibleFields.map((f) => <FieldInput key={`${f.key}:${f.control}`} field={f} value={form.values[f.key] ?? ""} onChange={(v) => setVal(f.key, v)} />)}
                </div>
            )}

            {/* Scope */}
            <div className="mt-4 border-t border-alloy-stone/15 pt-3">
                <label className={labelCls}>Where does it apply?</label>
                <select value={form.scope_type} onChange={(e) => setForm({ ...form, scope_type: e.target.value as ScopeType, location_id: "", program_key: "", offering_id: "", variant_id: "" })} className={inputCls}>
                    {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {form.scope_type === "location" && (
                    <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} className={`${inputCls} mt-2`}>
                        <option value="">Select a location…</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                )}
                {(form.scope_type === "program" || form.scope_type === "offering" || form.scope_type === "variant") && (
                    <select value={form.program_key} onChange={(e) => setForm({ ...form, program_key: e.target.value, offering_id: "", variant_id: "" })} className={`${inputCls} mt-2`}>
                        <option value="">Select a program…</option>
                        {programs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                )}
                {(form.scope_type === "offering" || form.scope_type === "variant") && form.program_key && (
                    <select value={form.offering_id} onChange={(e) => setForm({ ...form, offering_id: e.target.value, variant_id: "" })} className={`${inputCls} mt-2`}>
                        <option value="">Select an offering…</option>
                        {offerings.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                )}
                {form.scope_type === "variant" && form.offering_id && (
                    <select value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} className={`${inputCls} mt-2`}>
                        <option value="">Select a schedule…</option>
                        {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                )}
            </div>

            {/* Effective dates */}
            <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Starts <span className="text-alloy-midnight/35">(optional)</span></label><input type="date" value={form.effective_start} onChange={(e) => setForm({ ...form, effective_start: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Ends <span className="text-alloy-midnight/35">(optional)</span></label><input type="date" value={form.effective_end} onChange={(e) => setForm({ ...form, effective_end: e.target.value })} className={inputCls} /></div>
            </div>

            {/* Active + preview */}
            <div className="mt-3 flex items-center gap-2">
                <input id="pol-active" type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-bend-pine focus:ring-alloy-bend-pine/30" />
                <label htmlFor="pol-active" className="text-sm text-alloy-midnight/70">Active</label>
            </div>

            <div className="mt-4 rounded-md bg-alloy-stone/15 px-3 py-2 text-xs text-alloy-midnight/65">
                <span className="font-medium text-alloy-midnight/75">Preview:</span> {commercialPolicyValueSummary(form.policy_type, previewValue) || "—"}
            </div>

            <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={onSave} disabled={saving} className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50">{saving ? "Saving…" : form.id ? "Save changes" : "Create policy"}</button>
                <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/60 hover:text-alloy-midnight">Cancel</button>
            </div>
        </div>
    );
}

function FieldInput({ field, value, onChange }: { field: PolicyField; value: string; onChange: (v: string) => void }) {
    if (field.control === "select") {
        return (
            <div>
                <label className={labelCls}>{field.label}</label>
                <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {field.help && <p className="mt-0.5 text-[11px] text-alloy-midnight/40">{field.help}</p>}
            </div>
        );
    }
    if (field.control === "yesno") {
        return (
            <div className="flex items-center gap-2 pt-5">
                <input id={`f-${field.key}`} type="checkbox" checked={value === "yes" || value === "true"} onChange={(e) => onChange(e.target.checked ? "yes" : "no")} className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-bend-pine focus:ring-alloy-bend-pine/30" />
                <label htmlFor={`f-${field.key}`} className="text-sm text-alloy-midnight/70">{field.label}</label>
            </div>
        );
    }
    const prefix = field.control === "money" ? "$" : null;
    return (
        <div>
            <label className={labelCls}>{field.label}</label>
            <div className="relative">
                {prefix && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-alloy-midnight/45">{prefix}</span>}
                <input type="number" min="0" step={field.control === "money" ? "0.01" : "1"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.control === "money" ? "0.00" : "0"} className={`${inputCls} ${prefix ? "pl-5" : ""} ${field.suffix ? "pr-8" : ""}`} />
                {field.suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-alloy-midnight/45">{field.suffix}</span>}
            </div>
            {field.help && <p className="mt-0.5 text-[11px] text-alloy-midnight/40">{field.help}</p>}
        </div>
    );
}
