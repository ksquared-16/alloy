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
import { formatRateCents, parseDollarsToCents } from "@/lib/commercial/tuitionRates";
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
                <Link href="/settings/locations" className="mt-3 inline-block text-sm font-semibold text-alloy-bend-pine">
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
            title="Location availability"
            description="Assignment makes a revision available. Each Location independently owns whether it offers the Program."
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
                                href={`/settings/locations?locationId=${encodeURIComponent(location.id)}&section=programs`}
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
    onError,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
    canManage: boolean;
    onReload: () => Promise<void>;
    onError: (message: string) => void;
}) {
    const offerings = snapshot.offerings.filter((offering) => offering.program_key === program.key);
    const offeringIds = new Set(offerings.map((offering) => offering.id));
    const variants = snapshot.variants.filter((variant) => offeringIds.has(variant.offering_id));
    const variantIds = new Set(variants.map((variant) => variant.id));
    const rates = snapshot.tuitionRates.filter((rate) => variantIds.has(rate.variant_id));
    const offeringById = new Map(offerings.map((offering) => [offering.id, offering]));
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const policies = snapshot.policies.filter((policy) =>
        policy.programKey === program.key
        || (policy.offeringId != null && offeringIds.has(policy.offeringId))
        || (policy.variantId != null && variantIds.has(policy.variantId)),
    );
    const [rateVariantId, setRateVariantId] = useState(variants[0]?.id ?? "");
    const [rateCadence, setRateCadence] = useState("monthly");
    const [rateLocationId, setRateLocationId] = useState("");
    const [rateAmount, setRateAmount] = useState("");
    const [notOffered, setNotOffered] = useState(false);
    const [savingRate, setSavingRate] = useState(false);

    async function saveRate() {
        const cents = notOffered ? 0 : parseDollarsToCents(rateAmount);
        if (!rateVariantId || cents == null) {
            onError("Choose a variant and enter a valid non-negative rate.");
            return;
        }
        setSavingRate(true);
        try {
            await requestJson("/api/admin/commercial/tuition-rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    variant_id: rateVariantId,
                    cadence_key: rateCadence,
                    location_id: rateLocationId || null,
                    rate_cents: cents,
                    not_offered: notOffered,
                }),
            });
            setRateAmount("");
            await onReload();
        } catch (error) {
            onError(error instanceof Error ? error.message : "The rate could not be saved.");
        } finally {
            setSavingRate(false);
        }
    }
    return (
        <div className="space-y-4" data-testid="program-pricing-runtime">
            <ConfigWorkspaceCard
                title="Pricing"
                description="Commercial pricing remains authoritative while this Program shows the rates and policies connected to its offerings."
            >
                <div className="divide-y divide-alloy-stone/20">
                    {rates.map((rate) => {
                        const variant = variantById.get(rate.variant_id);
                        const offering = variant ? offeringById.get(variant.offering_id) : null;
                        return (
                            <div key={rate.id} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                                <span className="text-sm font-semibold text-alloy-midnight">
                                    {offering?.label ?? "Offering"} · {variant ? describeVariant(variant) : "Variant"}
                                </span>
                                <span className="text-xs text-alloy-midnight/55">{rate.location_id ? "Location override" : "Organization default"}</span>
                                <span className="text-sm font-semibold text-alloy-midnight">
                                    {rate.not_offered ? "Not offered" : `${formatRateCents(rate.rate_cents)} · ${rate.cadence_key}`}
                                </span>
                            </div>
                        );
                    })}
                    {rates.length === 0 ? <p className="py-3 text-sm text-alloy-midnight/50">No pricing configured.</p> : null}
                </div>
                {canManage && variants.length > 0 ?
                    <div className="mt-4 grid gap-2 border-t border-alloy-stone/20 pt-4 sm:grid-cols-2 lg:grid-cols-5">
                        <label>
                            <span className="config-typo-field-label">Offering variant</span>
                            <select
                                className="config-runtime-select mt-1 text-xs"
                                value={rateVariantId}
                                onChange={(event) => setRateVariantId(event.target.value)}
                            >
                                {variants.map((variant) => (
                                    <option key={variant.id} value={variant.id}>
                                        {offeringById.get(variant.offering_id)?.label ?? "Offering"} · {describeVariant(variant)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span className="config-typo-field-label">Scope</span>
                            <select
                                className="config-runtime-select mt-1 text-xs"
                                value={rateLocationId}
                                onChange={(event) => setRateLocationId(event.target.value)}
                            >
                                <option value="">Organization default</option>
                                {snapshot.locations.map((location) => (
                                    <option key={location.id} value={location.id}>{location.label}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span className="config-typo-field-label">Cadence</span>
                            <select
                                className="config-runtime-select mt-1 text-xs"
                                value={rateCadence}
                                onChange={(event) => setRateCadence(event.target.value)}
                            >
                                {["monthly", "weekly", "biweekly", "annual"].map((cadence) => (
                                    <option key={cadence} value={cadence}>{cadence}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span className="config-typo-field-label">Rate</span>
                            <input
                                className="config-runtime-input mt-1 text-xs"
                                value={rateAmount}
                                placeholder="$0"
                                disabled={notOffered}
                                onChange={(event) => setRateAmount(event.target.value)}
                            />
                        </label>
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="mb-2 flex items-center gap-1.5 text-xs text-alloy-midnight/60">
                                <input
                                    type="checkbox"
                                    checked={notOffered}
                                    onChange={(event) => setNotOffered(event.target.checked)}
                                />
                                Not offered
                            </label>
                            <ConfigurationPrimaryButton
                                disabled={savingRate || (!notOffered && !rateAmount.trim())}
                                onClick={() => void saveRate()}
                            >
                                {savingRate ? "Saving…" : "Save rate"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                :   null}
                <Link href="/settings/commercial" className="mt-3 inline-block text-sm font-semibold text-alloy-bend-pine">
                    Open full pricing workspace →
                </Link>
            </ConfigWorkspaceCard>
            <ConfigWorkspaceCard
                title="Related policies"
                description="Program, offering, and variant policies that participate in Commercial resolution."
            >
                <div className="mb-4 grid gap-4 border-b border-alloy-stone/20 pb-4 sm:grid-cols-2">
                    <div>
                        <p className="config-typo-field-label mb-1">Default policy references</p>
                        <JsonSummary
                            value={program.draft.defaultPolicyRefs}
                            empty="No default policy references specified."
                        />
                    </div>
                    <div>
                        <p className="config-typo-field-label mb-1">Default commercial posture</p>
                        <JsonSummary
                            value={program.draft.defaultCommercialPosture}
                            empty="No default commercial posture specified."
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    {policies.map((policy) => (
                        <div key={policy.id} className="rounded-lg border border-alloy-stone/20 px-3 py-2">
                            <p className="text-sm font-semibold text-alloy-midnight">{policy.label ?? policy.policyType.replaceAll("_", " ")}</p>
                            <p className="text-xs text-alloy-midnight/50">{policy.scopeType} scope · {policy.active ? "Active" : "Inactive"}</p>
                        </div>
                    ))}
                    {policies.length === 0 ? <p className="text-sm text-alloy-midnight/50">No related policies.</p> : null}
                </div>
                <Link href="/settings/commercial" className="mt-3 inline-block text-sm font-semibold text-alloy-bend-pine">
                    Manage policies →
                </Link>
            </ConfigWorkspaceCard>
            <ConfigWorkspaceCard
                title="Pricing configuration"
                description="Edit Organization defaults, inspect inheritance, compare Locations, clear overrides, copy defaults, and manage effective dates."
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
        </div>
    );
}

type ProgramConfigurationView = "catalog" | "policies" | "preview" | "relationships";

export function ProgramConfigurationSection({
    program,
    snapshot,
    canManage,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
    canManage: boolean;
}) {
    const [activeView, setActiveView] = useState<ProgramConfigurationView>("catalog");
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
    const revenueCategoryById = new Map(revenueCategories.map((category) => [category.id, category]));
    const views: Array<{ key: ProgramConfigurationView; label: string }> = [
        { key: "catalog", label: "Catalog" },
        { key: "policies", label: "Policies" },
        { key: "preview", label: "Pricing preview" },
        { key: "relationships", label: "Relationships" },
    ];

    return (
        <div className="space-y-4" data-testid="program-configuration-runtime">
            <ConfigWorkspaceCard
                title="Supporting configuration"
                description="Program-scoped products, policies, previews, and authority relationships from the mature Commercial domain."
            >
                <div className="flex overflow-x-auto border-b border-alloy-stone/20">
                    {views.map((view) => (
                        <button
                            key={view.key}
                            type="button"
                            className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold ${
                                activeView === view.key
                                    ? "border-alloy-bend-pine text-alloy-bend-pine"
                                    : "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/75"
                            }`}
                            onClick={() => setActiveView(view.key)}
                            data-testid={`program-configuration-${view.key}`}
                        >
                            {view.label}
                        </button>
                    ))}
                </div>
            </ConfigWorkspaceCard>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
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
            : activeView === "policies" ?
                <ConfigWorkspaceCard
                    title="Program policies"
                    description="Registry-driven rules scoped to this Program, its offerings, or its variants."
                >
                    <CommercialPoliciesPanel
                        programs={programOption}
                        locations={locationOptions}
                        focusProgramKey={program.key}
                        embedded
                        canManage={canManage}
                    />
                </ConfigWorkspaceCard>
            : activeView === "preview" ?
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
            :   <div className="space-y-4" data-testid="program-configuration-relationships-panel">
                    <ConfigWorkspaceCard
                        title="Revenue and accounting"
                        description="Commercial defines the charge; Accounting owns where revenue posts."
                    >
                        <div className="divide-y divide-alloy-stone/20">
                            {products.map((product) => {
                                const revenueCategory =
                                    product.revenue_category_id
                                        ? revenueCategoryById.get(product.revenue_category_id)
                                        : null;
                                return (
                                    <div key={product.id} className="flex items-center justify-between gap-3 py-2.5">
                                        <div>
                                            <p className="text-sm font-semibold text-alloy-midnight">{product.name}</p>
                                            <p className="text-xs text-alloy-midnight/50">
                                                {revenueCategory?.label ?? product.revenue_category ?? "No revenue category"}
                                            </p>
                                        </div>
                                        <span className={`text-xs font-semibold ${
                                            revenueCategory?.mapped_gl_account_id
                                                ? "text-alloy-bend-pine"
                                                : "text-alloy-ember"
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
                        <Link href="/settings/commercial" className="mt-3 inline-block text-sm font-semibold text-alloy-bend-pine">
                            Open accounting configuration →
                        </Link>
                    </ConfigWorkspaceCard>
                    <ConfigWorkspaceCard
                        title="Operational consumers"
                        description="Programs provide reusable definitions to downstream systems without moving their operational truth."
                    >
                        <ul className="space-y-2 text-sm text-alloy-midnight/65">
                            <li>Enrollment uses Program identity, offering, and requirement context.</li>
                            <li>Rooms, capacity, and schedules remain Location-owned.</li>
                            <li>Waitlists and placement consume Program identity and Location availability.</li>
                            <li>Funding responsibility remains owned by Processing.</li>
                        </ul>
                    </ConfigWorkspaceCard>
                </div>
            }
        </div>
    );
}
