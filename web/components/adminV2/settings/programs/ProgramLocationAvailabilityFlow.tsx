"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEditorSection,
    ConfigObjectHeader,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    applyPrototypeAvailability,
    buildPrototypePreview,
    isProgramLocationAvailabilityPrototype,
    PROGRAM_LOCATION_STATUS_LABEL,
    resolvePrototypeLocationRows,
    statusLabelForRow,
    type PrototypeApplyResult,
    type PrototypeLocationRow,
} from "@/lib/configRuntime/programLocationAvailabilityPrototypeModel";
import {
    fetchProgramCatalogSnapshot,
    publishedProgramsForAssignment,
    slugifyProgramKey,
} from "@/lib/programs/locationProgramAssociation";

export type ProgramLocationAvailabilityEntry =
    | { direction: "organization_program"; programId: string; programLabel: string; publicationReady: boolean }
    | { direction: "location"; activeLocationId: string; activeLocationLabel: string };

type Step = "context" | "locations" | "review" | "success";
type LocationEntryMode = "choose" | "use_existing" | "create_new";

type PublishedProgram = { id: string; key: string; label: string; publicationId: string };

/**
 * Stage 1 interactive prototype — Programs made available at Locations.
 * Renders inside Configuration Continuity surfaces. Does not mutate production.
 */
export function ProgramLocationAvailabilityFlow({
    entry,
    locations,
    alreadyAssociatedLocationIds,
    locallyConfiguredLocationIds,
    associatedProgramIds,
    associatedProgramKeys,
    onCancel,
    onDone,
}: {
    entry: ProgramLocationAvailabilityEntry;
    locations: readonly { id: string; label: string }[];
    alreadyAssociatedLocationIds: ReadonlySet<string>;
    locallyConfiguredLocationIds?: ReadonlySet<string>;
    associatedProgramIds?: ReadonlySet<string>;
    associatedProgramKeys?: ReadonlySet<string>;
    onCancel: () => void;
    onDone: (result: PrototypeApplyResult) => void;
}) {
    const prototype = isProgramLocationAvailabilityPrototype();
    const [step, setStep] = useState<Step>("context");
    const [locationMode, setLocationMode] = useState<LocationEntryMode>(
        entry.direction === "location" ? "choose" : "use_existing",
    );
    const [search, setSearch] = useState("");
    const [locationSearch, setLocationSearch] = useState("");
    const [published, setPublished] = useState<PublishedProgram[]>([]);
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
    const [applyResult, setApplyResult] = useState<PrototypeApplyResult | null>(null);

    useEffect(() => {
        if (entry.direction !== "location") return;
        if (locationMode !== "use_existing" && locationMode !== "create_new") return;
        let cancelled = false;
        setCatalogLoading(true);
        setCatalogError(null);
        void fetchProgramCatalogSnapshot()
            .then((snapshot) => {
                if (cancelled) return;
                const publishedOnly = publishedProgramsForAssignment(snapshot.programs ?? []);
                if (publishedOnly.length > 0) {
                    setPublished(publishedOnly);
                    return;
                }
                // Stage 1: when no published Programs exist, surface drafts so Use existing remains demoable.
                const drafts = (snapshot.programs ?? [])
                    .filter((program) => program.lifecycleStatus !== "retired")
                    .map((program) => ({
                        id: program.id,
                        key: program.key,
                        label: program.draft?.label?.trim() || program.key,
                        publicationId: program.latestPublication?.id ?? `prototype-draft:${program.id}`,
                    }));
                setPublished(drafts);
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

    const programLabel =
        entry.direction === "organization_program"
            ? entry.programLabel
            : locationMode === "create_new"
              ? createName.trim() || "New Program"
              : (published.find((row) => row.id === selectedProgramId)?.label ?? "Program");

    const programIdForRows =
        entry.direction === "organization_program"
            ? entry.programId
            : locationMode === "create_new"
              ? `__draft__:${slugifyProgramKey(createName) || "new"}`
              : selectedProgramId;

    const rows: PrototypeLocationRow[] = useMemo(() => {
        const already = new Set(alreadyAssociatedLocationIds);
        if (
            entry.direction === "location"
            && selectedProgramId
            && (associatedProgramIds?.has(selectedProgramId)
                || associatedProgramKeys?.has(
                    published.find((row) => row.id === selectedProgramId)?.key ?? "",
                ))
        ) {
            already.add(entry.activeLocationId);
        }
        return resolvePrototypeLocationRows({
            locations,
            programId: programIdForRows,
            alreadyAssociatedIds: already,
            locallyConfiguredIds: locallyConfiguredLocationIds,
        });
    }, [
        locations,
        programIdForRows,
        alreadyAssociatedLocationIds,
        locallyConfiguredLocationIds,
        entry,
        selectedProgramId,
        associatedProgramIds,
        associatedProgramKeys,
        published,
    ]);

    const selectedSet = useMemo(() => new Set(selectedLocationIds), [selectedLocationIds]);

    const preview = useMemo(
        () =>
            buildPrototypePreview({
                programLabel,
                rows,
                selectedIds: selectedSet,
            }),
        [programLabel, rows, selectedSet],
    );

    const filteredLocations = useMemo(() => {
        const q = locationSearch.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(
            (row) => row.label.toLowerCase().includes(q) || row.id.toLowerCase().includes(q),
        );
    }, [rows, locationSearch]);

    const filteredPrograms = useMemo(() => {
        const q = search.trim().toLowerCase();
        return published.filter((program) => {
            if (!q) return true;
            return (
                program.label.toLowerCase().includes(q) || program.key.toLowerCase().includes(q)
            );
        });
    }, [published, search]);

    const currentAvailableCount = rows.filter(
        (row) =>
            row.status === "already_associated_inherits"
            || row.status === "already_associated_local",
    ).length;

    const canContinueFromContext =
        entry.direction === "organization_program"
            ? entry.publicationReady
            : locationMode === "use_existing"
              ? Boolean(selectedProgramId)
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
    };

    const selectAllEligible = () => {
        const ids = rows
            .filter((row) => row.status !== "blocked")
            .map((row) => row.id);
        if (entry.direction === "location" && !ids.includes(entry.activeLocationId)) {
            ids.unshift(entry.activeLocationId);
        }
        setSelectedLocationIds(ids);
    };

    const clearAll = () => {
        setSelectedLocationIds(
            entry.direction === "location" ? [entry.activeLocationId] : [],
        );
    };

    const commitPrototype = () => {
        const id =
            entry.direction === "organization_program"
                ? entry.programId
                : locationMode === "create_new"
                  ? `prototype-created:${slugifyProgramKey(createName) || "program"}`
                  : (selectedProgramId ?? "unknown");
        const result = applyPrototypeAvailability({
            programId: id,
            programLabel,
            createdProgram: entry.direction === "location" && locationMode === "create_new",
            rows,
            selectedIds: selectedSet,
        });
        setApplyResult(result);
        setStep("success");
    };

    const headerFacts =
        step === "success" && applyResult
            ? [
                  applyResult.successCopy,
                  prototype ? "Prototype — no production mutation" : "",
              ].filter(Boolean)
            : [
                  PROGRAM_LOCATION_STATUS_LABEL.organizationDefinition,
                  currentAvailableCount > 0
                      ? `Available at ${currentAvailableCount} Location${currentAvailableCount === 1 ? "" : "s"}`
                      : "Not yet available at Locations",
                  prototype ? "Prototype preview" : "",
              ].filter(Boolean);

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
                        step === "success" ? "Complete"
                        : step === "review" ? "Review"
                        : step === "locations" ? "Choose Locations"
                        : "Program",
                    tone: step === "success" ? "active" : "attention",
                }}
                facts={headerFacts}
                actions={
                    step !== "success" ?
                        <ConfigurationSecondaryButton onClick={onCancel} data-testid="pla-flow-cancel">
                            Cancel
                        </ConfigurationSecondaryButton>
                    :   null
                }
                testId="pla-flow-header"
            />

            {prototype ?
                <p
                    className="rounded-lg border border-alloy-forge/10 bg-white px-3 py-2 text-[11px] text-alloy-midnight/55"
                    data-testid="pla-flow-prototype-banner"
                >
                    Interactive prototype — Apply updates fixture state only. Production assignment is not
                    written.
                </p>
            :   null}

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
                                    <dt className="config-typo-field-label">Identity</dt>
                                    <dd className="font-medium text-alloy-midnight">{entry.programLabel}</dd>
                                </div>
                                <div className="rounded-lg border border-alloy-forge/10 bg-white px-3 py-2">
                                    <dt className="config-typo-field-label">Currently available</dt>
                                    <dd className="font-medium text-alloy-midnight">
                                        {currentAvailableCount} Location
                                        {currentAvailableCount === 1 ? "" : "s"}
                                    </dd>
                                </div>
                                <div className="rounded-lg border border-alloy-forge/10 bg-white px-3 py-2 sm:col-span-2">
                                    <dt className="config-typo-field-label">Shared definition</dt>
                                    <dd className="text-alloy-midnight/70">
                                        {!entry.publicationReady
                                            ? "Publish this Program before making it available at Locations."
                                            : isProgramLocationAvailabilityPrototype()
                                              ? "Prototype may proceed without a published revision — production will require publish."
                                              : "Published Organization definition ready to make available."}
                                    </dd>
                                </div>
                            </dl>
                            {!entry.publicationReady ?
                                <p className="mt-2 text-sm text-alloy-ember" role="status">
                                    Publish required before Add to Locations.
                                </p>
                            :   null}
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
                            description="Choose a Program to make available. Production requires a published revision; this prototype may list drafts when none are published."
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
                                <p className="config-typo-sublabel mt-2">Loading published Programs…</p>
                            : catalogError ?
                                <p className="mt-2 text-sm text-red-800" role="alert">{catalogError}</p>
                            :   <ul className="mt-2 max-h-56 divide-y divide-alloy-forge/10 overflow-y-auto rounded-lg border border-alloy-forge/10 bg-white">
                                    {filteredPrograms.map((program) => {
                                        const already =
                                            associatedProgramIds?.has(program.id)
                                            || associatedProgramKeys?.has(program.key);
                                        return (
                                            <li key={program.id}>
                                                <label className="flex cursor-pointer items-start gap-2 px-3 py-2.5 hover:bg-alloy-stone/[0.06]">
                                                    <input
                                                        type="radio"
                                                        name="pla-program-pick"
                                                        className="mt-1"
                                                        checked={selectedProgramId === program.id}
                                                        onChange={() => setSelectedProgramId(program.id)}
                                                        data-testid={`pla-flow-pick-${program.id}`}
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-medium text-alloy-midnight">
                                                            {program.label}
                                                        </span>
                                                        <span className="config-typo-sublabel block font-mono">
                                                            {program.key}
                                                            {already ? " · already available here" : ""}
                                                        </span>
                                                    </span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                            }
                            <div className="mt-2">
                                <ConfigurationSecondaryButton onClick={() => setLocationMode("choose")}>
                                    Back
                                </ConfigurationSecondaryButton>
                            </div>
                        </ConfigEditorSection>
                    :   <ConfigEditorSection
                            title="New Organization Program"
                            description="Creates one Organization definition, then makes it available at selected Locations."
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
                                    }}
                                    className="config-runtime-input font-mono"
                                    data-testid="pla-flow-create-key"
                                />
                            </label>
                            <div className="mt-2">
                                <ConfigurationSecondaryButton onClick={() => setLocationMode("choose")}>
                                    Back
                                </ConfigurationSecondaryButton>
                            </div>
                        </ConfigEditorSection>
                    }

                    {entry.direction === "location" && locationMode === "choose" ? null : (
                        <div className="flex flex-wrap gap-2">
                            <ConfigurationPrimaryButton
                                disabled={!canContinueFromContext}
                                onClick={() => setStep("locations")}
                                data-testid="pla-flow-continue-locations"
                            >
                                Choose Locations
                            </ConfigurationPrimaryButton>
                        </div>
                    )}
                </div>
            :   null}

            {step === "locations" ?
                <div className="space-y-3" data-testid="pla-flow-step-locations">
                    <ConfigEditorSection
                        title={`Make available at Locations`}
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
                                onClick={selectAllEligible}
                                data-testid="pla-flow-select-all"
                            >
                                Select all eligible
                            </ConfigurationSecondaryButton>
                            <ConfigurationSecondaryButton onClick={clearAll} data-testid="pla-flow-clear-all">
                                Clear
                            </ConfigurationSecondaryButton>
                        </div>
                        <p className="mb-2 text-[11px] text-alloy-midnight/55" data-testid="pla-flow-selection-summary">
                            {preview.inheritsOrganization.length} will inherit Organization ·{" "}
                            {preview.unchangedLocal.length} locally configured · {preview.blocked.length}{" "}
                            blocked
                        </p>
                        <ul className="max-h-72 divide-y divide-alloy-forge/10 overflow-y-auto rounded-lg border border-alloy-forge/10 bg-white">
                            {filteredLocations.map((row) => {
                                const locked =
                                    entry.direction === "location"
                                    && row.id === entry.activeLocationId;
                                const checked = selectedSet.has(row.id);
                                const blocked = row.status === "blocked";
                                return (
                                    <li key={row.id}>
                                        <label
                                            className={`flex items-start gap-2 px-3 py-2.5 ${
                                                locked
                                                    ? "bg-alloy-bend-pine/[0.04]"
                                                    : blocked
                                                      ? "cursor-not-allowed opacity-60"
                                                      : "cursor-pointer hover:bg-alloy-stone/[0.06]"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-1"
                                                checked={checked}
                                                disabled={locked || blocked}
                                                onChange={() => toggleLocation(row.id)}
                                                data-testid={`pla-flow-location-${row.id}`}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium text-alloy-midnight">
                                                        {row.label}
                                                    </span>
                                                    <span className="rounded-full border border-alloy-forge/15 px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/55">
                                                        {statusLabelForRow(row.status)}
                                                    </span>
                                                    {locked ?
                                                        <span className="config-typo-sublabel">
                                                            · active Location
                                                        </span>
                                                    :   null}
                                                </span>
                                                {blocked && row.blockReason ?
                                                    <span className="config-typo-sublabel mt-0.5 block">
                                                        {row.blockReason}
                                                    </span>
                                                :   null}
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </ConfigEditorSection>
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            disabled={selectedLocationIds.length === 0}
                            onClick={() => setStep("review")}
                            data-testid="pla-flow-continue-review"
                        >
                            Review
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton onClick={() => setStep("context")}>
                            Back
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            :   null}

            {step === "review" ?
                <div className="space-y-3" data-testid="pla-flow-step-review">
                    <ConfigEditorSection
                        title="Review"
                        description={preview.confirmationCopy}
                        testId="pla-flow-review"
                    >
                        <ul className="space-y-2 text-sm text-alloy-midnight/75">
                            <li>
                                <strong className="text-alloy-midnight">{preview.newAssociations.length}</strong>{" "}
                                new associations
                            </li>
                            <li>
                                <strong className="text-alloy-midnight">
                                    {preview.inheritsOrganization.length}
                                </strong>{" "}
                                Locations will use the Organization definition
                            </li>
                            <li>
                                <strong className="text-alloy-midnight">{preview.unchangedLocal.length}</strong>{" "}
                                Locations already have local configuration and will retain it
                            </li>
                            <li>
                                <strong className="text-alloy-midnight">{preview.blocked.length}</strong>{" "}
                                selected Locations are blocked and will not be changed
                            </li>
                            <li className="config-typo-sublabel">{preview.refreshExpectation}</li>
                        </ul>
                        {preview.blocked.length > 0 ?
                            <div className="mt-3 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.04] px-3 py-2">
                                <p className="text-[11px] font-semibold text-alloy-midnight">Blocked</p>
                                <ul className="mt-1 space-y-1 text-[11px] text-alloy-midnight/60">
                                    {preview.blocked.map((row) => (
                                        <li key={row.id}>
                                            {row.label} — {row.blockReason}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        :   null}
                    </ConfigEditorSection>
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton onClick={commitPrototype} data-testid="pla-flow-apply">
                            Apply
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton onClick={() => setStep("locations")}>
                            Back
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            :   null}

            {step === "success" && applyResult ?
                <div className="space-y-3" data-testid="pla-flow-step-success">
                    <ConfigEditorSection
                        title={applyResult.successCopy}
                        description={
                            applyResult.createdProgram
                                ? "Organization Program created in prototype session · associations recorded in fixture state only."
                                : "Associations recorded in prototype session only."
                        }
                        testId="pla-flow-success"
                    >
                        <ul className="space-y-1 text-sm text-alloy-midnight/75">
                            <li>
                                Affected: {applyResult.associatedLocationIds.length} Location
                                {applyResult.associatedLocationIds.length === 1 ? "" : "s"}
                            </li>
                            <li>Skipped / blocked: {applyResult.blocked.length}</li>
                            <li>Unchanged local configuration: {applyResult.unchangedLocationIds.length}</li>
                            <li className="config-typo-sublabel">
                                Status: {applyResult.status}
                                {prototype ? " · retry will be wired in production Stage 3" : ""}
                            </li>
                        </ul>
                    </ConfigEditorSection>
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            onClick={() => onDone(applyResult)}
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
