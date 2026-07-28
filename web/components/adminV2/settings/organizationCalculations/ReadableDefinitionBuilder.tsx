"use client";

/**
 * Readable definition builder — operator-facing definition, not AST controls.
 */

import { useEffect, useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    compatibleEquivalenciesForPopulation,
    formatEquivalencyTable,
    mapPublishedPopulations,
    mapPublishedEquivalencies,
    type PublishedPopulationOption,
    type PublishedEquivalencyOption,
} from "@/lib/organizationCalculations/definitionCatalog";
import {
    compactSymbolicDefinition,
    plainLanguageDefinitionSummary,
} from "@/lib/organizationCalculations/definitionSummary";
import { markAsDeveloperTryDraftName } from "@/lib/organizationCalculations/operatorCollectionFilter";
import {
    compilePivotBuilderDraft,
    listPivotValueChoices,
    roomUtilizationFtePivotDraft,
    roomUtilizationPivotDraft,
    equivalentChildCountPivotDraft,
    type PivotBuilderDraft,
    type PivotOperatorLabel,
} from "@/lib/organizationCalculations/pivotBuilder";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";
import { catalogLabelForRef } from "@/lib/organizationCalculations/catalog";

type RoomOption = { id: string; label: string; siteLabel: string };

type TryResult = {
    value: number | null;
    unavailable: string | null;
    explanation: string[];
};

const OPERATORS: PivotOperatorLabel[] = [
    "Divide",
    "Multiply",
    "Add",
    "Subtract",
    "Minimum of",
    "Maximum of",
    "Use first available value",
];

export type ReadableDefinitionBuilderProps = {
    name: string;
    setName: (v: string) => void;
    draft: PivotBuilderDraft;
    onChange: (next: PivotBuilderDraft) => void;
    busy?: boolean;
    error?: string | null;
    onCancel: () => void;
    onSave: () => void;
    /** Prefill helpers — do not present as product types */
    onApplySuggestion?: (id: "room_utilization" | "room_utilization_fte" | "equivalent_child_count") => void;
};

export default function ReadableDefinitionBuilder({
    name,
    setName,
    draft,
    onChange,
    busy = false,
    error = null,
    onCancel,
    onSave,
    onApplySuggestion,
}: ReadableDefinitionBuilderProps) {
    const [populations, setPopulations] = useState<PublishedPopulationOption[]>([]);
    const [equivalencies, setEquivalencies] = useState<PublishedEquivalencyOption[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [roomId, setRoomId] = useState("");
    const [effectiveAt, setEffectiveAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [tryResult, setTryResult] = useState<TryResult | null>(null);
    const [trying, setTrying] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);

    const factChoices = useMemo(() => listPivotValueChoices(), []);
    const selectedPopulation =
        populations.find((p) => p.versionId === draft.populationVersionId) ?? null;
    const compatibleEquivalencies = useMemo(
        () => compatibleEquivalenciesForPopulation(equivalencies, draft.populationVersionId),
        [equivalencies, draft.populationVersionId],
    );
    const selectedEquivalency =
        compatibleEquivalencies.find((w) => w.versionId === draft.weightingVersionId) ?? null;

    useEffect(() => {
        let cancelled = false;
        setCatalogLoading(true);
        void (async () => {
            try {
                const [popRes, wgtRes, locRes] = await Promise.all([
                    fetch("/api/admin/organization-populations"),
                    fetch("/api/admin/organization-weightings"),
                    fetch("/api/admin/locations?hierarchy=1"),
                ]);
                const popJson = (await popRes.json()) as {
                    populations?: Parameters<typeof mapPublishedPopulations>[0];
                    error?: string;
                };
                const wgtJson = (await wgtRes.json()) as {
                    weightings?: Parameters<typeof mapPublishedEquivalencies>[0];
                    equivalencies?: Parameters<typeof mapPublishedEquivalencies>[0];
                    error?: string;
                };
                if (!popRes.ok) throw new Error(popJson.error ?? "Could not load populations");
                if (!wgtRes.ok) throw new Error(wgtJson.error ?? "Could not load equivalency definitions");
                if (cancelled) return;
                const pops = mapPublishedPopulations(popJson.populations ?? []);
                const eqs = mapPublishedEquivalencies(wgtJson.equivalencies ?? wgtJson.weightings ?? []);
                setPopulations(pops);
                setEquivalencies(eqs);
                setCatalogError(
                    pops.length === 0 || eqs.length === 0 ?
                        "Publish at least one population and one equivalency definition to build equivalent-children definitions."
                    :   null,
                );

                // Auto-select defaults when entering equivalent mode without selection
                if (draft.valueMode === "equivalent_count") {
                    const next = { ...draft };
                    let changed = false;
                    if (!next.populationVersionId && pops[0]) {
                        next.populationVersionId = pops[0].versionId;
                        changed = true;
                    }
                    if (!next.weightingVersionId && eqs[0]) {
                        next.weightingVersionId = eqs[0].versionId;
                        changed = true;
                    }
                    if (changed) onChange(next);
                }

                const locJson = (await locRes.json()) as {
                    locations?: Array<{
                        id: string;
                        label?: string | null;
                        location_type?: string | null;
                        parent_location_id?: string | null;
                    }>;
                };
                if (locRes.ok) {
                    const locs = locJson.locations ?? [];
                    const byId = new Map(locs.map((l) => [l.id, l]));
                    const opts = locs
                        .filter((l) => String(l.location_type ?? "").toLowerCase() === "unit")
                        .map((l) => ({
                            id: l.id,
                            label: String(l.label ?? "").trim() || "Untitled room",
                            siteLabel:
                                String(byId.get(l.parent_location_id ?? "")?.label ?? "").trim() || "Site",
                        }));
                    setRooms(opts);
                    if (opts[0]) setRoomId(opts[0].id);
                }
            } catch (e) {
                if (!cancelled) {
                    setCatalogError(e instanceof Error ? e.message : "Could not load catalogs");
                }
            } finally {
                if (!cancelled) setCatalogLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // intentionally once on mount + when switching into equivalent mode
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft.valueMode]);

    const plain = plainLanguageDefinitionSummary({
        draft,
        population: selectedPopulation,
        weighting: selectedEquivalency,
    });
    const compact = compactSymbolicDefinition({
        draft,
        population: selectedPopulation,
        weighting: selectedEquivalency,
    });
    const weightRows = formatEquivalencyTable(selectedEquivalency);

    const runTry = async () => {
        if (!roomId || !effectiveAt) return;
        setTrying(true);
        setTryResult(null);
        try {
            const expressionAst = compilePivotBuilderDraft({ ...draft, name: name.trim() || draft.name });
            const created = await fetch("/api/admin/organization-calculations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: markAsDeveloperTryDraftName(name.trim() || "Try"),
                    description: "Temporary try-it draft",
                    expression_ast: expressionAst,
                }),
            });
            const createdJson = (await created.json()) as {
                calculation?: { id: string };
                error?: string;
            };
            if (!created.ok || !createdJson.calculation) {
                throw new Error(createdJson.error ?? "Could not prepare try");
            }
            const evalRes = await fetch(
                `/api/admin/organization-calculations/${createdJson.calculation.id}/evaluate`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roomId, effectiveAt, version: "draft" }),
                },
            );
            const evalJson = (await evalRes.json()) as {
                evaluation?: {
                    status?: string;
                    value?: number | null;
                    warnings?: Array<{ message?: string }>;
                };
                explanationLines?: string[];
                error?: string;
            };
            if (!evalRes.ok) throw new Error(evalJson.error ?? "Try failed");
            const value = evalJson.evaluation?.value ?? null;
            const ok = evalJson.evaluation?.status === "resolved" && value != null;
            setTryResult({
                value: ok ? value : null,
                unavailable:
                    ok ? null : (evalJson.evaluation?.warnings?.[0]?.message ?? "Not available"),
                explanation: evalJson.explanationLines ?? [],
            });
        } catch (e) {
            setTryResult({
                value: null,
                unavailable: e instanceof Error ? e.message : "Try failed",
                explanation: [],
            });
        } finally {
            setTrying(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="readable-definition-builder">
            <div className="process-config-setup-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            New definition
                        </p>
                        <label className="mt-1 block max-w-xl space-y-1">
                            <span className="sr-only">Name</span>
                            <input
                                className="config-runtime-input text-base font-semibold"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Definition name"
                                data-testid="organization-calculations-name"
                            />
                        </label>
                        <p className="config-typo-sublabel mt-1">
                            For <span className="font-medium text-alloy-midnight">each room</span>
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationSecondaryButton onClick={onCancel} disabled={busy}>
                            Cancel
                        </ConfigurationSecondaryButton>
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            onClick={onSave}
                            disabled={busy || !name.trim()}
                            data-testid="organization-calculations-create"
                        >
                            {busy ? "Saving…" : "Save draft"}
                        </ConfigurationPrimaryButton>
                    </div>
                </div>
            </div>

            {showSuggestions && onApplySuggestion ?
                <div
                    className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5"
                    data-testid="definition-suggested-setup"
                >
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Suggested setup
                        </p>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-[#007d68] hover:underline"
                            onClick={() => setShowSuggestions(false)}
                        >
                            Hide
                        </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {(
                            [
                                ["room_utilization", "Room utilization"],
                                ["room_utilization_fte", "Full-time equivalent utilization"],
                                ["equivalent_child_count", "Equivalent children"],
                            ] as const
                        ).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                className="rounded border border-alloy-stone/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-midnight hover:border-[#00a283]/40"
                                onClick={() => {
                                    onApplySuggestion(id);
                                    setShowSuggestions(false);
                                }}
                                data-testid={`definition-suggestion-${id}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            :   null}

            <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="space-y-3" data-testid="definition-build-column">
                    <section className="process-config-setup-card space-y-3 p-4" data-testid="definition-section-population">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Definition
                        </p>
                        <p className="text-sm text-alloy-midnight/70">
                            For each <span className="font-semibold text-alloy-midnight">room</span>
                        </p>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                checked={draft.valueMode === "catalog_input"}
                                onChange={() =>
                                    onChange({
                                        ...draft,
                                        valueMode: "catalog_input",
                                        valueRef: draft.valueRef ?? "occupancy.expected",
                                    })
                                }
                                data-testid="definition-mode-fact"
                            />
                            <span>Count children from an approved fact</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                checked={draft.valueMode === "equivalent_count"}
                                onChange={() =>
                                    onChange({
                                        ...draft,
                                        valueMode: "equivalent_count",
                                        populationVersionId:
                                            draft.populationVersionId ?? populations[0]?.versionId ?? null,
                                        weightingVersionId:
                                            draft.weightingVersionId ?? equivalencies[0]?.versionId ?? null,
                                    })
                                }
                                data-testid="definition-mode-population"
                            />
                            <span>Convert children into equivalents</span>
                        </label>

                        {draft.valueMode === "catalog_input" ?
                            <label className="block space-y-1">
                                <span className="config-typo-field-label">Count</span>
                                <select
                                    className="config-runtime-input"
                                    value={draft.valueRef ?? ""}
                                    onChange={(e) =>
                                        onChange({
                                            ...draft,
                                            valueRef: e.target.value as ApprovedInputRef,
                                        })
                                    }
                                    data-testid="definition-fact-select"
                                >
                                    {factChoices.map((c) => (
                                        <option key={c.ref} value={c.ref}>
                                            {c.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        :   <>
                                {catalogLoading ?
                                    <p className="text-xs text-alloy-midnight/50">Loading who should count…</p>
                                : catalogError && populations.length === 0 ?
                                    <p className="text-sm text-amber-900" data-testid="definition-population-empty">
                                        {catalogError}
                                    </p>
                                :   <label className="block space-y-1">
                                        <span className="config-typo-field-label">Count</span>
                                        <select
                                            className="config-runtime-input"
                                            value={draft.populationVersionId ?? ""}
                                            onChange={(e) =>
                                                onChange({
                                                    ...draft,
                                                    populationVersionId: e.target.value || null,
                                                })
                                            }
                                            data-testid="definition-population-select"
                                        >
                                            <option value="">Select who should count…</option>
                                            {populations.map((p) => (
                                                <option key={p.versionId} value={p.versionId}>
                                                    {p.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                }
                                {selectedPopulation ?
                                    <div
                                        className="rounded-md border border-alloy-forge/10 bg-white/70 px-3 py-2 text-xs text-alloy-midnight/75"
                                        data-testid="definition-population-detail"
                                    >
                                        <p className="font-semibold text-alloy-midnight">{selectedPopulation.name}</p>
                                        <p className="mt-1">{selectedPopulation.membershipSummary}</p>
                                    </div>
                                :   null}
                            </>
                        }
                    </section>

                    {draft.valueMode === "equivalent_count" ?
                        <section
                            className="process-config-setup-card space-y-3 p-4"
                            data-testid="definition-section-equivalency"
                        >
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                Treat each child as
                            </p>
                            {catalogLoading ?
                                <p className="text-xs text-alloy-midnight/50">Loading equivalency…</p>
                            : compatibleEquivalencies.length === 0 ?
                                <p className="text-sm text-amber-900" data-testid="definition-equivalency-empty">
                                    No published equivalency definitions are available.
                                </p>
                            :   <label className="block space-y-1">
                                    <span className="config-typo-field-label">How should scheduled children count?</span>
                                    <select
                                        className="config-runtime-input"
                                        value={draft.weightingVersionId ?? ""}
                                        onChange={(e) =>
                                            onChange({
                                                ...draft,
                                                weightingVersionId: e.target.value || null,
                                            })
                                        }
                                        data-testid="definition-equivalency-select"
                                    >
                                        <option value="">Select how children should count…</option>
                                        {compatibleEquivalencies.map((w) => (
                                            <option key={w.versionId} value={w.versionId}>
                                                {w.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            }
                            {selectedEquivalency ?
                                <div
                                    className="rounded-md border border-alloy-forge/10 bg-white/70 px-3 py-2"
                                    data-testid="definition-equivalency-detail"
                                >
                                    <p className="text-sm font-semibold text-alloy-midnight">
                                        {selectedEquivalency.name}
                                    </p>
                                    <table className="mt-2 w-full text-left text-xs">
                                        <thead className="text-alloy-midnight/45">
                                            <tr>
                                                <th className="py-1 font-semibold">Attendance</th>
                                                <th className="py-1 font-semibold">Counts as</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {weightRows.map((row) => (
                                                <tr key={row.schedule} className="border-t border-alloy-stone/15">
                                                    <td className="py-1">{row.schedule}</td>
                                                    <td className="py-1 font-medium">{row.value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            :   null}
                        </section>
                    :   null}

                    <section className="process-config-setup-card space-y-3 p-4" data-testid="definition-section-formula">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Compare and display
                        </p>
                        {draft.valueMode === "equivalent_count" ?
                            <p className="text-sm text-alloy-midnight/80">
                                Start from{" "}
                                <span className="font-semibold text-alloy-midnight">equivalent children</span>
                            </p>
                        :   null}
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Then</span>
                            <select
                                className="config-runtime-input"
                                value={draft.operator}
                                onChange={(e) =>
                                    onChange({
                                        ...draft,
                                        operator: e.target.value as PivotOperatorLabel,
                                    })
                                }
                                data-testid="definition-operator"
                            >
                                {OPERATORS.map((op) => (
                                    <option key={op} value={op}>
                                        {op}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">
                                {draft.operator === "Divide" ? "Compare against" : "Compare against"}
                            </span>
                            <select
                                className="config-runtime-input"
                                value={draft.compareRef ?? ""}
                                onChange={(e) =>
                                    onChange({
                                        ...draft,
                                        compareRef: (e.target.value || null) as ApprovedInputRef | null,
                                    })
                                }
                                data-testid="definition-compare-select"
                            >
                                <option value="">No comparison</option>
                                {factChoices.map((c) => (
                                    <option key={c.ref} value={c.ref}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={draft.asPercentage}
                                onChange={(e) =>
                                    onChange({
                                        ...draft,
                                        asPercentage: e.target.checked,
                                        outputUnit: e.target.checked ? "percent" : "number",
                                    })
                                }
                                data-testid="definition-as-percentage"
                            />
                            <span>Show as a percentage</span>
                        </label>
                    </section>

                    <section
                        className="rounded-lg border border-[#00a283]/25 bg-[#00a283]/5 px-3 py-2.5"
                        data-testid="definition-summary"
                    >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#007d68]">
                            Definition summary
                        </p>
                        <p className="mt-1 text-sm text-alloy-midnight">{plain}</p>
                        <p className="mt-2 font-mono text-[11px] text-alloy-midnight/55">{compact}</p>
                    </section>
                </div>

                <div className="process-config-setup-card space-y-3 p-4" data-testid="definition-try-column">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Try it
                    </p>
                    <label className="block space-y-1">
                        <span className="config-typo-field-label">Room</span>
                        <select
                            className="config-runtime-input"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            data-testid="definition-try-room"
                        >
                            {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.siteLabel} / {r.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block space-y-1">
                        <span className="config-typo-field-label">Date</span>
                        <input
                            type="date"
                            className="config-runtime-input"
                            value={effectiveAt}
                            onChange={(e) => setEffectiveAt(e.target.value)}
                            data-testid="definition-try-date"
                        />
                    </label>
                    <ConfigurationSecondaryButton
                        disabled={trying || !roomId}
                        onClick={() => void runTry()}
                        data-testid="definition-try-run"
                    >
                        {trying ? "Checking…" : "Try it"}
                    </ConfigurationSecondaryButton>
                    {tryResult ?
                        <div
                            className="rounded-md border border-alloy-stone/20 bg-white p-3"
                            data-testid="definition-try-result"
                        >
                            <p className="text-lg font-semibold text-alloy-midnight">
                                {tryResult.value == null ?
                                    "Not available"
                                : draft.asPercentage ?
                                    `${Math.round(tryResult.value * 100) / 100}%`
                                :   String(tryResult.value)}
                            </p>
                            {tryResult.unavailable ?
                                <p className="mt-1 text-sm text-amber-900">{tryResult.unavailable}</p>
                            :   null}
                            {tryResult.explanation.length > 0 ?
                                <details className="mt-2 text-xs text-alloy-midnight/70">
                                    <summary className="cursor-pointer font-medium text-[#007d68]">
                                        Explanation
                                    </summary>
                                    <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                                        {tryResult.explanation.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ol>
                                </details>
                            :   null}
                        </div>
                    :   <p className="text-xs text-alloy-midnight/50">
                            Pick a room and date to preview this definition.
                        </p>
                    }
                    {draft.compareRef ?
                        <p className="text-[11px] text-alloy-midnight/45">
                            Comparing against {catalogLabelForRef(draft.compareRef)}.
                        </p>
                    :   null}
                </div>
            </div>

            {error ?
                <p className="text-sm text-red-800" role="alert" data-testid="organization-calculations-error">
                    {error}
                </p>
            :   null}
            {catalogError && populations.length > 0 ?
                <p className="text-xs text-amber-900">{catalogError}</p>
            :   null}
        </div>
    );
}

export function applyDefinitionSuggestion(
    id: "room_utilization" | "room_utilization_fte" | "equivalent_child_count",
    catalogs: {
        populationVersionId: string | null;
        weightingVersionId: string | null;
        fteWeightingVersionId: string | null;
    },
): { name: string; draft: PivotBuilderDraft } {
    if (id === "room_utilization") {
        return { name: "Room utilization", draft: roomUtilizationPivotDraft("Room utilization") };
    }
    if (id === "room_utilization_fte") {
        return {
            name: "FTE room utilization",
            draft: roomUtilizationFtePivotDraft({
                name: "FTE room utilization",
                populationVersionId: catalogs.populationVersionId ?? "",
                weightingVersionId: catalogs.fteWeightingVersionId ?? catalogs.weightingVersionId ?? "",
            }),
        };
    }
    return {
        name: "Equivalent child count",
        draft: equivalentChildCountPivotDraft({
            name: "Equivalent child count",
            populationVersionId: catalogs.populationVersionId ?? "",
            weightingVersionId: catalogs.fteWeightingVersionId ?? catalogs.weightingVersionId ?? "",
        }),
    };
}
