"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { effectiveLocationProgramLabel } from "@/lib/locations/locationProgramCategories";
import {
    buildLocationProgramAvailabilityView,
} from "@/lib/programs/locationProgramAvailability";
import {
    commitMakeProgramAvailableClient,
    createMakeAvailableIdempotencyKey,
    previewMakeProgramAvailableClient,
    applyMakeAvailableRefreshTargets,
} from "@/lib/programs/makeProgramAvailableClient";
import {
    loadProgramsCollection,
    peekProgramsCollection,
} from "@/lib/programs/programsCollectionCache";
import { operatorProgramError } from "@/lib/programs/programsOperatorPresentation";

type OrgProgramOption = {
    id: string;
    name: string;
    publicationId: string | null;
    lifecycleStatus: "active" | "retired";
};

type RowConfig = {
    localDisplayName: string;
    availableFrom: string;
    availableThrough: string;
    expanded: boolean;
};

/**
 * Location → Programs Offered — checkbox availability with optional local name + dates.
 */
export default function LocationProgramsOfferedPanel({
    orgId,
    locationId,
    locationLabel,
    offerings,
    canMutate,
    onPatchOffering,
    onRefresh,
    onAddProgram,
}: {
    orgId: string;
    locationId: string;
    locationLabel: string;
    offerings: LocationProgramCategoryRow[];
    canMutate: boolean;
    onPatchOffering: (
        categoryId: string,
        patch: {
            local_display_name?: string | null;
            available_from?: string | null;
            available_through?: string | null;
            is_active?: boolean;
        },
    ) => Promise<void>;
    onRefresh: () => Promise<void> | void;
    onAddProgram?: () => void;
}) {
    const [orgPrograms, setOrgPrograms] = useState<OrgProgramOption[]>(() => {
        const peeked = orgId ? peekProgramsCollection(orgId) : null;
        return (peeked?.programs ?? [])
            .filter((program) => program.lifecycleStatus !== "retired")
            .map((program) => ({
                id: program.id,
                name: String(program.draft.label ?? "").trim() || "Untitled Program",
                publicationId: program.latestPublication?.id ?? null,
                lifecycleStatus: program.lifecycleStatus === "retired" ? "retired" : "active",
            }));
    });
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [configs, setConfigs] = useState<Record<string, RowConfig>>({});

    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        void (async () => {
            try {
                const { snapshot } = await loadProgramsCollection(orgId);
                if (cancelled) return;
                setOrgPrograms(
                    snapshot.programs
                        .filter((program) => program.lifecycleStatus !== "retired")
                        .map((program) => ({
                            id: program.id,
                            name: String(program.draft.label ?? "").trim() || "Untitled Program",
                            publicationId: program.latestPublication?.id ?? null,
                            lifecycleStatus: program.lifecycleStatus === "retired" ? "retired" : "active",
                        })),
                );
            } catch {
                // Keep peeked list.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [orgId]);

    const offeringByProgramId = useMemo(() => {
        const map = new Map<string, LocationProgramCategoryRow>();
        for (const row of offerings) {
            const programId = String(row.program_id ?? "").trim();
            if (programId) map.set(programId, row);
        }
        return map;
    }, [offerings]);

    useEffect(() => {
        setConfigs((prev) => {
            const next = { ...prev };
            for (const row of offerings) {
                const programId = String(row.program_id ?? "").trim();
                if (!programId) continue;
                if (next[programId]) continue;
                next[programId] = {
                    localDisplayName: row.local_display_name ?? "",
                    availableFrom: row.available_from ?? "",
                    availableThrough: row.available_through ?? "",
                    expanded: false,
                };
            }
            return next;
        });
    }, [offerings]);

    const visiblePrograms = useMemo(() => {
        const query = search.trim().toLowerCase();
        const rows = [...orgPrograms].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
        if (!query) return rows;
        return rows.filter((program) => {
            const offering = offeringByProgramId.get(program.id);
            const local = offering ? effectiveLocationProgramLabel(offering) : program.name;
            return (
                program.name.toLowerCase().includes(query)
                || local.toLowerCase().includes(query)
            );
        });
    }, [orgPrograms, offeringByProgramId, search]);

    const updateConfig = (programId: string, patch: Partial<RowConfig>) => {
        setConfigs((prev) => ({
            ...prev,
            [programId]: {
                ...(prev[programId] ?? {
                    localDisplayName: "",
                    availableFrom: "",
                    availableThrough: "",
                    expanded: false,
                }),
                ...patch,
            },
        }));
    };

    const saveConfig = useCallback(
        async (programId: string) => {
            const offering = offeringByProgramId.get(programId);
            if (!offering) return;
            const config = configs[programId];
            setBusyId(programId);
            setError(null);
            try {
                await onPatchOffering(offering.id, {
                    local_display_name: config?.localDisplayName.trim() || null,
                    available_from: config?.availableFrom.trim() || null,
                    available_through: config?.availableThrough.trim() || null,
                });
                updateConfig(programId, { expanded: false });
                await onRefresh();
            } catch (err) {
                setError(operatorProgramError(err instanceof Error ? err.message : "Save failed"));
            } finally {
                setBusyId(null);
            }
        },
        [configs, offeringByProgramId, onPatchOffering, onRefresh],
    );

    const toggleOffered = async (program: OrgProgramOption, nextOffered: boolean) => {
        setBusyId(program.id);
        setError(null);
        try {
            if (nextOffered) {
                const idempotencyKey = createMakeAvailableIdempotencyKey();
                await previewMakeProgramAvailableClient({
                    program: {
                        kind: "existing",
                        programId: program.id,
                        publicationId: program.publicationId ?? undefined,
                    },
                    locationIds: [locationId],
                    originatingLocationId: locationId,
                    idempotencyKey,
                    entryPoint: "location",
                });
                const result = await commitMakeProgramAvailableClient({
                    program: {
                        kind: "existing",
                        programId: program.id,
                        publicationId: program.publicationId ?? undefined,
                    },
                    locationIds: [locationId],
                    originatingLocationId: locationId,
                    idempotencyKey,
                    entryPoint: "location",
                });
                applyMakeAvailableRefreshTargets({
                    orgId,
                    refreshTargets: Array.isArray(result.refreshTargets) ? result.refreshTargets.map(String) : [],
                    reason: "location-program-offered",
                });
            } else {
                const response = await fetch("/api/admin/configuration/programs", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "remove_locations",
                        programId: program.id,
                        locationIds: [locationId],
                    }),
                });
                const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
                if (!response.ok) {
                    const message =
                        typeof json.reason === "string" ? json.reason
                        : typeof (json.error as { message?: string } | undefined)?.message === "string" ?
                            String((json.error as { message: string }).message)
                        :   `Request failed (${response.status})`;
                    throw new Error(operatorProgramError(message));
                }
            }
            await onRefresh();
        } catch (err) {
            setError(operatorProgramError(err instanceof Error ? err.message : "Update failed"));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-3" data-testid="locations-programs-offered">
            <ConfigWorkspaceCard compact testId="locations-programs-offered-card">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold text-alloy-midnight">Programs Offered</h3>
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/50">
                            Choose which Organization Programs {locationLabel || "this Location"} offers.
                        </p>
                    </div>
                    {canMutate && onAddProgram ?
                        <ConfigurationPrimaryButton
                            className="gap-1 px-2 py-1 text-[11px]"
                            onClick={onAddProgram}
                            data-testid="locations-programs-add"
                        >
                            + Add Program
                        </ConfigurationPrimaryButton>
                    :   null}
                </div>

                <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search Programs…"
                    className="config-runtime-input mb-3"
                    data-testid="locations-programs-search"
                />

                {error ?
                    <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}

                {visiblePrograms.length === 0 ?
                    <p className="py-6 text-center text-sm text-alloy-midnight/55" data-testid="locations-programs-empty">
                        No Organization Programs match.
                    </p>
                :   <ul className="divide-y divide-alloy-forge/10">
                        {visiblePrograms.map((program) => {
                            const offering = offeringByProgramId.get(program.id);
                            const offered = Boolean(offering && offering.is_active !== false);
                            const config = configs[program.id] ?? {
                                localDisplayName: "",
                                availableFrom: "",
                                availableThrough: "",
                                expanded: false,
                            };
                            const view =
                                offering ?
                                    buildLocationProgramAvailabilityView({
                                        locationId,
                                        locationLabel,
                                        organizationProgramName: program.name,
                                        localDisplayName: offering.local_display_name ?? null,
                                        availableFrom: offering.available_from ?? null,
                                        availableThrough: offering.available_through ?? null,
                                        offered: offering.is_active !== false,
                                    })
                                :   null;
                            const busy = busyId === program.id;
                            return (
                                <li key={program.id} className="py-3 first:pt-1" data-testid={`locations-program-offer-${program.id}`}>
                                    <div className="flex items-start gap-2">
                                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5"
                                                checked={offered}
                                                disabled={!canMutate || busy}
                                                onChange={(event) => {
                                                    void toggleOffered(program, event.target.checked);
                                                }}
                                                data-testid={`locations-program-offer-check-${program.id}`}
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-alloy-midnight">
                                                    {program.name}
                                                </span>
                                                {offered && view ?
                                                    <>
                                                        <span className="mt-0.5 block text-[12px] text-alloy-midnight/55">
                                                            {view.localDisplayName && view.localDisplayName !== program.name ?
                                                                view.effectiveLabel
                                                            :   "Uses Organization name"}
                                                        </span>
                                                        <span className="mt-0.5 block text-[12px] text-alloy-midnight/45">
                                                            {view.status === "active" && !view.availableFrom && !view.availableThrough ?
                                                                "Available immediately"
                                                            :   view.statusLabel}
                                                        </span>
                                                    </>
                                                :   <span className="mt-0.5 block text-[12px] text-alloy-midnight/45">
                                                        Not offered
                                                    </span>
                                                }
                                            </span>
                                        </label>
                                        {offered && canMutate ?
                                            <button
                                                type="button"
                                                className="shrink-0 text-xs font-medium text-alloy-bend-pine hover:underline"
                                                disabled={busy}
                                                onClick={() =>
                                                    updateConfig(program.id, { expanded: !config.expanded })
                                                }
                                                data-testid={`locations-program-configure-${program.id}`}
                                            >
                                                {config.expanded ? "Hide" : "Configure"}
                                            </button>
                                        :   null}
                                    </div>
                                    {offered && config.expanded ?
                                        <div
                                            className="mt-3 ml-6 space-y-2 rounded-md border border-alloy-stone/15 bg-alloy-stone/[0.04] p-3"
                                            data-testid={`locations-program-config-${program.id}`}
                                        >
                                            <label className="block">
                                                <span className="config-typo-field-label">Name at this Location</span>
                                                <input
                                                    type="text"
                                                    value={config.localDisplayName}
                                                    onChange={(event) =>
                                                        updateConfig(program.id, {
                                                            localDisplayName: event.target.value,
                                                        })
                                                    }
                                                    className="config-runtime-input mt-1"
                                                    placeholder={program.name}
                                                    data-testid={`locations-program-local-name-${program.id}`}
                                                />
                                                <span className="mt-1 block text-[11px] text-alloy-midnight/45">
                                                    Leave blank to use “{program.name},” the Organization Program name.
                                                </span>
                                            </label>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <label>
                                                    <span className="config-typo-field-label">Available from</span>
                                                    <input
                                                        type="date"
                                                        value={config.availableFrom}
                                                        onChange={(event) =>
                                                            updateConfig(program.id, {
                                                                availableFrom: event.target.value,
                                                            })
                                                        }
                                                        className="config-runtime-input mt-1"
                                                        data-testid={`locations-program-from-${program.id}`}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="config-typo-field-label">Available through</span>
                                                    <input
                                                        type="date"
                                                        value={config.availableThrough}
                                                        onChange={(event) =>
                                                            updateConfig(program.id, {
                                                                availableThrough: event.target.value,
                                                            })
                                                        }
                                                        className="config-runtime-input mt-1"
                                                        data-testid={`locations-program-through-${program.id}`}
                                                    />
                                                </label>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-1">
                                                <ConfigurationSecondaryButton
                                                    disabled={busy}
                                                    onClick={() => updateConfig(program.id, { expanded: false })}
                                                >
                                                    Cancel
                                                </ConfigurationSecondaryButton>
                                                <ConfigurationPrimaryButton
                                                    disabled={busy}
                                                    onClick={() => void saveConfig(program.id)}
                                                    data-testid={`locations-program-save-${program.id}`}
                                                >
                                                    {busy ? "Saving…" : "Save"}
                                                </ConfigurationPrimaryButton>
                                            </div>
                                        </div>
                                    :   null}
                                </li>
                            );
                        })}
                    </ul>
                }
            </ConfigWorkspaceCard>
        </div>
    );
}
