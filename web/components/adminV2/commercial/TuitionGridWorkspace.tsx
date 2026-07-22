"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ConfigScopeSelector, type ScopedLocation } from "@/components/configRuntime/ConfigScopeSelector";
import { ConfigReadinessCard } from "@/components/configRuntime/ConfigReadinessCard";
import OwnershipBadge from "@/components/configRuntime/OwnershipBadge";
import type { ConfigScope } from "@/lib/configRuntime/scope";
import {
    type TuitionRateRow,
    formatRateCents,
    parseDollarsToCents,
    tuitionRateCellKey,
    buildTuitionRateMap,
    buildLocationOnlyRateMap,
    computeTuitionReadiness,
} from "@/lib/commercial/tuitionRates";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import type { ProgramOffering } from "@/lib/programs/programOfferings";
import {
    type ProgramOfferingVariant,
    describeVariant,
    sortVariants,
    groupVariantsByOffering,
    isDefaultVariant,
} from "@/lib/programs/programOfferingVariants";

// ─── TuitionCell ─────────────────────────────────────────────────────────────

type CellProps = {
    variantId: string;
    cadenceKey: string;
    rateRow: TuitionRateRow | undefined;
    orgDefaultRow: TuitionRateRow | undefined;
    locationId: string | null;
    onSave: (
        variantId: string,
        cadenceKey: string,
        payload: {
            rate_cents?: number;
            not_offered?: boolean;
            effective_start?: string | null;
            effective_end?: string | null;
        },
    ) => Promise<void>;
    onClear: (rateId: string) => Promise<void>;
    canManage: boolean;
};

function TuitionCell({
    variantId,
    cadenceKey,
    rateRow,
    orgDefaultRow,
    locationId,
    onSave,
    onClear,
    canManage,
}: CellProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [effectiveStart, setEffectiveStart] = useState("");
    const [effectiveEnd, setEffectiveEnd] = useState("");
    const [dateError, setDateError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isLocationView = locationId !== null;
    const isLocOverride = isLocationView && rateRow?.location_id === locationId;
    const isInherited = isLocationView && rateRow?.location_id === null;
    const isNotOffered = rateRow?.not_offered === true;
    const displayRate = rateRow && !isNotOffered ? rateRow.rate_cents : null;
    const inheritedRate = isInherited ? orgDefaultRow?.rate_cents : null;

    function startEdit() {
        if (!canManage || isNotOffered) return;
        setDraft(displayRate != null ? String(displayRate / 100) : "");
        setEffectiveStart(rateRow?.effective_start ?? "");
        setEffectiveEnd(rateRow?.effective_end ?? "");
        setDateError(null);
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 0);
    }

    async function commitEdit() {
        const cents = parseDollarsToCents(draft);
        if (cents === null) {
            setDateError("Enter a valid non-negative rate.");
            return;
        }
        if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
            setDateError("Effective end must be on or after effective start.");
            return;
        }
        setSaving(true);
        await onSave(variantId, cadenceKey, {
            rate_cents: cents,
            effective_start: effectiveStart || null,
            effective_end: effectiveEnd || null,
        });
        setSaving(false);
        setEditing(false);
    }

    async function toggleNotOffered() {
        setSaving(true);
        await onSave(variantId, cadenceKey, { not_offered: !isNotOffered });
        setSaving(false);
    }

    async function clearOverride() {
        if (!rateRow?.id) return;
        setSaving(true);
        await onClear(rateRow.id);
        setSaving(false);
    }

    if (editing) {
        return (
            <td className="min-w-56 px-3 py-2" data-testid={`tuition-rate-editor-${variantId}-${cadenceKey}`}>
                <div className="space-y-2">
                    <label className="block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Rate</span>
                        <input
                            ref={inputRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void commitEdit();
                                if (e.key === "Escape") setEditing(false);
                            }}
                            className="mt-0.5 w-full rounded border border-pine-400 px-2 py-1 text-right text-sm focus:outline-none"
                            placeholder="0.00"
                            autoFocus
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                        <label>
                            <span className="text-[10px] font-semibold text-gray-500">Effective from</span>
                            <input
                                type="date"
                                value={effectiveStart}
                                onChange={(event) => {
                                    setEffectiveStart(event.target.value);
                                    setDateError(null);
                                }}
                                className="mt-0.5 w-full rounded border border-gray-200 px-1.5 py-1 text-[11px]"
                                data-testid="tuition-rate-effective-start"
                            />
                        </label>
                        <label>
                            <span className="text-[10px] font-semibold text-gray-500">Effective until</span>
                            <input
                                type="date"
                                value={effectiveEnd}
                                min={effectiveStart || undefined}
                                onChange={(event) => {
                                    setEffectiveEnd(event.target.value);
                                    setDateError(null);
                                }}
                                className="mt-0.5 w-full rounded border border-gray-200 px-1.5 py-1 text-[11px]"
                                data-testid="tuition-rate-effective-end"
                            />
                        </label>
                    </div>
                    {dateError ? <p className="text-[10px] text-red-600">{dateError}</p> : null}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className="text-[11px] font-medium text-gray-500"
                            onClick={() => setEditing(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded bg-pine-600 px-2 py-1 text-[11px] font-semibold text-white"
                            onClick={() => void commitEdit()}
                            disabled={saving}
                        >
                            {saving ? "Saving…" : "Save rate"}
                        </button>
                    </div>
                </div>
            </td>
        );
    }

    return (
        <td
            className={[
                "px-3 py-2 text-right text-sm group relative select-none",
                isNotOffered ? "text-gray-300" : isInherited ? "text-gray-400 italic" : "text-gray-800",
                saving || !canManage ? "opacity-70" : "cursor-pointer hover:bg-gray-50",
            ].join(" ")}
            onClick={isNotOffered ? undefined : startEdit}
            title={
                isInherited
                    ? "Inherited from Organization — click to create a Location override"
                    : isLocOverride
                      ? "Location override — × restores Organization default"
                      : undefined
            }
        >
            {isNotOffered ? (
                <span className="flex items-center justify-end gap-1">
                    <span className="text-xs text-gray-300 line-through">N/A</span>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }}
                        className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        title="Mark as offered"
                    >
                        ↩
                    </button>
                </span>
            ) : displayRate != null ? (
                <span className="flex items-center justify-end gap-1">
                    {isLocOverride && (
                        <span className="w-1.5 h-1.5 rounded-full bg-pine-500 flex-shrink-0" />
                    )}
                    <span>{formatRateCents(displayRate)}</span>
                    {canManage && isLocOverride && rateRow?.id && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void clearOverride(); }}
                            className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-xs leading-none"
                            title="Restore Organization default"
                        >
                            ×
                        </button>
                    )}
                </span>
            ) : inheritedRate != null ? (
                <span className="text-gray-300">{formatRateCents(inheritedRate)}</span>
            ) : (
                <span className="text-gray-200">—</span>
            )}
            {rateRow?.effective_start || rateRow?.effective_end ?
                <span className="mt-0.5 block text-[10px] not-italic text-gray-400">
                    {rateRow.effective_start ? `From ${rateRow.effective_start}` : "Current"}
                    {rateRow.effective_end ? ` through ${rateRow.effective_end}` : ""}
                </span>
            :   null}

            {canManage && !isNotOffered && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 text-xs"
                    title="Mark as not offered"
                >
                    ⊘
                </button>
            )}
        </td>
    );
}

// ─── CompareCell ──────────────────────────────────────────────────────────────

type CompareCellProps = {
    orgRow: TuitionRateRow | undefined;
    locRow: TuitionRateRow | undefined;
    locationLabel: string;
};

function CompareCell({ orgRow, locRow, locationLabel }: CompareCellProps) {
    const orgVal = orgRow
        ? orgRow.not_offered
            ? "N/A"
            : formatRateCents(orgRow.rate_cents)
        : "—";
    const locVal = locRow
        ? locRow.not_offered
            ? "N/A"
            : formatRateCents(locRow.rate_cents)
        : null;

    const isDifferent =
        locRow != null &&
        (locRow.not_offered !== (orgRow?.not_offered ?? false) ||
            locRow.rate_cents !== (orgRow?.rate_cents ?? 0));

    return (
        <td className="px-3 py-2 text-right text-sm">
            <div className="flex flex-col items-end gap-0.5">
                <span className={isDifferent ? "line-through text-gray-300 text-xs" : "text-gray-700"}>
                    {orgVal}
                </span>
                {locRow && (
                    <span className={isDifferent ? "text-pine-600 font-medium" : "text-gray-400 text-xs"}>
                        {locVal ?? orgVal}
                        {isDifferent && (
                            <span className="ml-1 text-[10px] text-pine-400">({locationLabel})</span>
                        )}
                    </span>
                )}
            </div>
        </td>
    );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

type WorkspaceMode = "edit" | "compare";

export function TuitionGridWorkspace({
    programKey,
    embedded = false,
    canManage = true,
    scopedRates,
    scopedLocations,
    onReload,
}: {
    programKey?: string;
    embedded?: boolean;
    canManage?: boolean;
    scopedRates?: TuitionRateRow[];
    scopedLocations?: ScopedLocation[];
    onReload?: () => Promise<void>;
} = {}) {
    const [locations, setLocations] = useState<ScopedLocation[]>([]);
    const [scope, setScope] = useState<ConfigScope | null>(null);

    const [offerings, setOfferings] = useState<ProgramOffering[]>([]);
    const [variants, setVariants] = useState<ProgramOfferingVariant[]>([]);
    const [cadences, setCadences] = useState<BillingCadence[]>([]);

    const [rates, setRates] = useState<TuitionRateRow[]>([]);
    const [allRates, setAllRates] = useState<TuitionRateRow[]>([]);

    const [mode, setMode] = useState<WorkspaceMode>("edit");
    const [compareLocationId, setCompareLocationId] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bulkCopying, setBulkCopying] = useState(false);

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    useEffect(() => {
        async function boot() {
            setLoading(true);
            try {
                const [locRes, offeringRes, cadenceRes] = await Promise.all([
                    fetch("/api/admin/locations"),
                    fetch(
                        `/api/admin/programs/offerings?active_only=true${
                            programKey ? `&program_key=${encodeURIComponent(programKey)}` : ""
                        }`,
                    ),
                    fetch("/api/admin/commercial/billing-cadences"),
                ]);

                const locJson = await locRes.json();
                const rawLocs: Record<string, unknown>[] = locJson.locations ?? [];
                const oid: string = String(rawLocs[0]?.org_id ?? "org");
                setScope({ kind: "org", orgId: oid });

                const locs: ScopedLocation[] = scopedLocations ?? rawLocs.map((l) => ({
                    id: String(l.id ?? ""),
                    name: String(l.name ?? ""),
                }));
                setLocations(locs);

                if (offeringRes.ok) {
                    const j = await offeringRes.json();
                    const loadedOfferings: ProgramOffering[] = j.offerings ?? [];
                    setOfferings(loadedOfferings);

                    // Load variants for all offerings in parallel
                    if (loadedOfferings.length > 0) {
                        const variantResults = await Promise.all(
                            loadedOfferings.map((o) =>
                                fetch(`/api/admin/programs/offerings/${o.id}/variants`)
                                    .then((r) => r.ok ? r.json() : { variants: [] })
                                    .then((j: { variants?: ProgramOfferingVariant[] }) => j.variants ?? []),
                            ),
                        );
                        setVariants(variantResults.flat());
                    }
                }

                if (cadenceRes.ok) {
                    const j = await cadenceRes.json();
                    setCadences(j.cadences ?? []);
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        }
        void boot();
    }, [programKey, scopedLocations]);

    // ── Rates ──────────────────────────────────────────────────────────────────

    const loadRates = useCallback(async () => {
        if (!scope) return;
        const locationId = scope.kind === "location" ? scope.locationId : null;
        if (scopedRates) {
            setAllRates(scopedRates);
            setRates(
                scopedRates.filter(
                    (rate) => rate.location_id === null || rate.location_id === locationId,
                ),
            );
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (locationId) params.set("location_id", locationId);
            const res = await fetch(`/api/admin/commercial/tuition-rates?${params}`);
            const json = await res.json();
            setRates(json.rates ?? []);

            const allRes = await fetch(`/api/admin/commercial/tuition-rates`);
            const allJson = await allRes.json();
            setAllRates(allJson.rates ?? []);
        } finally {
            setLoading(false);
        }
    }, [scope, scopedRates]);

    useEffect(() => { void loadRates(); }, [loadRates]);

    // ── Derived ────────────────────────────────────────────────────────────────

    const locationId = scope?.kind === "location" ? scope.locationId : null;
    const rateMap = buildTuitionRateMap(rates, locationId);
    const orgOnlyMap = buildTuitionRateMap(rates, null);
    const variantsByOffering = groupVariantsByOffering(variants);

    const readiness = computeTuitionReadiness(
        variants.map((v) => v.id),
        cadences.map((c) => c.item_key),
        allRates,
    );

    const scopeLabel =
        scope?.kind === "org"
            ? "Organization default"
            : locations.find((l) => scope?.kind === "location" && l.id === scope.locationId)?.name ?? "Location";

    // ── Save helpers ──────────────────────────────────────────────────────────

    async function saveCell(
        variantId: string,
        cadenceKey: string,
        payload: {
            rate_cents?: number;
            not_offered?: boolean;
            effective_start?: string | null;
            effective_end?: string | null;
        },
    ) {
        setSaving(true);
        try {
            const body = {
                variant_id: variantId,
                cadence_key: cadenceKey,
                payer_type: "private_pay",
                location_id: locationId,
                ...payload,
            };
            const res = await fetch("/api/admin/commercial/tuition-rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const j = await res.json();
                setError((j as { error?: string }).error ?? "Save failed");
            } else {
                if (onReload) await onReload();
                else await loadRates();
            }
        } finally {
            setSaving(false);
        }
    }

    async function clearCell(rateId: string) {
        setSaving(true);
        try {
            await fetch(`/api/admin/commercial/tuition-rates/${rateId}`, { method: "DELETE" });
            if (onReload) await onReload();
            else await loadRates();
        } finally {
            setSaving(false);
        }
    }

    // ── Bulk copy org → location ──────────────────────────────────────────────

    async function bulkCopyOrgToLocation() {
        if (!locationId) return;
        setBulkCopying(true);
        try {
            const orgRates = allRates.filter((r) => r.location_id === null);
            await Promise.all(
                orgRates.map((r) =>
                    fetch("/api/admin/commercial/tuition-rates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            variant_id: r.variant_id,
                            cadence_key: r.cadence_key,
                            payer_type: r.payer_type,
                            location_id: locationId,
                            rate_cents: r.rate_cents,
                            not_offered: r.not_offered,
                            effective_start: r.effective_start,
                            effective_end: r.effective_end,
                        }),
                    }),
                ),
            );
            if (onReload) await onReload();
            else await loadRates();
        } finally {
            setBulkCopying(false);
        }
    }

    // ── Compare data ──────────────────────────────────────────────────────────

    const compareLocMap = compareLocationId
        ? buildLocationOnlyRateMap(allRates, compareLocationId)
        : null;
    const compareLocLabel =
        locations.find((l) => l.id === compareLocationId)?.name ?? "Location";

    // ─────────────────────────────────────────────────────────────────────────

    if (!scope) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                Loading…
            </div>
        );
    }

    // Build ordered list of (offering, sorted variants) for grid rows
    const offeringRows = offerings.map((offering) => ({
        offering,
        variants: sortVariants(variantsByOffering.get(offering.id) ?? []),
    }));

    return (
        <div className="space-y-5" data-testid={embedded ? "program-pricing-matrix" : "tuition-grid-workspace"}>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className={`${embedded ? "text-base" : "text-xl"} font-semibold text-gray-900`}>
                        {embedded ? "Pricing matrix" : "Tuition Grid"}
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Organization default rates inherit to Locations. Location override replaces the inherited
                        value until restored. Effective value = Location override ?? Organization default.
                    </p>
                </div>
                <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => setMode("edit")}
                        className={`px-4 py-1.5 ${mode === "edit" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("compare")}
                        className={`px-4 py-1.5 border-l border-gray-200 ${mode === "compare" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                        Compare Locations
                    </button>
                </div>
            </div>

            {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {error}{" "}
                    <button type="button" onClick={() => setError(null)} className="ml-2 underline">
                        dismiss
                    </button>
                </div>
            )}
            {saving ?
                <p className="text-xs font-medium text-alloy-bend-pine">Saving pricing…</p>
            :   null}

            {variants.length > 0 && (
                <ConfigReadinessCard readiness={readiness} scopeLabel="Organization default" />
            )}

            {mode === "edit" && (
                <>
                    <ConfigScopeSelector
                        scope={scope}
                        locations={locations}
                        onChange={setScope}
                        loading={loading}
                    />

                    {/* Bulk copy banner */}
                    {locationId && (
                        <div className="flex items-center justify-between bg-pine-50 border border-pine-200 rounded-lg px-4 py-2.5 text-sm">
                            <span className="text-pine-700">
                                Viewing <strong>{scopeLabel}</strong> — green = Location override, italic =
                                Inherited from Organization, plain at org scope = Organization default.
                            </span>
                            {canManage ?
                            <button
                                type="button"
                                onClick={() => void bulkCopyOrgToLocation()}
                                disabled={bulkCopying || loading}
                                className="ml-4 text-pine-700 font-medium underline hover:text-pine-900 disabled:opacity-50"
                            >
                                {bulkCopying ? "Copying…" : "Copy org defaults → this location"}
                            </button>
                            : null}
                        </div>
                    )}

                    {/* Grid */}
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                        {offeringRows.length === 0 ? (
                            <div className="py-12 text-center text-sm text-gray-400">
                                No offerings configured.{" "}
                                <a href="/settings/commercial" className="text-pine-600 underline">
                                    Set up offerings first.
                                </a>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-48">
                                            Offering / Variant
                                        </th>
                                        {cadences.map((c) => (
                                            <th key={c.item_key} className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {offeringRows.map(({ offering, variants: offeringVariants }) => (
                                        <Fragment key={offering.id}>
                                            {/* Offering group header row */}
                                            <tr key={`offering-${offering.id}`} className="border-t border-gray-100 bg-gray-50/60">
                                                <td
                                                    colSpan={cadences.length + 1}
                                                    className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                                                >
                                                    {offering.label}
                                                </td>
                                            </tr>
                                            {/* One row per variant */}
                                            {offeringVariants.map((variant, vi) => (
                                                <tr
                                                    key={variant.id}
                                                    className={vi % 2 === 0 ? "bg-white" : "bg-gray-50/40"}
                                                >
                                                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap pl-6">
                                                        {isDefaultVariant(variant) ? (
                                                            <span className="text-gray-400 italic text-xs">Default</span>
                                                        ) : (
                                                            describeVariant(variant)
                                                        )}
                                                    </td>
                                                    {cadences.map((cadence) => {
                                                        const cellKey = tuitionRateCellKey(variant.id, cadence.item_key);
                                                        return (
                                                            <TuitionCell
                                                                key={cellKey}
                                                                variantId={variant.id}
                                                                cadenceKey={cadence.item_key}
                                                                rateRow={rateMap.get(cellKey)}
                                                                orgDefaultRow={orgOnlyMap.get(cellKey)}
                                                                locationId={locationId}
                                                                onSave={saveCell}
                                                                onClear={clearCell}
                                                                canManage={canManage}
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-5 text-xs text-gray-500 pt-1">
                        {locationId && (
                            <>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-pine-500" />
                                    Location override
                                </span>
                                <span className="italic">Italic = Inherited from Organization</span>
                            </>
                        )}
                        <span>
                            <span className="text-gray-300 line-through">N/A</span> = not offered
                        </span>
                        <span className="text-gray-300">⊘ hover to mark not offered</span>
                    </div>

                    {locationId && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Scope:</span>
                            <OwnershipBadge owner="location" />
                        </div>
                    )}
                </>
            )}

            {mode === "compare" && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-gray-600">Compare org defaults vs:</span>
                        <select
                            value={compareLocationId ?? ""}
                            onChange={(e) => setCompareLocationId(e.target.value || null)}
                            className="border border-gray-200 rounded px-3 py-1.5 text-sm"
                        >
                            <option value="">— select a location —</option>
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>

                    {compareLocationId && compareLocMap ? (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-48">
                                            Offering / Variant
                                        </th>
                                        {cadences.map((c) => (
                                            <th key={c.item_key} className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {offeringRows.map(({ offering, variants: offeringVariants }) => (
                                        <Fragment key={offering.id}>
                                            <tr key={`offering-${offering.id}`} className="border-t border-gray-100 bg-gray-50/60">
                                                <td
                                                    colSpan={cadences.length + 1}
                                                    className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                                                >
                                                    {offering.label}
                                                </td>
                                            </tr>
                                            {offeringVariants.map((variant, vi) => (
                                                <tr
                                                    key={variant.id}
                                                    className={vi % 2 === 0 ? "bg-white" : "bg-gray-50/40"}
                                                >
                                                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap pl-6">
                                                        {isDefaultVariant(variant) ? (
                                                            <span className="text-gray-400 italic text-xs">Default</span>
                                                        ) : (
                                                            describeVariant(variant)
                                                        )}
                                                    </td>
                                                    {cadences.map((cadence) => {
                                                        const cellKey = tuitionRateCellKey(variant.id, cadence.item_key);
                                                        return (
                                                            <CompareCell
                                                                key={cellKey}
                                                                orgRow={orgOnlyMap.get(cellKey)}
                                                                locRow={compareLocMap.get(cellKey)}
                                                                locationLabel={compareLocLabel}
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-400 py-8 text-center">
                            Select a location to compare against org defaults.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
