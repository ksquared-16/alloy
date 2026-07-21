"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    CommercialCatalogPanel,
    VariantBulkBuilder,
} from "@/components/adminV2/commercial/CommercialConfigWorkspace";
import CommercialPoliciesPanel from "@/components/adminV2/commercial/CommercialPoliciesPanel";
import CommercialSimulatorPanel from "@/components/adminV2/commercial/CommercialSimulatorPanel";
import { TuitionGridWorkspace } from "@/components/adminV2/commercial/TuitionGridWorkspace";
import {
    ATTENDANCE_TYPE_LABELS,
    OFFERING_STATUS_LABELS,
    type AttendanceType,
    type OfferingStatus,
} from "@/lib/programs/programOfferings";
import {
    describeVariant,
} from "@/lib/programs/programOfferingVariants";
import {
    sortProducts,
    type CommercialCategory,
    type CommercialProduct,
    type CommercialRevenueCategory,
} from "@/lib/commercial/commercialProducts";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import type {
    ProgramCatalogItem,
    ProgramPublicationSnapshot,
} from "@/lib/programs/publication/programPublicationService";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";

function JsonSummary({ value, empty }: { value: Record<string, unknown>; empty: string }) {
    const entries = Object.entries(value);
    if (entries.length === 0) return <p className="text-sm text-alloy-midnight/50">{empty}</p>;
    return (
        <dl className="divide-y divide-alloy-stone/20">
            {entries.map(([key, item]) => (
                <div key={key} className="grid gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <dt className="text-xs font-semibold text-alloy-midnight/50">{key.replaceAll("_", " ")}</dt>
                    <dd className="text-sm text-alloy-midnight/70">
                        {typeof item === "string" || typeof item === "number" || typeof item === "boolean"
                            ? String(item)
                            : JSON.stringify(item)}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export function ProgramRequirementsSection({
    program,
    onEdit,
}: {
    program: ProgramCatalogItem;
    onEdit: () => void;
}) {
    const audience = program.draft.audience;
    const minimum = typeof audience.minimumAge === "number" ? audience.minimumAge : null;
    const maximum = typeof audience.maximumAge === "number" ? audience.maximumAge : null;
    const audienceLabel =
        minimum != null && maximum != null ? `Ages ${minimum}–${maximum}`
        : minimum != null ? `Age ${minimum}+`
        : maximum != null ? `Up to age ${maximum}`
        : "No audience range specified";
    return (
        <div className="space-y-4" data-testid="program-requirements-runtime">
            <ConfigWorkspaceCard
                title="Program requirements"
                description="Organization-owned conditions that define who this Program serves and what delivery requires."
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="config-runtime-object-cell">
                        <p className="config-typo-field-label">Audience</p>
                        <p className="mt-1 text-sm font-semibold text-alloy-midnight">{audienceLabel}</p>
                    </div>
                    <div className="config-runtime-object-cell">
                        <p className="config-typo-field-label">Qualification requirements</p>
                        <p className="mt-1 text-sm text-alloy-midnight/70">
                            {program.draft.qualificationRequirements.length > 0
                                ? program.draft.qualificationRequirements.map(String).join(", ")
                                : "None specified"}
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="config-typo-field-label mb-1">Eligibility</p>
                    <JsonSummary value={program.draft.eligibility} empty="No additional eligibility rules specified." />
                </div>
                <ConfigurationSecondaryButton className="mt-4" onClick={onEdit}>
                    Edit definition and requirements
                </ConfigurationSecondaryButton>
            </ConfigWorkspaceCard>
        </div>
    );
}

export function ProgramResourcesSection({
    program,
    snapshot,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
}) {
    const availability = snapshot.availability.filter(
        (item) => item.programId === program.id || item.programKey === program.key,
    );
    const authorized = availability.filter((item) => item.localAuthorizationEvidence).length;
    return (
        <div className="space-y-4" data-testid="program-resources-runtime">
            <ConfigWorkspaceCard
                title="Resource requirements"
                description="The Organization defines the reusable requirement; each Location owns concrete rooms, capacity, evidence, and schedules."
            >
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="config-runtime-object-cell">
                        <p className="config-typo-field-label">Required resource type</p>
                        <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                            {program.draft.requiredResourceType ?? "Not specified"}
                        </p>
                    </div>
                    <div className="config-runtime-object-cell">
                        <p className="config-typo-field-label">Locations with local evidence</p>
                        <p className="mt-1 text-sm font-semibold text-alloy-midnight">{authorized} of {availability.length}</p>
                    </div>
                    <div className="config-runtime-object-cell">
                        <p className="config-typo-field-label">Resource ownership</p>
                        <p className="mt-1 text-sm text-alloy-midnight/70">Location-owned</p>
                    </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-alloy-midnight/55">
                    Room participation, capacity, and schedule availability remain authoritative in each Location workspace.
                </p>
                <Link href="/organization/locations" className="mt-3 inline-block text-sm font-semibold text-alloy-bend-pine">
                    Review Location resources →
                </Link>
            </ConfigWorkspaceCard>
        </div>
    );
}

export function ProgramAvailabilitySection({
    program,
    snapshot,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
}) {
    const availabilityByLocation = new Map(
        snapshot.availability
            .filter((item) => item.programId === program.id || item.programKey === program.key)
            .map((item) => [item.locationId, item]),
    );
    const assignmentByLocation = new Map(
        snapshot.assignments
            .filter((item) => item.programId === program.id)
            .map((item) => [item.locationId, item]),
    );
    return (
        <ConfigWorkspaceCard
            title="Locations · assignment vs local availability"
            description="Organization assignment and Location-owned local availability are independent. Assignment does not enable offering; local availability does not publish."
            testId="program-availability-runtime"
        >
            <div className="divide-y divide-alloy-stone/20">
                {snapshot.locations.map((location) => {
                    const availability = availabilityByLocation.get(location.id);
                    const assignment = assignmentByLocation.get(location.id);
                    return (
                        <div key={location.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                            <div>
                                <p className="text-sm font-semibold text-alloy-midnight">{location.label}</p>
                                <p className="mt-0.5 text-xs text-alloy-midnight/50">
                                    {assignment ? `Assigned Revision ${assignment.revisionNumber ?? "—"}` : "Not assigned"}
                                    {availability?.localAuthorizationEvidence ? " · Local evidence present" : " · Local evidence not recorded"}
                                </p>
                            </div>
                            <span className={`text-xs font-semibold ${availability?.offered ? "text-alloy-bend-pine" : "text-alloy-midnight/45"}`}>
                                {availability?.offered ? "Offered locally" : "Not offered locally"}
                            </span>
                            <Link
                                href={`/organization/locations?locationId=${encodeURIComponent(location.id)}&tab=programs`}
                                className="text-xs font-semibold text-alloy-bend-pine"
                            >
                                Open Location →
                            </Link>
                        </div>
                    );
                })}
            </div>
        </ConfigWorkspaceCard>
    );
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(url, init);
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof json.error === "string" ? json.error : "The change could not be completed.");
    return json;
}

export function ProgramOfferingsSection({
    program,
    snapshot,
    canManage,
    onReload,
    onError,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
    canManage: boolean;
    onReload: () => Promise<void>;
    onError: (message: string) => void;
}) {
    const offerings = useMemo(
        () => snapshot.offerings.filter((offering) => offering.program_key === program.key),
        [program.key, snapshot.offerings],
    );
    const [attendanceType, setAttendanceType] = useState<AttendanceType>("full_time");
    const [offeringLabel, setOfferingLabel] = useState("");
    const [working, setWorking] = useState(false);

    async function act(action: () => Promise<unknown>) {
        setWorking(true);
        try {
            await action();
            await onReload();
        } catch (error) {
            onError(error instanceof Error ? error.message : "The offering could not be updated.");
        } finally {
            setWorking(false);
        }
    }

    return (
        <div className="space-y-4" data-testid="program-offerings-runtime">
            <ConfigWorkspaceCard
                title="Offerings"
                description="Attendance and delivery shapes beneath this Program. Pricing attaches to offering variants."
            >
                <div className="space-y-3">
                    {offerings.map((offering) => {
                        const variants = snapshot.variants.filter((variant) => variant.offering_id === offering.id);
                        return (
                            <section key={offering.id} className="rounded-lg border border-alloy-stone/25 px-4 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-alloy-midnight">{offering.label}</p>
                                        <p className="text-xs text-alloy-midnight/50">
                                            {ATTENDANCE_TYPE_LABELS[offering.attendance_type]} · {offering.status}
                                        </p>
                                    </div>
                                    {canManage ?
                                        <button
                                            type="button"
                                            disabled={working}
                                            className="text-xs font-semibold text-alloy-midnight/45 hover:text-alloy-bend-pine"
                                            onClick={() => void act(() => requestJson(`/api/admin/programs/offerings/${offering.id}`, {
                                                method: "DELETE",
                                            }))}
                                        >
                                            Remove
                                        </button>
                                    :   null}
                                </div>
                                {canManage ?
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                                        <label>
                                            <span className="config-typo-field-label">Label</span>
                                            <input
                                                className="config-runtime-input mt-1 text-xs"
                                                defaultValue={offering.label}
                                                onBlur={(event) => {
                                                    const label = event.target.value.trim();
                                                    if (label && label !== offering.label) {
                                                        void act(() => requestJson(`/api/admin/programs/offerings/${offering.id}`, {
                                                            method: "PATCH",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ label }),
                                                        }));
                                                    }
                                                }}
                                            />
                                        </label>
                                        <label>
                                            <span className="config-typo-field-label">Status</span>
                                            <select
                                                className="config-runtime-select mt-1 text-xs"
                                                value={offering.status}
                                                onChange={(event) => void act(() => requestJson(`/api/admin/programs/offerings/${offering.id}`, {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ status: event.target.value as OfferingStatus }),
                                                }))}
                                            >
                                                {Object.entries(OFFERING_STATUS_LABELS).map(([key, label]) => (
                                                    <option key={key} value={key}>{label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label>
                                            <span className="config-typo-field-label">Effective start</span>
                                            <input
                                                type="date"
                                                className="config-runtime-input mt-1 text-xs"
                                                defaultValue={offering.effective_start ?? ""}
                                                onBlur={(event) => void act(() => requestJson(`/api/admin/programs/offerings/${offering.id}`, {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ effective_start: event.target.value || null }),
                                                }))}
                                            />
                                        </label>
                                        <label>
                                            <span className="config-typo-field-label">Effective end</span>
                                            <input
                                                type="date"
                                                className="config-runtime-input mt-1 text-xs"
                                                defaultValue={offering.effective_end ?? ""}
                                                onBlur={(event) => void act(() => requestJson(`/api/admin/programs/offerings/${offering.id}`, {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ effective_end: event.target.value || null }),
                                                }))}
                                            />
                                        </label>
                                        <label>
                                            <span className="config-typo-field-label">Order</span>
                                            <input
                                                type="number"
                                                className="config-runtime-input mt-1 text-xs"
                                                defaultValue={offering.sort_order}
                                                onBlur={(event) => {
                                                    const sortOrder = Number(event.target.value);
                                                    if (Number.isFinite(sortOrder) && sortOrder !== offering.sort_order) {
                                                        void act(() => requestJson(`/api/admin/programs/offerings/${offering.id}`, {
                                                            method: "PATCH",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ sort_order: sortOrder }),
                                                        }));
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                :   null}
                                <div className="mt-3 border-t border-alloy-stone/20 pt-3">
                                    {canManage ?
                                        <VariantBulkBuilder
                                            offering={offering}
                                            variants={variants}
                                            rates={snapshot.tuitionRates}
                                            onAddVariants={async (items) => {
                                                await act(async () => {
                                                    for (const item of items) {
                                                        await requestJson(`/api/admin/programs/offerings/${offering.id}/variants`, {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify(item),
                                                        });
                                                    }
                                                });
                                            }}
                                            onUpdateVariant={async (id, fields) => {
                                                await act(() => requestJson(
                                                    `/api/admin/programs/offerings/${offering.id}/variants/${id}`,
                                                    {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify(fields),
                                                    },
                                                ));
                                            }}
                                            onDeleteVariant={async (id) => {
                                                await act(() => requestJson(
                                                    `/api/admin/programs/offerings/${offering.id}/variants/${id}`,
                                                    { method: "DELETE" },
                                                ));
                                            }}
                                        />
                                    :   <div className="flex flex-wrap gap-2">
                                            {variants.map((variant) => (
                                                <span key={variant.id} className="rounded-full border border-alloy-stone/25 px-2.5 py-1 text-xs text-alloy-midnight/65">
                                                    {describeVariant(variant)}{variant.status !== "active" ? ` · ${variant.status}` : ""}
                                                </span>
                                            ))}
                                            {variants.length === 0 ? <span className="text-xs text-alloy-midnight/40">No variants</span> : null}
                                        </div>
                                    }
                                </div>
                            </section>
                        );
                    })}
                    {offerings.length === 0 ?
                        <p className="text-sm text-alloy-midnight/50">No offerings configured yet.</p>
                    :   null}
                </div>
                {canManage ?
                    <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-alloy-stone/20 pt-4">
                        <label>
                            <span className="config-typo-field-label">Offering type</span>
                            <select
                                className="config-runtime-select mt-1 text-xs"
                                value={attendanceType}
                                onChange={(event) => setAttendanceType(event.target.value as AttendanceType)}
                            >
                                {Object.entries(ATTENDANCE_TYPE_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="min-w-48 flex-1">
                            <span className="config-typo-field-label">Label</span>
                            <input
                                className="config-runtime-input mt-1 text-xs"
                                value={offeringLabel}
                                placeholder={ATTENDANCE_TYPE_LABELS[attendanceType]}
                                onChange={(event) => setOfferingLabel(event.target.value)}
                            />
                        </label>
                        <ConfigurationPrimaryButton
                            disabled={working}
                            onClick={() => void act(async () => {
                                await requestJson("/api/admin/programs/offerings", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        program_key: program.key,
                                        attendance_type: attendanceType,
                                        label: offeringLabel.trim() || ATTENDANCE_TYPE_LABELS[attendanceType],
                                    }),
                                });
                                setOfferingLabel("");
                            })}
                        >
                            Add offering
                        </ConfigurationPrimaryButton>
                    </div>
                :   null}
            </ConfigWorkspaceCard>
        </div>
    );
}

export function ProgramPricingSection({
    program,
    snapshot,
    canManage,
    onReload,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
    canManage: boolean;
    onReload: () => Promise<void>;
}) {
    type ProgramPricingView = "rates" | "catalog" | "preview";
    const [activeView, setActiveView] = useState<ProgramPricingView>("rates");
    const [products, setProducts] = useState<CommercialProduct[]>(() =>
        sortProducts(snapshot.products.filter((product) => product.program_key === program.key)),
    );
    const [categories, setCategories] = useState<CommercialCategory[]>([]);
    const [revenueCategories, setRevenueCategories] = useState<CommercialRevenueCategory[]>([]);
    const [cadences, setCadences] = useState<BillingCadence[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            fetch("/api/admin/commercial/categories?include_inactive=true").then((response) => response.json()),
            fetch("/api/admin/commercial/revenue-categories").then((response) => response.json()),
            fetch("/api/admin/commercial/billing-cadences").then((response) => response.json()),
        ])
            .then(([categoryResult, revenueResult, cadenceResult]) => {
                if (cancelled) return;
                setCategories((categoryResult as { categories?: CommercialCategory[] }).categories ?? []);
                setRevenueCategories(
                    (revenueResult as { revenue_categories?: CommercialRevenueCategory[] }).revenue_categories ?? [],
                );
                setCadences((cadenceResult as { cadences?: BillingCadence[] }).cadences ?? []);
            })
            .catch((nextError) => {
                if (!cancelled) {
                    setError(nextError instanceof Error ? nextError.message : "Supporting configuration is unavailable.");
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [program.key]);

    const programOption = [{ key: program.key, label: program.draft.label, siteCount: snapshot.locations.length }];
    const locationOptions = snapshot.locations.map((location) => ({ id: location.id, name: location.label }));
    const views: Array<{ key: ProgramPricingView; label: string; description: string }> = [
        { key: "rates", label: "Tuition rates", description: "Canonical rate editor" },
        { key: "catalog", label: "Fees & add-ons", description: "Program catalog" },
        { key: "preview", label: "Pricing preview", description: "Read-only execution" },
    ];

    return (
        <div className="space-y-4" data-testid="program-pricing-runtime">
            <ConfigWorkspaceCard
                title="Pricing"
                description="Commercial owns pricing. Rates, Program-scoped fees, and execution preview are composed here as one discoverable concern."
            >
                <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Program pricing concerns">
                    {views.map((view) => (
                        <button
                            key={view.key}
                            type="button"
                            role="tab"
                            aria-selected={activeView === view.key}
                            className={`rounded-lg border px-3 py-2 text-left ${
                                activeView === view.key
                                    ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.07] text-alloy-bend-pine"
                                    : "border-alloy-stone/25 text-alloy-midnight/60 hover:border-alloy-bend-pine/30"
                            }`}
                            onClick={() => setActiveView(view.key)}
                            data-testid={`program-pricing-view-${view.key}`}
                        >
                            <span className="block text-xs font-semibold">{view.label}</span>
                            <span className="mt-0.5 block text-[10px] text-current/65">{view.description}</span>
                        </button>
                    ))}
                </div>
            </ConfigWorkspaceCard>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            : activeView === "rates" ?
                <ConfigWorkspaceCard
                    title="Tuition rate matrix"
                    description="The sole tuition-rate editing surface. Edit Organization defaults, effective dates, inheritance, and Location differences here."
                >
                    <TuitionGridWorkspace
                        programKey={program.key}
                        embedded
                        canManage={canManage}
                        scopedRates={snapshot.tuitionRates}
                        scopedLocations={snapshot.locations.map((location) => ({
                            id: location.id,
                            name: location.label,
                        }))}
                        onReload={onReload}
                    />
                </ConfigWorkspaceCard>
            : activeView === "catalog" ?
                <CommercialCatalogPanel
                    products={products}
                    categories={categories}
                    revenueCategories={revenueCategories}
                    locations={locationOptions}
                    programs={programOption}
                    loading={loading}
                    focusProgramKey={program.key}
                    canManage={canManage}
                    onProductCreated={(product) => setProducts((current) => sortProducts([...current, product]))}
                    onProductUpdated={(product) =>
                        setProducts((current) =>
                            sortProducts(current.map((item) => item.id === product.id ? product : item)),
                        )
                    }
                    onProductDeleted={(id) => setProducts((current) => current.filter((item) => item.id !== id))}
                    onCategoryCreated={(category) => setCategories((current) => [...current, category])}
                />
            :
                <ConfigWorkspaceCard
                    title="Pricing preview"
                    description="Read-only execution preview using this Program's current offerings, rates, products, and policies."
                >
                    <CommercialSimulatorPanel
                        programs={programOption}
                        cadences={cadences}
                        focusProgramKey={program.key}
                        embedded
                    />
                </ConfigWorkspaceCard>
            }
        </div>
    );
}

export function ProgramPoliciesSection({
    program,
    snapshot,
    canManage,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
    canManage: boolean;
}) {
    const programs = [{ key: program.key, label: program.draft.label, siteCount: snapshot.locations.length }];
    const locations = snapshot.locations.map((location) => ({ id: location.id, name: location.label }));
    return (
        <div className="space-y-4" data-testid="program-policies-runtime">
            <ConfigWorkspaceCard
                title="Policy posture"
                description="Commercial owns policy resolution. Programs exposes the rules scoped to this Program, its offerings, and variants."
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <p className="config-typo-field-label mb-1">Default policy references</p>
                        <JsonSummary value={program.draft.defaultPolicyRefs} empty="No default policy references specified." />
                    </div>
                    <div>
                        <p className="config-typo-field-label mb-1">Default commercial posture</p>
                        <JsonSummary value={program.draft.defaultCommercialPosture} empty="No default commercial posture specified." />
                    </div>
                </div>
            </ConfigWorkspaceCard>
            <ConfigWorkspaceCard
                title="Program policies"
                description="Registry-driven policy authoring remains on the authoritative Commercial mutation path."
            >
                <CommercialPoliciesPanel
                    programs={programs}
                    locations={locations}
                    focusProgramKey={program.key}
                    embedded
                    canManage={canManage}
                />
            </ConfigWorkspaceCard>
        </div>
    );
}

export function ProgramRelationshipsSection({
    program,
    snapshot,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
}) {
    const products = sortProducts(snapshot.products.filter((product) => product.program_key === program.key));
    const [revenueCategories, setRevenueCategories] = useState<CommercialRevenueCategory[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetch("/api/admin/commercial/revenue-categories")
            .then(async (response) => {
                if (!response.ok) throw new Error("Accounting relationships are temporarily unavailable.");
                return response.json() as Promise<{ revenue_categories?: CommercialRevenueCategory[] }>;
            })
            .then((result) => {
                if (!cancelled) setRevenueCategories(result.revenue_categories ?? []);
            })
            .catch((nextError) => {
                if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Accounting relationships are unavailable.");
            });
        return () => {
            cancelled = true;
        };
    }, [program.key]);

    const revenueCategoryById = new Map(revenueCategories.map((category) => [category.id, category]));
    return (
        <div className="space-y-4" data-testid="program-relationships-runtime">
            <ConfigWorkspaceCard
                title="Revenue and accounting"
                description="Commercial defines each charge. Accounting remains authoritative for revenue mapping."
            >
                {error ? <p className="text-sm text-alloy-ember">{error}</p> : null}
                <div className="divide-y divide-alloy-stone/20">
                    {products.map((product) => {
                        const revenueCategory =
                            product.revenue_category_id ? revenueCategoryById.get(product.revenue_category_id) : null;
                        return (
                            <div key={product.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div>
                                    <p className="text-sm font-semibold text-alloy-midnight">{product.name}</p>
                                    <p className="text-xs text-alloy-midnight/50">
                                        {revenueCategory?.label ?? product.revenue_category ?? "No revenue category"}
                                    </p>
                                </div>
                                <span className={`text-xs font-semibold ${
                                    revenueCategory?.mapped_gl_account_id ? "text-alloy-bend-pine" : "text-alloy-ember"
                                }`}>
                                    {revenueCategory?.mapped_gl_account_id ? "Accounting mapped" : "Needs accounting mapping"}
                                </span>
                            </div>
                        );
                    })}
                    {products.length === 0 ?
                        <p className="py-3 text-sm text-alloy-midnight/50">No Program-scoped catalog items.</p>
                    :   null}
                </div>
                <Link
                    href="/settings/commercial?chapter=accounting"
                    className="mt-3 inline-block text-sm font-semibold text-alloy-bend-pine"
                >
                    Open accounting configuration →
                </Link>
            </ConfigWorkspaceCard>
            <ConfigWorkspaceCard
                title="Operational consumers"
                description="Programs provide reusable definitions to downstream systems without moving their operational truth."
            >
                <ul className="space-y-2 text-sm text-alloy-midnight/65">
                    <li>Enrollment uses Program identity, offering, and requirement context.</li>
                    <li>Rooms, capacity, schedules, and local availability remain Location-owned.</li>
                    <li>Waitlists and placement consume Program identity and Location availability.</li>
                    <li>Funding responsibility remains owned by Processing.</li>
                </ul>
            </ConfigWorkspaceCard>
        </div>
    );
}
