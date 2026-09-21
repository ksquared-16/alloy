"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import {
    COMMERCIAL_POLICY_CATEGORY_LABELS,
    COMMERCIAL_POLICY_REGISTRY,
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
import {
    locationApplicabilityFromMetadata,
    writeLocationIdsMetadata,
} from "@/lib/financials/applicability/locationApplicability";
import { summarizeLocationApplicability } from "@/components/adminV2/settings/configurationRuntime/LocationMultiSelect";
import FinancialPoliciesConfigurationPanel from "@/components/adminV2/settings/financials/FinancialPoliciesConfigurationPanel";

type PolicyTab = "overview" | "rules" | "applies_to";

const SCOPE_LABEL: Record<string, string> = {
    org: "Whole organization",
    location: "Location",
    program: "Program",
    offering: "Tuition Plan",
    variant: "Enrollment Commitment",
};

function policyTypeLabel(type: string): string {
    return COMMERCIAL_POLICY_REGISTRY[type as CommercialPolicyType]?.label ?? "Policy";
}

function policyCategoryLabel(type: string): string {
    const def = COMMERCIAL_POLICY_REGISTRY[type as CommercialPolicyType];
    return def ? COMMERCIAL_POLICY_CATEGORY_LABELS[def.category] : "Policy";
}

export default function PoliciesConfigurationPage({
    programs,
    locations,
}: {
    programs: { key: string; label: string }[];
    locations: { id: string; name: string }[];
}) {
    const searchParams = useSearchParams();
    const initialPolicyId = searchParams.get("policyId");
    const [policies, setPolicies] = useState<CommercialPolicyApiRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(initialPolicyId);
    const [tab, setTab] = useState<PolicyTab>("overview");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<PolicyFormState | null>(null);
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState(false);
    const [offerings, setOfferings] = useState<OfferingLite[]>([]);
    const [variants, setVariants] = useState<VariantLite[]>([]);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/commercial/policies?include_inactive=true", { credentials: "include" });
            const json = (await res.json()) as { policies?: CommercialPolicyApiRow[]; error?: string };
            if (json.error) throw new Error(json.error);
            setPolicies(json.policies ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load policies.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (initialPolicyId) setSelectedId(initialPolicyId);
    }, [initialPolicyId]);

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

    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        return policies.filter((row) => {
            if (!query) return true;
            return `${row.label} ${policyTypeLabel(row.policy_type)}`.toLowerCase().includes(query);
        });
    }, [policies, search]);

    const selected = policies.find((row) => row.id === selectedId) ?? null;

    /* What the policy DOES, from the one helper that knows — the Rules tab reads the same call. */
    const valueSummary = useMemo(
        () =>
            selected ?
                commercialPolicyValueSummary(selected.policy_type as CommercialPolicyType, selected.value)
            :   "",
        [selected],
    );

    /*
     * WHAT A POLICY APPLIES TO — one derivation, two call sites.
     *
     * This was bound to the SELECTED policy, so "what does it apply to?" could only be answered
     * after opening one. It is the fourth of the five facts an operator needs BEFORE selecting,
     * and the only one the row was missing. Lifting it to take a row rather than read `selected`
     * lets the summary state it without a second scope formatter existing.
     */
    const scopeLabelFor = useCallback(
        (row: CommercialPolicyApiRow | null): string => {
            if (!row) return "—";
            if (row.scope_type === "program" && row.program_key) {
                return programs.find((p) => p.key === row.program_key)?.label ?? row.program_key;
            }
            if (row.scope_type === "location" && row.location_id) {
                return locations.find((l) => l.id === row.location_id)?.name ?? "Location";
            }
            if (row.scope_type === "offering" && row.offering_id) {
                return offerings.find((o) => o.id === row.offering_id)?.label ?? "Tuition Plan";
            }
            if (row.scope_type === "variant" && row.variant_id) {
                return variants.find((v) => v.id === row.variant_id)?.label ?? "Enrollment Commitment";
            }
            return SCOPE_LABEL[row.scope_type] ?? "Configured scope";
        },
        [programs, locations, offerings, variants],
    );
    const scopeLabel = useMemo(() => scopeLabelFor(selected), [scopeLabelFor, selected]);

    const locationsSummary = useMemo(() => {
        if (!selected) return "—";
        const legacyLocationId = selected.scope_type === "location" ? selected.location_id : null;
        const applicability = locationApplicabilityFromMetadata(
            selected.metadata,
            POLICY_LOCATION_IDS_META_KEY,
            legacyLocationId,
        );
        return summarizeLocationApplicability(applicability.mode, applicability.locationIds, locations);
    }, [selected, locations]);

    const openCreate = () => {
        setForm(emptyPolicyForm());
        setError(null);
    };

    const openEdit = () => {
        if (!selected) return;
        setForm(policyFormFromRow(selected));
        setError(null);
    };

    const save = async () => {
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
                credentials: "include",
                body: JSON.stringify(payload),
            });
            const json = (await res.json()) as { policy?: CommercialPolicyApiRow; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            setForm(null);
            await reload();
            if (json.policy?.id) setSelectedId(json.policy.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async () => {
        if (!selected) return;
        setBusy(true);
        try {
            await fetch(`/api/admin/commercial/policies/${selected.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ is_active: !selected.is_active }),
            });
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update status.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-testid="policies-configuration-page">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-alloy-midnight/55 max-w-xl">
                    Policies are named rules that modify commercial pricing and billing behavior. Commercial products
                    reference them — they do not embed duplicated logic. Prefer names like “Registration Fee Waiver,”
                    not “Registration Fee Policy.”
                </p>
                <ConfigurationPrimaryButton className="gap-1" onClick={openCreate} data-testid="policies-new">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    New Policy
                </ConfigurationPrimaryButton>
            </div>

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            {/*
             * ── NAME THE SUBSECTION AN OPERATOR IS LOOKING FOR ────────────────────────────────
             *
             * This chapter holds two different authorities and only the second one said so. The
             * commercial list was headed "Policies" — the chapter's own name — while the panel
             * below it was explicitly "Financial execution policies", so an operator looking for
             * DISCOUNTS saw a page about policies and nothing that used the word. The engine is
             * exactly where it belongs and is reachable; the page simply never named it.
             *
             * The repair is a heading, in the same grammar the execution panel already uses, so
             * the chapter reads as two clearly separated subsections. No route is added, no form
             * is duplicated, and nothing moves — two places owning one policy would be a far worse
             * answer to "it is hard to find" than a missing title.
             */}
            <div className="mb-3" data-testid="commercial-policies-heading">
                <h2 className="text-sm font-semibold text-alloy-midnight">Discounts &amp; commercial policies</h2>
                <p className="mt-1 max-w-xl text-sm text-alloy-midnight/55">
                    Discounts, sibling and employee rules and waivers — what reduces a family&apos;s price, who
                    qualifies, and from when. These modify commercial pricing; the execution policies below decide
                    how billing runs.
                </p>
            </div>

            <ConfigurationShell testId="policies-configuration-shell">
                {loading ?
                    <ConfigurationEmptyState testId="policies-loading" title="Loading Policies" description="Fetching policy rules." />
                :   <div className="grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                        <aside className="locations-collection-rail process-config-setup-card hidden min-w-0 p-0 xl:block">
                            <header className="locations-collection-rail__header">
                                <h2 className="locations-collection-rail__title">Policies</h2>
                                <p className="locations-collection-rail__count">{visible.length} policies</p>
                            </header>
                            <div className="programs-collection-controls">
                                <div className="programs-collection-controls__search-wrap">
                                    <Search className="programs-collection-controls__search-icon" strokeWidth={2} aria-hidden />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search policies…"
                                        className="programs-collection-controls__search"
                                        data-testid="policies-search"
                                    />
                                </div>
                            </div>
                            <div className="locations-collection-rail__list" role="listbox" aria-label="Policies">
                                {visible.map((row) => {
                                    const selectedRow = row.id === selectedId;
                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            role="option"
                                            aria-selected={selectedRow}
                                            className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row ${
                                                selectedRow ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                            }`}
                                            onClick={() => {
                                                setSelectedId(row.id);
                                                setTab("overview");
                                            }}
                                            data-testid={`policy-${row.id}`}
                                        >
                                            {selectedRow ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                            <span className="locations-collection-row__body">
                                                <span className="locations-collection-row__name">
                                                    {row.label || policyTypeLabel(row.policy_type)}
                                                </span>
                                                <span className="locations-collection-row__place">
                                                    {policyCategoryLabel(row.policy_type)} · {policyTypeLabel(row.policy_type)}
                                                </span>
                                                <span className="locations-collection-row__meta text-alloy-midnight/50">
                                                    {commercialPolicyValueSummary(
                                                        row.policy_type as CommercialPolicyType,
                                                        row.value,
                                                    ) ?
                                                        `${commercialPolicyValueSummary(row.policy_type as CommercialPolicyType, row.value)} · `
                                                    :   ""}
                                                    {row.is_active ? "Active" : "Inactive"}
                                                    {/*
                                                      * WHAT IT APPLIES TO — the one fact of the
                                                      * five that the summary did not state, so an
                                                      * operator had to open a policy to learn its
                                                      * scope. Same derivation the detail uses.
                                                      */}
                                                    {` · ${scopeLabelFor(row)}`}
                                                    {row.effective_start && row.effective_start !== "2000-01-01"
                                                        ? ` · from ${row.effective_start}`
                                                        : ""}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <main className="min-w-0">
                            {selected ?
                                <div className="space-y-4">
                                    <section className="process-config-setup-card p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                                    {selected.label || policyTypeLabel(selected.policy_type)}
                                                </h2>
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {policyTypeLabel(selected.policy_type)}
                                                    {" · "}
                                                    {selected.is_active ? "Active" : "Inactive"}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <ConfigurationSecondaryButton onClick={openEdit} data-testid="policy-edit">
                                                    Edit Policy
                                                </ConfigurationSecondaryButton>
                                                <ConfigurationSecondaryButton
                                                    disabled={busy}
                                                    onClick={() => void toggleActive()}
                                                    data-testid="policy-toggle-active"
                                                >
                                                    {selected.is_active ? "Deactivate" : "Activate"}
                                                </ConfigurationSecondaryButton>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex gap-1 border-b border-alloy-stone/20" role="tablist">
                                            {(
                                                [
                                                    { key: "overview", label: "Overview" },
                                                    { key: "rules", label: "Rules" },
                                                    { key: "applies_to", label: "Applies To" },
                                                ] as const
                                            ).map((item) => (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={tab === item.key}
                                                    onClick={() => setTab(item.key)}
                                                    className={`px-3 py-1.5 text-[12px] -mb-px border-b-2 ${
                                                        tab === item.key
                                                            ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                                            : "border-transparent text-alloy-midnight/55"
                                                    }`}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    {tab === "overview" ?
                                        <section className="process-config-setup-card p-5" data-testid="policy-overview">
                                            <h3 className="text-base font-semibold text-alloy-midnight">
                                                {selected.label || policyTypeLabel(selected.policy_type)}
                                            </h3>
                                            <p className="mt-1 text-sm text-alloy-midnight/55">
                                                {COMMERCIAL_POLICY_REGISTRY[selected.policy_type as CommercialPolicyType]
                                                    ?.description ?? "Financial policy rule."}
                                            </p>
                                            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                                                {/*
                                                 * ── THE HEADLINE FACT, ON THE PAGE THAT OPENS ────────────────────
                                                 *
                                                 * Selecting a policy opens `overview`, and overview stated Category,
                                                 * Type, Status, Applied to, Locations and Effective — everything ABOUT
                                                 * the discount except what it reduces and by how much. "10% off
                                                 * everything" sat one tab away, so an operator could read the whole
                                                 * front page of a discount and still not know its rate.
                                                 *
                                                 * Same authority as the Rules tab. No second formatter.
                                                 */}
                                                {valueSummary ?
                                                    <div className="sm:col-span-2">
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">
                                                            What it does
                                                        </dt>
                                                        <dd className="mt-0.5 font-medium" data-testid="policy-overview-rule">
                                                            {valueSummary}
                                                        </dd>
                                                    </div>
                                                :   null}
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Category</dt>
                                                    <dd className="mt-0.5">{policyCategoryLabel(selected.policy_type)}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Type</dt>
                                                    <dd className="mt-0.5">{policyTypeLabel(selected.policy_type)}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Status</dt>
                                                    <dd className="mt-0.5">{selected.is_active ? "Active" : "Inactive"}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Applied to</dt>
                                                    <dd className="mt-0.5">{scopeLabel}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Locations</dt>
                                                    <dd className="mt-0.5" data-testid="policy-overview-locations">
                                                        {locationsSummary}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Effective</dt>
                                                    <dd className="mt-0.5">
                                                        {selected.effective_start && selected.effective_start !== "2000-01-01"
                                                            ? selected.effective_start
                                                            : "Open"}
                                                        {" – "}
                                                        {selected.effective_end ?? "Present"}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </section>
                                    : tab === "rules" ?
                                        <section className="process-config-setup-card p-5" data-testid="policy-rules">
                                            <p className="text-sm text-alloy-midnight/75">
                                                {commercialPolicyValueSummary(
                                                    selected.policy_type as CommercialPolicyType,
                                                    selected.value,
                                                )}
                                            </p>
                                        </section>
                                    :   <section className="process-config-setup-card p-5" data-testid="policy-applies-to">
                                            <p className="text-sm text-alloy-midnight/75">{scopeLabel}</p>
                                            <p className="mt-2 text-xs text-alloy-midnight/45">
                                                Scope type: {SCOPE_LABEL[selected.scope_type] ?? "Configured"}
                                            </p>
                                            <p className="mt-2 text-xs text-alloy-midnight/45">
                                                Locations: {locationsSummary}
                                            </p>
                                        </section>
                                    }
                                </div>
                            :   <ConfigurationEmptyState
                                    testId="policies-no-selection"
                                    title="Select a policy"
                                    description="Discount, deposit, and billing rules configured for your organization."
                                />
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

            {/*
             * ── THE SECOND POLICY FAMILY, ON THE SURFACE THAT CLAIMS TO OWN IT ────────────────
             *
             * This chapter authored COMMERCIAL policies only — percentage and fixed discounts
             * scoped to programs and plans. `financial_policies` is a different authority: it owns
             * proration, posting review, billing cadence, deposit and due date, and it is what
             * generation and the charge lifecycle actually resolve.
             *
             * It had a panel and no route. `/adminV2/settings/financials` redirects here, so
             * `FinancialPoliciesConfigurationPanel` had become unreachable — which meant a
             * `due_date` policy an organisation must set in order to state its own payment terms
             * could be stored by the database and authored by nobody. Mounted proof found it; no
             * amount of reading the registry would have, because the registry-driven form was
             * correct and simply not rendered anywhere.
             *
             * SCOPE OPTIONS ARE DELIBERATELY EMPTY HERE. The panel narrows a policy to a location,
             * service or rate plan when given those lists, and this chapter does not load them. The
             * ORG scope — which is what "how does this organisation run financials" means, and the
             * scope every one of these policy types is primarily authored at — works fully. Wiring
             * the narrower scopes is a known, bounded follow-up rather than a reason to keep the
             * whole authority unreachable.
             */}
            <section className="mt-8" data-testid="financial-execution-policies">
                <div className="mb-3">
                    <h2 className="text-sm font-semibold text-alloy-midnight">Financial execution policies</h2>
                    <p className="mt-1 max-w-xl text-sm text-alloy-midnight/55">
                        How this organisation runs billing: proration, billing cadence, when payment is due, posting
                        review and deposits. These are resolved by charge generation and the charge lifecycle —
                        distinct from the commercial discount rules above.
                    </p>
                </div>
                <FinancialPoliciesConfigurationPanel
                    canMutate
                    todayYmd={new Date().toISOString().slice(0, 10)}
                    locationOptions={[]}
                    serviceOptions={[]}
                    ratePlanOptions={[]}
                    labelFor={() => undefined}
                />
            </section>

            {form ?
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                        />
                    </div>
                </div>
            :   null}
        </div>
    );
}
