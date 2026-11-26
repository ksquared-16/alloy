"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    COMMERCIAL_POLICY_REGISTRY,
    COMMERCIAL_POLICY_TYPES,
    commercialPolicyValueSummary,
    type CommercialPolicyType,
} from "@/lib/commercial/execution/policy/policyTypes";
import type { CommercialPolicyApiRow } from "@/app/api/admin/commercial/policies/route";
import {
    buildPolicyValuePayload,
    emptyPolicyForm,
    POLICY_LOCATION_IDS_META_KEY,
    PolicyEditorForm,
    policyFormFromRow,
    type OfferingLite,
    type PolicyFormState,
    type VariantLite,
} from "@/components/adminV2/commercial/policyEditorShared";
import { writeLocationIdsMetadata } from "@/lib/financials/applicability/locationApplicability";

/**
 * Commercial Policies — operator authoring UI (registry-driven).
 * CRUD over /api/admin/commercial/policies.
 */

type ProgramLite = { key: string; label: string };
type LocationLite = { id: string; name: string };

export default function CommercialPoliciesPanel({
    programs,
    locations,
    focusProgramKey,
    embedded = false,
    canManage = true,
}: {
    programs: ProgramLite[];
    locations: LocationLite[];
    focusProgramKey?: string;
    embedded?: boolean;
    canManage?: boolean;
}) {
    const [policies, setPolicies] = useState<CommercialPolicyApiRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<PolicyFormState | null>(null);
    const [saving, setSaving] = useState(false);

    const [offerings, setOfferings] = useState<OfferingLite[]>([]);
    const [variants, setVariants] = useState<VariantLite[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/commercial/policies?include_inactive=true");
            const json = (await res.json()) as { policies?: CommercialPolicyApiRow[]; error?: string };
            if (json.error) setError(json.error);
            setPolicies(json.policies ?? []);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!focusProgramKey) return;
        void fetch(`/api/admin/programs/offerings?program_key=${encodeURIComponent(focusProgramKey)}`)
            .then((response) => response.json() as Promise<{ offerings?: OfferingLite[] }>)
            .then(async (json) => {
                const loadedOfferings = json.offerings ?? [];
                setOfferings(loadedOfferings);
                const variantGroups = await Promise.all(
                    loadedOfferings.map((offering) =>
                        fetch(`/api/admin/programs/offerings/${offering.id}/variants`)
                            .then((response) => response.json() as Promise<{ variants?: VariantLite[] }>)
                            .then((result) => result.variants ?? [])
                            .catch(() => [] as VariantLite[]),
                    ),
                );
                setVariants(variantGroups.flat());
            })
            .catch(() => {
                setOfferings([]);
                setVariants([]);
            });
    }, [focusProgramKey]);

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

    const visiblePolicies = useMemo(() => {
        if (!focusProgramKey) return policies;
        const offeringIds = new Set(offerings.map((offering) => offering.id));
        const variantIds = new Set(variants.map((variant) => variant.id));
        return policies.filter(
            (policy) =>
                policy.scope_type === "org"
                || (policy.scope_type === "program" && policy.program_key === focusProgramKey)
                || (policy.scope_type === "offering"
                    && policy.offering_id != null
                    && offeringIds.has(policy.offering_id))
                || (policy.scope_type === "variant"
                    && policy.variant_id != null
                    && variantIds.has(policy.variant_id)),
        );
    }, [focusProgramKey, offerings, policies, variants]);

    const grouped = useMemo(() => {
        const m = new Map<CommercialPolicyType, CommercialPolicyApiRow[]>();
        for (const p of visiblePolicies) {
            if (!m.has(p.policy_type)) m.set(p.policy_type, []);
            m.get(p.policy_type)!.push(p);
        }
        return m;
    }, [visiblePolicies]);

    function startCreate() {
        setForm(
            focusProgramKey
                ? { ...emptyPolicyForm(), scope_type: "program", program_key: focusProgramKey }
                : emptyPolicyForm(),
        );
        setError(null);
    }
    function startEdit(p: CommercialPolicyApiRow) {
        setForm(policyFormFromRow(p));
        setError(null);
    }

    async function save() {
        if (!form) return;
        setSaving(true);
        setError(null);
        try {
            // Legacy "location" scope is coerced to org; the location becomes a
            // metadata-driven selection via the Locations multi-select instead.
            const scopeType = form.scope_type === "location" ? "org" : form.scope_type;
            const existingMetadata = form.id ? (policies.find((row) => row.id === form.id)?.metadata ?? {}) : {};
            const metadata = writeLocationIdsMetadata(
                existingMetadata,
                { mode: form.locationMode, locationIds: form.locationIds },
                POLICY_LOCATION_IDS_META_KEY,
            );
            const payload = {
                policy_type: form.policy_type,
                label: form.label.trim() || null,
                value: buildPolicyValuePayload(form.policy_type, form.values),
                scope_type: scopeType,
                location_id: form.scope_type === "location" ? form.location_id || null : null,
                program_key: form.program_key || null,
                offering_id: form.offering_id || null,
                variant_id: form.variant_id || null,
                effective_start: form.effective_start || null,
                effective_end: form.effective_end || null,
                is_active: form.is_active,
                metadata,
            };
            const url = form.id ? `/api/admin/commercial/policies/${form.id}` : "/api/admin/commercial/policies";
            const res = await fetch(url, {
                method: form.id ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) {
                setError(json.error ?? "Save failed");
                return;
            }
            setForm(null);
            await load();
        } catch (e) {
            setError(String(e));
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(p: CommercialPolicyApiRow) {
        await fetch(`/api/admin/commercial/policies/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: !p.is_active }),
        });
        await load();
    }
    async function remove(p: CommercialPolicyApiRow) {
        if (!window.confirm("Remove this policy? This cannot be undone.")) return;
        await fetch(`/api/admin/commercial/policies/${p.id}`, { method: "DELETE" });
        await load();
    }

    function scopeSummary(p: CommercialPolicyApiRow): string {
        switch (p.scope_type) {
            case "location":
                return locations.find((l) => l.id === p.location_id)?.name ?? "a location";
            case "program":
                return programs.find((pr) => pr.key === p.program_key)?.label ?? "a program";
            case "offering":
                return "a Tuition Plan";
            case "variant":
                return "an Enrollment Commitment";
            default:
                return "Whole organization";
        }
    }

    return (
        <div
            className={`flex min-h-0 flex-1 flex-col overflow-auto ${embedded ? "" : "p-6"}`}
            data-testid={embedded ? "program-policy-configuration" : "commercial-policies-panel"}
        >
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-base font-semibold text-alloy-midnight">Policies</h2>
                    <p className="mt-0.5 text-sm text-alloy-midnight/55 max-w-2xl">
                        Rules that adjust what you charge — discounts, sibling discounts, waivers, proration, and
                        review requirements. Policies change prices in the Simulator and in billing; they never create
                        new charges.
                    </p>
                </div>
                {!form && canManage ?
                    <button
                        type="button"
                        onClick={startCreate}
                        className="shrink-0 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-alloy-bend-pine/90"
                    >
                        + Add policy
                    </button>
                :   null}
            </div>

            {error ?
                <div className="mb-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError(null)} className="ml-3 text-xs underline">
                        dismiss
                    </button>
                </div>
            :   null}

            {form ?
                <PolicyEditorForm
                    form={form}
                    setForm={setForm}
                    programs={programs}
                    locations={locations}
                    offerings={offerings}
                    variants={variants}
                    onSave={() => void save()}
                    onCancel={() => setForm(null)}
                    saving={saving}
                    focusProgramKey={focusProgramKey}
                />
            : loading ?
                <p className="text-sm text-alloy-midnight/40">Loading policies…</p>
            : visiblePolicies.length === 0 ?
                <div className="rounded-lg border border-dashed border-alloy-stone/40 bg-white/60 px-6 py-10 text-center">
                    <p className="text-sm font-medium text-alloy-midnight/70">No policies yet</p>
                    <p className="mt-1 text-sm text-alloy-midnight/45 max-w-md mx-auto">
                        Add a policy to offer discounts, waive fees, prorate partial periods, or require review.
                        Without policies, prices are charged exactly as configured.
                    </p>
                    {canManage ?
                        <button
                            type="button"
                            onClick={startCreate}
                            className="mt-4 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-alloy-bend-pine/90"
                        >
                            + Add your first policy
                        </button>
                    :   null}
                </div>
            :   <div className="space-y-5">
                    {COMMERCIAL_POLICY_TYPES.filter((t) => grouped.has(t)).map((type) => (
                            <div key={type}>
                                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    {COMMERCIAL_POLICY_REGISTRY[type].label}
                                </h3>
                                <div className="overflow-hidden rounded-lg border border-alloy-stone/20 bg-white">
                                    {grouped.get(type)!.map((p, i) => (
                                        <div
                                            key={p.id}
                                            className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-alloy-stone/12" : ""} ${p.is_active ? "" : "opacity-55"}`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-alloy-midnight">
                                                    {p.label || commercialPolicyValueSummary(p.policy_type, p.value)}
                                                </p>
                                                <p className="truncate text-xs text-alloy-midnight/50">
                                                    {commercialPolicyValueSummary(p.policy_type, p.value)} ·{" "}
                                                    {scopeSummary(p)}
                                                    {p.effective_start && p.effective_start !== "2000-01-01"
                                                        ? ` · from ${p.effective_start}`
                                                        : ""}
                                                    {p.effective_end ? ` to ${p.effective_end}` : ""}
                                                </p>
                                            </div>
                                            {!p.is_active ?
                                                <span className="shrink-0 rounded-full bg-alloy-stone/25 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/50">
                                                    Disabled
                                                </span>
                                            :   null}
                                            {canManage ?
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => void toggleActive(p)}
                                                        className="shrink-0 text-xs text-alloy-midnight/55 hover:text-alloy-bend-pine"
                                                    >
                                                        {p.is_active ? "Disable" : "Enable"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => startEdit(p)}
                                                        className="shrink-0 text-xs text-alloy-midnight/55 hover:text-alloy-bend-pine"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void remove(p)}
                                                        className="shrink-0 text-xs text-alloy-midnight/40 hover:text-red-500"
                                                    >
                                                        Remove
                                                    </button>
                                                </>
                                            :   null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                </div>
            }
        </div>
    );
}
