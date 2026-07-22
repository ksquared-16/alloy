"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEditorSection,
    ConfigObjectHeader,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import { PROGRAM_LOCATION_STATUS_LABEL } from "@/lib/configRuntime/programLocationAvailabilityPrototypeModel";
import type {
    MakeProgramAvailableCommitResult,
    MakeProgramAvailablePreview,
    MakeProgramAvailableProgramRef,
} from "@/lib/programs/commands/makeProgramAvailable/makeProgramAvailableModel";
import {
    applyMakeAvailableRefreshTargets,
    commitMakeProgramAvailableClient,
    createMakeAvailableIdempotencyKey,
    makeAvailableIntentFingerprint,
    previewMakeProgramAvailableClient,
} from "@/lib/programs/makeProgramAvailableClient";
import {
    fetchProgramCatalogSnapshot,
    publishedProgramsForAssignment,
    slugifyProgramKey,
} from "@/lib/programs/locationProgramAssociation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { organizationProgramsHref } from "@/lib/admin/canonicalAdminRoutes";
import Link from "next/link";

export type ProgramLocationAvailabilityEntry =
    | {
          direction: "organization_program";
          programId: string;
          programLabel: string;
          publicationReady: boolean;
          publicationId?: string | null;
          lifecycleStatus?: string;
          currentLocationCount?: number;
      }
    | { direction: "location"; activeLocationId: string; activeLocationLabel: string };

type Step = "context" | "locations" | "review" | "success";
type LocationEntryMode = "choose" | "use_existing" | "create_new";

type CatalogProgram = {
    id: string;
    key: string;
    label: string;
    publicationId: string | null;
    published: boolean;
};

/**
 * Programs Make Available — production shared workflow (Stage 3).
 * Both origins call preview_make_available / make_available.
 */
export function ProgramLocationAvailabilityFlow({
    entry,
    locations,
    associatedProgramIds,
    associatedProgramKeys,
    onCancel,
    onDone,
}: {
    entry: ProgramLocationAvailabilityEntry;
    locations: readonly { id: string; label: string }[];
    associatedProgramIds?: ReadonlySet<string>;
    associatedProgramKeys?: ReadonlySet<string>;
    onCancel: () => void;
    onDone: (result: MakeProgramAvailableCommitResult) => void;
}) {
    const { orgId } = useAdminAuth();
    const [step, setStep] = useState<Step>("context");
    const [locationMode, setLocationMode] = useState<LocationEntryMode>(
        entry.direction === "location" ? "choose" : "use_existing",
    );
    const [search, setSearch] = useState("");
    const [locationSearch, setLocationSearch] = useState("");
    const [catalog, setCatalog] = useState<CatalogProgram[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
        entry.direction === "organization_program" ? entry.programId : null,
    );
    const [createName, setCreateName] = useState("");
    const [createKey, setCreateKey] = useState("");
    const [keyTouched, setKeyTouched] = useState(false);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(() =>
        entry.direction === "location" ? [entry.activeLocationId] : [],
    );
    const [preview, setPreview] = useState<MakeProgramAvailablePreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [commitResult, setCommitResult] = useState<MakeProgramAvailableCommitResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const idempotencyKeyRef = useRef(createMakeAvailableIdempotencyKey());
    const intentFingerprintRef = useRef<string>("");
    const requestSeq = useRef(0);

    const entryPoint =
        entry.direction === "organization_program" ? "organization_program" : "location";

    useEffect(() => {
        if (entry.direction !== "location") return;
        if (locationMode !== "use_existing" && locationMode !== "create_new") return;
        let cancelled = false;
        setCatalogLoading(true);
        setCatalogError(null);
        void fetchProgramCatalogSnapshot()
            .then((snapshot) => {
                if (cancelled) return;
                const published = new Map(
                    publishedProgramsForAssignment(snapshot.programs ?? []).map((row) => [
                        row.id,
                        row,
                    ]),
                );
                const rows: CatalogProgram[] = (snapshot.programs ?? [])
                    .filter((program) => program.lifecycleStatus !== "retired")
                    .map((program) => {
                        const pub = published.get(program.id);
                        return {
                            id: program.id,
                            key: program.key,
                            label:
                                pub?.label
                                || String(program.draft?.label ?? "").trim()
                                || program.key,
                            publicationId: pub?.publicationId ?? null,
                            published: Boolean(pub?.publicationId),
                        };
                    })
                    .sort((a, b) => a.label.localeCompare(b.label));
                setCatalog(rows);
            })
            .catch((cause) => {
                if (cancelled) return;
                setCatalogError(cause instanceof Error ? cause.message : "Could not load Programs.");
            })
            .finally(() => {
                if (!cancelled) setCatalogLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [entry.direction, locationMode]);

    const selectedCatalogProgram = catalog.find((row) => row.id === selectedProgramId) ?? null;

    const programRef: MakeProgramAvailableProgramRef | null = useMemo(() => {
        if (entry.direction === "organization_program") {
            if (!entry.publicationReady) return null;
            return {
                kind: "existing",
                programId: entry.programId,
                publicationId: entry.publicationId ?? undefined,
            };
        }
        if (locationMode === "create_new") {
            const label = createName.trim();
            const key = (keyTouched ? createKey : slugifyProgramKey(label) || createKey).trim();
            if (!label || !key) return null;
            return { kind: "new", input: { key, label } };
        }
        if (locationMode === "use_existing" && selectedCatalogProgram?.published) {
            return {
                kind: "existing",
                programId: selectedCatalogProgram.id,
                publicationId: selectedCatalogProgram.publicationId ?? undefined,
            };
        }
        return null;
    }, [
        entry,
        locationMode,
        createName,
        createKey,
        keyTouched,
        selectedCatalogProgram,
    ]);

    const programLabel =
        entry.direction === "organization_program"
            ? entry.programLabel
            : locationMode === "create_new"
              ? createName.trim() || "New Program"
              : (selectedCatalogProgram?.label ?? "Program");

    const filteredCatalog = useMemo(() => {
        const q = search.trim().toLowerCase();
        return catalog.filter((program) => {
            if (!q) return true;
            return (
                program.label.toLowerCase().includes(q) || program.key.toLowerCase().includes(q)
            );
        });
    }, [catalog, search]);

    const filteredLocations = useMemo(() => {
        const q = locationSearch.trim().toLowerCase();
        if (!q) return locations;
        return locations.filter(
            (row) => row.label.toLowerCase().includes(q) || row.id.toLowerCase().includes(q),
        );
    }, [locations, locationSearch]);

    const locationMetaById = useMemo(() => {
        const map = new Map<string, { statusLabel: string; reason?: string }>();
        if (!preview) return map;
        for (const row of preview.newAssociations) {
            map.set(row.locationId, { statusLabel: PROGRAM_LOCATION_STATUS_LABEL.notAvailable });
        }
        for (const row of preview.alreadyAvailable) {
            map.set(row.locationId, {
                statusLabel: row.hasLocalConfiguration
                    ? PROGRAM_LOCATION_STATUS_LABEL.locallyConfigured
                    : PROGRAM_LOCATION_STATUS_LABEL.inheritsOrganization,
            });
        }
        for (const row of preview.blocked) {
            if (row.locationId === "*") continue;
            map.set(row.locationId, {
                statusLabel: PROGRAM_LOCATION_STATUS_LABEL.blocked,
                reason: row.reason,
            });
        }
        return map;
    }, [preview]);

    const syncIdempotencyKey = (nextProgram: MakeProgramAvailableProgramRef, locationIds: string[]) => {
        const fingerprint = makeAvailableIntentFingerprint({
            program: nextProgram,
            locationIds,
        });
        if (fingerprint !== intentFingerprintRef.current) {
            intentFingerprintRef.current = fingerprint;
            idempotencyKeyRef.current = createMakeAvailableIdempotencyKey();
        }
    };

    const canContinueFromContext =
        entry.direction === "organization_program"
            ? entry.publicationReady
            : locationMode === "use_existing"
              ? Boolean(selectedCatalogProgram?.published)
              : locationMode === "create_new"
                ? Boolean(
                      createName.trim()
                          && (keyTouched ? createKey : slugifyProgramKey(createName)).trim(),
                  )
                : false;

    const toggleLocation = (locationId: string) => {
        if (entry.direction === "location" && locationId === entry.activeLocationId) return;
        setSelectedLocationIds((current) =>
            current.includes(locationId)
                ? current.filter((id) => id !== locationId)
                : [...current, locationId],
        );
        setPreview(null);
    };

    const selectAllVisibleEligible = () => {
        const blocked = new Set(
            (preview?.blocked ?? [])
                .filter((row) => row.locationId !== "*")
                .map((row) => row.locationId),
        );
        const ids = filteredLocations
            .map((row) => row.id)
            .filter((id) => !blocked.has(id));
        if (entry.direction === "location" && !ids.includes(entry.activeLocationId)) {
            ids.unshift(entry.activeLocationId);
        }
        setSelectedLocationIds([...new Set(ids)]);
        setPreview(null);
    };

    const clearAll = () => {
        setSelectedLocationIds(
            entry.direction === "location" ? [entry.activeLocationId] : [],
        );
        setPreview(null);
    };

    const loadPreview = async () => {
        if (!programRef || selectedLocationIds.length === 0) return;
        syncIdempotencyKey(programRef, selectedLocationIds);
        const seq = ++requestSeq.current;
        setPreviewLoading(true);
        setError(null);
        try {
            const next = await previewMakeProgramAvailableClient({
                program: programRef,
                locationIds: selectedLocationIds,
                originatingLocationId:
                    entry.direction === "location" ? entry.activeLocationId : null,
                idempotencyKey: idempotencyKeyRef.current,
                entryPoint,
            });
            if (seq !== requestSeq.current) return;
            setPreview(next);
            setStep("review");
        } catch (cause) {
            if (seq !== requestSeq.current) return;
            setError(cause instanceof Error ? cause.message : "Preview failed.");
        } finally {
            if (seq === requestSeq.current) setPreviewLoading(false);
        }
    };

    const commit = async () => {
        if (!programRef || selectedLocationIds.length === 0) return;
        syncIdempotencyKey(programRef, selectedLocationIds);
        const seq = ++requestSeq.current;
        setBusy(true);
        setError(null);
        try {
            const result = await commitMakeProgramAvailableClient({
                program: programRef,
                locationIds: selectedLocationIds,
                originatingLocationId:
                    entry.direction === "location" ? entry.activeLocationId : null,
                idempotencyKey: idempotencyKeyRef.current,
                entryPoint,
            });
            if (seq !== requestSeq.current) return;
            applyMakeAvailableRefreshTargets({
                orgId,
                refreshTargets: result.refreshTargets,
            });
            setCommitResult(result);
            setStep("success");
        } catch (cause) {
            if (seq !== requestSeq.current) return;
            // Timeout / uncertain: keep same idempotency key for retry.
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The request may still be processing. Retry uses the same operation key.",
            );
        } finally {
            if (seq === requestSeq.current) setBusy(false);
        }
    };

    const retryCommit = () => {
        void commit();
    };

    return (
        <div className="space-y-3" data-testid="program-location-availability-flow">
            <ConfigObjectHeader
                size="hero"
                name={
                    entry.direction === "organization_program"
                        ? "Add to Locations"
                        : "Add Program"
                }
                status={{
                    label:
                        step === "success" ? (commitResult?.status === "committed" ? "Complete" : commitResult?.status === "partial" ? "Partial" : "Blocked")
                        : step === "review" ? "Review"
                        : step === "locations" ? "Choose Locations"
                        : "Program",
                    tone:
                        step === "success" && commitResult?.status === "committed"
                            ? "active"
                            : "attention",
                }}
                facts={[
                    PROGRAM_LOCATION_STATUS_LABEL.organizationDefinition,
                    programLabel,
                    entry.direction === "organization_program"
                        && entry.currentLocationCount != null
                        ? `Available at ${entry.currentLocationCount} Location${entry.currentLocationCount === 1 ? "" : "s"}`
                        : "",
                ].filter(Boolean)}
                actions={
                    step !== "success" ?
                        <ConfigurationSecondaryButton onClick={onCancel} data-testid="pla-flow-cancel">
                            Cancel
                        </ConfigurationSecondaryButton>
                    :   null
                }
                testId="pla-flow-header"
            />

            {step === "context" ?
                <div className="space-y-3" data-testid="pla-flow-step-context">
                    {entry.direction === "organization_program" ?
                        <ConfigEditorSection
                            title={entry.programLabel}
                            description="Make this Organization Program available at one or many Locations."
                            testId="pla-flow-program-context"
                        >
                            <dl className="grid gap-2 text-sm sm:grid-cols-2">
                                <div className="rounded-lg border border-alloy-forge/10 bg-white px-3 py-2">
                                    <dt className="config-typo-field-label">Lifecycle</dt>
                                    <dd className="font-medium text-alloy-midnight">
                                        {entry.publicationReady ? "Published" : (entry.lifecycleStatus ?? "Draft")}
                                    </dd>
                                </div>
                                <div className="rounded-lg border border-alloy-forge/10 bg-white px-3 py-2">
                                    <dt className="config-typo-field-label">Currently available</dt>
                                    <dd className="font-medium text-alloy-midnight">
                                        {entry.currentLocationCount ?? 0} Location
                                        {(entry.currentLocationCount ?? 0) === 1 ? "" : "s"}
                                    </dd>
                                </div>
                            </dl>
                            {!entry.publicationReady ?
                                <div className="mt-3 space-y-2" data-testid="pla-flow-unpublished-block">
                                    <p className="text-sm text-alloy-ember" role="status">
                                        This Program must be published before it can be made available to Locations.
                                    </p>
                                    <Link
                                        href={organizationProgramsHref(entry.programId, "publication")}
                                        className="text-sm font-semibold text-alloy-bend-pine hover:underline"
                                        data-testid="pla-flow-go-publish"
                                    >
                                        Open Publication
                                    </Link>
                                </div>
                            :   <div className="mt-3">
                                    <ConfigurationPrimaryButton
                                        onClick={() => setStep("locations")}
                                        data-testid="pla-flow-continue-locations"
                                    >
                                        Choose Locations
                                    </ConfigurationPrimaryButton>
                                </div>
                            }
                        </ConfigEditorSection>
                    : locationMode === "choose" ?
                        <ConfigEditorSection
                            title="How should this Location receive a Program?"
                            description={`${entry.activeLocationLabel} stays selected. Programs remain Organization definitions.`}
                            testId="pla-flow-location-choose"
                        >
                            <div className="flex flex-wrap gap-2">
                                <ConfigurationPrimaryButton
                                    onClick={() => setLocationMode("use_existing")}
                                    data-testid="pla-flow-use-existing"
                                >
                                    Use an existing Program
                                </ConfigurationPrimaryButton>
                                <ConfigurationSecondaryButton
                                    onClick={() => setLocationMode("create_new")}
                                    data-testid="pla-flow-create-new"
                                >
                                    Create a new Program
                                </ConfigurationSecondaryButton>
                            </div>
                        </ConfigEditorSection>
                    : locationMode === "use_existing" ?
                        <ConfigEditorSection
                            title="Organization Programs"
                            description="Only published Programs can be made available. Drafts are listed as unavailable."
                            testId="pla-flow-catalog"
                        >
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search by name or key"
                                className="config-runtime-input"
                                data-testid="pla-flow-program-search"
                            />
                            {catalogLoading ?
                                <p className="config-typo-sublabel mt-2">Loading Programs…</p>
                            : catalogError ?
                                <p className="mt-2 text-sm text-red-800" role="alert">{catalogError}</p>
                            :   <ul className="mt-2 max-h-56 divide-y divide-alloy-forge/10 overflow-y-auto rounded-lg border border-alloy-forge/10 bg-white">
                                    {filteredCatalog.map((program) => {
                                        const already =
                                            associatedProgramIds?.has(program.id)
                                            || associatedProgramKeys?.has(program.key);
                                        return (
                                            <li key={program.id}>
                                                <label
                                                    className={`flex items-start gap-2 px-3 py-2.5 ${
                                                        program.published
                                                            ? "cursor-pointer hover:bg-alloy-stone/[0.06]"
                                                            : "cursor-not-allowed opacity-55"
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="pla-program-pick"
                                                        className="mt-1"
                                                        disabled={!program.published}
                                                        checked={selectedProgramId === program.id}
                                                        onChange={() => {
                                                            if (!program.published) return;
                                                            setSelectedProgramId(program.id);
                                                            setPreview(null);
                                                        }}
                                                        data-testid={`pla-flow-pick-${program.id}`}
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-medium text-alloy-midnight">
                                                            {program.label}
                                                        </span>
                                                        <span className="config-typo-sublabel block font-mono">
                                                            {program.key}
                                                            {program.published ? " · Published" : " · Draft — publish required"}
                                                            {already ? " · already available here" : ""}
                                                        </span>
                                                    </span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                            }
                            <div className="mt-2 flex flex-wrap gap-2">
                                <ConfigurationPrimaryButton
                                    disabled={!canContinueFromContext}
                                    onClick={() => setStep("locations")}
                                    data-testid="pla-flow-continue-locations"
                                >
                                    Choose Locations
                                </ConfigurationPrimaryButton>
                                <ConfigurationSecondaryButton onClick={() => setLocationMode("choose")}>
                                    Back
                                </ConfigurationSecondaryButton>
                            </div>
                        </ConfigEditorSection>
                    :   <ConfigEditorSection
                            title="New Organization Program"
                            description="Creates one Organization definition, publishes it, then makes it available at selected Locations."
                            testId="pla-flow-create-fields"
                        >
                            <label className="block space-y-1">
                                <span className="config-typo-field-label">Program name</span>
                                <input
                                    type="text"
                                    value={createName}
                                    onChange={(event) => {
                                        const next = event.target.value;
                                        setCreateName(next);
                                        if (!keyTouched) setCreateKey(slugifyProgramKey(next));
                                        setPreview(null);
                                    }}
                                    className="config-runtime-input"
                                    autoFocus
                                    data-testid="pla-flow-create-name"
                                />
                            </label>
                            <label className="mt-2 block space-y-1">
                                <span className="config-typo-field-label">Stable key</span>
                                <input
                                    type="text"
                                    value={createKey}
                                    onChange={(event) => {
                                        setKeyTouched(true);
                                        setCreateKey(event.target.value);
                                        setPreview(null);
                                    }}
                                    className="config-runtime-input font-mono"
                                    data-testid="pla-flow-create-key"
                                />
                            </label>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <ConfigurationPrimaryButton
                                    disabled={!canContinueFromContext}
                                    onClick={() => setStep("locations")}
                                    data-testid="pla-flow-continue-locations"
                                >
                                    Choose Locations
                                </ConfigurationPrimaryButton>
                                <ConfigurationSecondaryButton onClick={() => setLocationMode("choose")}>
                                    Back
                                </ConfigurationSecondaryButton>
                            </div>
                        </ConfigEditorSection>
                    }
                </div>
            :   null}

            {step === "locations" ?
                <div className="space-y-3" data-testid="pla-flow-step-locations">
                    <ConfigEditorSection
                        title="Make available at Locations"
                        description={`${programLabel} · ${selectedLocationIds.length} selected`}
                        testId="pla-flow-location-picker"
                    >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <input
                                type="search"
                                value={locationSearch}
                                onChange={(event) => setLocationSearch(event.target.value)}
                                placeholder="Search Locations"
                                className="config-runtime-input min-w-[12rem] flex-1"
                                data-testid="pla-flow-location-search"
                            />
                            <ConfigurationSecondaryButton
                                onClick={selectAllVisibleEligible}
                                data-testid="pla-flow-select-all"
                            >
                                Select all visible
                            </ConfigurationSecondaryButton>
                            <ConfigurationSecondaryButton onClick={clearAll} data-testid="pla-flow-clear-all">
                                Clear
                            </ConfigurationSecondaryButton>
                        </div>
                        <ul className="max-h-72 divide-y divide-alloy-forge/10 overflow-y-auto rounded-lg border border-alloy-forge/10 bg-white">
                            {filteredLocations.map((row) => {
                                const locked =
                                    entry.direction === "location"
                                    && row.id === entry.activeLocationId;
                                const checked = selectedLocationIds.includes(row.id);
                                const meta = locationMetaById.get(row.id);
                                return (
                                    <li key={row.id}>
                                        <label
                                            className={`flex items-start gap-2 px-3 py-2.5 ${
                                                locked
                                                    ? "bg-alloy-bend-pine/[0.04]"
                                                    : "cursor-pointer hover:bg-alloy-stone/[0.06]"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-1"
                                                checked={checked}
                                                disabled={locked || busy}
                                                onChange={() => toggleLocation(row.id)}
                                                data-testid={`pla-flow-location-${row.id}`}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium text-alloy-midnight">
                                                        {row.label}
                                                    </span>
                                                    {meta ?
                                                        <span className="rounded-full border border-alloy-forge/15 px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/55">
                                                            {meta.statusLabel}
                                                        </span>
                                                    :   null}
                                                    {locked ?
                                                        <span className="config-typo-sublabel">
                                                            · active Location
                                                        </span>
                                                    :   null}
                                                </span>
                                                {meta?.reason ?
                                                    <span className="config-typo-sublabel mt-0.5 block">
                                                        {meta.reason}
                                                    </span>
                                                :   null}
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </ConfigEditorSection>
                    {error ?
                        <p className="text-sm text-red-800" role="alert">{error}</p>
                    :   null}
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            disabled={selectedLocationIds.length === 0 || previewLoading || !programRef}
                            onClick={() => void loadPreview()}
                            data-testid="pla-flow-continue-review"
                        >
                            {previewLoading ? "Previewing…" : "Review"}
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton onClick={() => setStep("context")}>
                            Back
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            :   null}

            {step === "review" && preview ?
                <div className="space-y-3" data-testid="pla-flow-step-review">
                    <ConfigEditorSection
                        title="Review"
                        description={
                            preview.program.willPublish
                                ? `${preview.program.label} will be created and published, then made available at ${preview.impact.eligible} Location${preview.impact.eligible === 1 ? "" : "s"}.`
                                : `${preview.program.label} will be made available at ${preview.newAssociations.length} new Location${preview.newAssociations.length === 1 ? "" : "s"}.`
                        }
                        testId="pla-flow-review"
                    >
                        <ul className="space-y-2 text-sm text-alloy-midnight/75">
                            <li>
                                <strong className="text-alloy-midnight">{preview.newAssociations.length}</strong>{" "}
                                new associations
                            </li>
                            <li>
                                <strong className="text-alloy-midnight">{preview.alreadyAvailable.length}</strong>{" "}
                                selected Locations already have access and will remain unchanged
                            </li>
                            <li>
                                <strong className="text-alloy-midnight">
                                    {preview.retainedLocalConfiguration.length}
                                </strong>{" "}
                                Locations have local configuration that will be retained
                            </li>
                            <li>
                                <strong className="text-alloy-midnight">
                                    {preview.blocked.filter((row) => row.locationId !== "*").length}
                                </strong>{" "}
                                Locations are blocked and will not be changed
                            </li>
                            {preview.program.willPublish ?
                                <li className="font-medium text-alloy-midnight">
                                    Publication will occur before Locations are associated.
                                </li>
                            :   null}
                        </ul>
                        {preview.blocked.filter((row) => row.locationId !== "*").length > 0 ?
                            <div className="mt-3 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.04] px-3 py-2">
                                <p className="text-[11px] font-semibold text-alloy-midnight">Blocked</p>
                                <ul className="mt-1 space-y-1 text-[11px] text-alloy-midnight/60">
                                    {preview.blocked
                                        .filter((row) => row.locationId !== "*")
                                        .map((row) => (
                                            <li key={row.locationId}>
                                                {row.locationLabel} — {row.reason}
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        :   null}
                    </ConfigEditorSection>
                    {error ?
                        <p className="text-sm text-red-800" role="alert" data-testid="pla-flow-commit-error">
                            {error}
                        </p>
                    :   null}
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            disabled={busy}
                            onClick={() => void commit()}
                            data-testid="pla-flow-apply"
                        >
                            {busy ? "Applying…" : "Confirm"}
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton
                            disabled={busy}
                            onClick={() => {
                                setStep("locations");
                                setError(null);
                            }}
                        >
                            Back
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            :   null}

            {step === "success" && commitResult ?
                <div className="space-y-3" data-testid="pla-flow-step-success">
                    <ConfigEditorSection
                        title={
                            commitResult.status === "committed"
                                ? `${programLabel} is now available at ${commitResult.associatedLocationIds.length} Location${commitResult.associatedLocationIds.length === 1 ? "" : "s"}.`
                                : commitResult.status === "partial"
                                  ? "Availability completed with partial results"
                                  : "No Locations were changed"
                        }
                        description={
                            commitResult.createdProgram || commitResult.publishedProgram
                                ? `Program ${commitResult.createdProgram ? "created" : "updated"}${commitResult.publishedProgram ? " and published" : ""}.`
                                : commitResult.idempotentReplay
                                  ? "Idempotent replay of the same operation."
                                  : undefined
                        }
                        testId="pla-flow-success"
                    >
                        <ul className="space-y-1 text-sm text-alloy-midnight/75">
                            <li>Status: {commitResult.status}</li>
                            <li>Associated: {commitResult.associatedLocationIds.length}</li>
                            <li>Unchanged: {commitResult.unchangedLocationIds.length}</li>
                            <li>Blocked: {commitResult.blocked.length}</li>
                            <li>Failed: {commitResult.failed.length}</li>
                            {commitResult.operationId ?
                                <li className="config-typo-sublabel font-mono">
                                    Operation {commitResult.operationId}
                                </li>
                            :   null}
                        </ul>
                        {commitResult.failed.some((row) => row.retryable) ?
                            <div className="mt-2">
                                <ConfigurationSecondaryButton
                                    onClick={retryCommit}
                                    data-testid="pla-flow-retry"
                                >
                                    Retry failed targets
                                </ConfigurationSecondaryButton>
                            </div>
                        :   null}
                    </ConfigEditorSection>
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            onClick={() => onDone(commitResult)}
                            data-testid="pla-flow-done"
                        >
                            Done
                        </ConfigurationPrimaryButton>
                    </div>
                </div>
            :   null}
        </div>
    );
}
