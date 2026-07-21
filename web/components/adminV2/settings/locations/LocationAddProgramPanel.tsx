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
import {
    assignExistingProgramPublication,
    createPublishAndAssignProgram,
    fetchProgramCatalogSnapshot,
    publishedProgramsForAssignment,
    slugifyProgramKey,
} from "@/lib/programs/locationProgramAssociation";

type Mode = "choose" | "use_existing" | "create_new";

export default function LocationAddProgramPanel({
    activeLocationId,
    activeLocationLabel,
    locations,
    associatedProgramIds,
    associatedProgramKeys,
    onCancel,
    onComplete,
}: {
    activeLocationId: string;
    activeLocationLabel: string;
    locations: readonly { id: string; label: string }[];
    /** Organization program ids already linked on the active Location. */
    associatedProgramIds: ReadonlySet<string>;
    associatedProgramKeys: ReadonlySet<string>;
    onCancel: () => void;
    onComplete: (result: { programId: string; targetLocationIds: string[] }) => Promise<void> | void;
}) {
    const requestSeq = useRef(0);
    const [mode, setMode] = useState<Mode>("choose");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [published, setPublished] = useState<
        Array<{ id: string; key: string; label: string; publicationId: string }>
    >([]);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([activeLocationId]);
    const [createName, setCreateName] = useState("");
    const [createKey, setCreateKey] = useState("");
    const [keyTouched, setKeyTouched] = useState(false);

    useEffect(() => {
        setSelectedLocationIds((current) =>
            current.includes(activeLocationId) ? current : [activeLocationId, ...current],
        );
    }, [activeLocationId]);

    useEffect(() => {
        if (mode !== "use_existing" && mode !== "create_new") return;
        let cancelled = false;
        const seq = ++requestSeq.current;
        setCatalogLoading(true);
        setError(null);
        void fetchProgramCatalogSnapshot()
            .then((snapshot) => {
                if (cancelled || seq !== requestSeq.current) return;
                setPublished(publishedProgramsForAssignment(snapshot.programs ?? []));
            })
            .catch((cause) => {
                if (cancelled || seq !== requestSeq.current) return;
                setError(cause instanceof Error ? cause.message : "Could not load Programs.");
            })
            .finally(() => {
                if (cancelled || seq !== requestSeq.current) return;
                setCatalogLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [mode]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return published.filter((program) => {
            if (!q) return true;
            return (
                program.label.toLowerCase().includes(q)
                || program.key.toLowerCase().includes(q)
            );
        });
    }, [published, search]);

    const selectedProgram = published.find((row) => row.id === selectedProgramId) ?? null;

    const toggleLocation = (locationId: string) => {
        if (locationId === activeLocationId) return;
        setSelectedLocationIds((current) =>
            current.includes(locationId)
                ? current.filter((id) => id !== locationId)
                : [...current, locationId],
        );
    };

    const ensureActiveSelected = (ids: string[]) =>
        ids.includes(activeLocationId) ? ids : [activeLocationId, ...ids];

    const submitUseExisting = async () => {
        if (!selectedProgram) return;
        setBusy(true);
        setError(null);
        const targets = ensureActiveSelected(selectedLocationIds);
        const seq = ++requestSeq.current;
        try {
            await assignExistingProgramPublication({
                publicationId: selectedProgram.publicationId,
                targetLocationIds: targets,
            });
            if (seq !== requestSeq.current) return;
            await onComplete({ programId: selectedProgram.id, targetLocationIds: targets });
        } catch (cause) {
            if (seq !== requestSeq.current) return;
            setError(cause instanceof Error ? cause.message : "Assignment failed.");
        } finally {
            if (seq === requestSeq.current) setBusy(false);
        }
    };

    const submitCreate = async () => {
        const label = createName.trim();
        const key = (keyTouched ? createKey : slugifyProgramKey(label) || createKey).trim();
        if (!label || !key) return;
        setBusy(true);
        setError(null);
        const targets = ensureActiveSelected(selectedLocationIds);
        const seq = ++requestSeq.current;
        try {
            const { programId } = await createPublishAndAssignProgram({
                label,
                key,
                targetLocationIds: targets,
            });
            if (seq !== requestSeq.current) return;
            await onComplete({ programId, targetLocationIds: targets });
        } catch (cause) {
            if (seq !== requestSeq.current) return;
            setError(cause instanceof Error ? cause.message : "Create and assign failed.");
        } finally {
            if (seq === requestSeq.current) setBusy(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="locations-program-add-panel">
            <ConfigObjectHeader
                size="hero"
                name="Add Program"
                status={{ label: mode === "choose" ? "Choose path" : "In progress", tone: "attention" }}
                facts={[`Stay at ${activeLocationLabel || "this Location"}`].filter(Boolean)}
                actions={
                    <ConfigurationSecondaryButton onClick={onCancel} disabled={busy}>
                        Cancel
                    </ConfigurationSecondaryButton>
                }
                testId="locations-program-add-header"
            />

            {mode === "choose" ?
                <ConfigEditorSection
                    title="How should this Location receive a Program?"
                    description="Programs are Organization definitions. This flow creates associations — not duplicate Location-owned identities."
                    testId="locations-program-add-mode"
                >
                    <div className="space-y-2">
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-alloy-forge/10 px-3 py-2.5 hover:bg-alloy-stone/[0.04]">
                            <input
                                type="radio"
                                name="locations-program-add-mode"
                                className="mt-1"
                                checked={false}
                                onChange={() => setMode("use_existing")}
                                data-testid="locations-program-add-use-existing"
                            />
                            <span>
                                <span className="block text-sm font-semibold text-alloy-midnight">
                                    Use an existing Program
                                </span>
                                <span className="config-typo-sublabel block">
                                    Search published Organization Programs and assign them here.
                                </span>
                            </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-alloy-forge/10 px-3 py-2.5 hover:bg-alloy-stone/[0.04]">
                            <input
                                type="radio"
                                name="locations-program-add-mode"
                                className="mt-1"
                                checked={false}
                                onChange={() => setMode("create_new")}
                                data-testid="locations-program-add-create-new"
                            />
                            <span>
                                <span className="block text-sm font-semibold text-alloy-midnight">
                                    Create a new Program
                                </span>
                                <span className="config-typo-sublabel block">
                                    Create one Organization Program, then assign it to selected Locations.
                                </span>
                            </span>
                        </label>
                        <div className="flex gap-2 pt-1">
                            <ConfigurationPrimaryButton
                                onClick={() => setMode("use_existing")}
                                data-testid="locations-program-add-continue-existing"
                            >
                                Use existing
                            </ConfigurationPrimaryButton>
                            <ConfigurationSecondaryButton
                                onClick={() => setMode("create_new")}
                                data-testid="locations-program-add-continue-create"
                            >
                                Create new
                            </ConfigurationSecondaryButton>
                        </div>
                    </div>
                </ConfigEditorSection>
            :   null}

            {mode === "use_existing" || mode === "create_new" ?
                <>
                    {mode === "use_existing" ?
                        <ConfigEditorSection
                            title="Organization Programs"
                            description="Only published Programs can be assigned."
                            testId="locations-program-add-catalog"
                        >
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search by name or key"
                                className="config-runtime-input"
                                data-testid="locations-program-add-search"
                            />
                            {catalogLoading ?
                                <p className="config-typo-sublabel mt-2">Loading published Programs…</p>
                            :   <ul
                                    className="mt-2 max-h-56 divide-y divide-alloy-forge/10 overflow-y-auto rounded-lg border border-alloy-forge/10"
                                    data-testid="locations-program-add-catalog-list"
                                >
                                    {filtered.length === 0 ?
                                        <li className="px-3 py-2.5 text-sm text-alloy-midnight/55">
                                            No published Programs match.
                                        </li>
                                    :   filtered.map((program) => {
                                            const already =
                                                associatedProgramIds.has(program.id)
                                                || associatedProgramKeys.has(program.key);
                                            return (
                                                <li key={program.id}>
                                                    <label
                                                        className={`flex cursor-pointer items-start gap-2 px-3 py-2.5 ${
                                                            already ? "bg-alloy-stone/[0.04]" : "hover:bg-alloy-stone/[0.06]"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="locations-program-add-pick"
                                                            className="mt-1"
                                                            checked={selectedProgramId === program.id}
                                                            onChange={() => setSelectedProgramId(program.id)}
                                                            data-testid={`locations-program-add-pick-${program.id}`}
                                                        />
                                                        <span className="min-w-0">
                                                            <span className="block text-sm font-medium text-alloy-midnight">
                                                                {program.label}
                                                            </span>
                                                            <span className="config-typo-sublabel block font-mono">
                                                                {program.key}
                                                                {already ? " · already associated here" : ""}
                                                            </span>
                                                        </span>
                                                    </label>
                                                </li>
                                            );
                                        })}
                                </ul>
                            }
                        </ConfigEditorSection>
                    :   <ConfigEditorSection
                            title="New Organization Program"
                            description="Creates exactly one Organization identity, then assigns it."
                            testId="locations-program-add-create-fields"
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
                                    data-testid="locations-program-add-create-name"
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
                                    data-testid="locations-program-add-create-key"
                                />
                            </label>
                        </ConfigEditorSection>
                    }

                    <ConfigEditorSection
                        title="Assign to Locations"
                        description={`${activeLocationLabel || "This Location"} stays selected.`}
                        testId="locations-program-add-targets"
                    >
                        <ul className="max-h-48 divide-y divide-alloy-forge/10 overflow-y-auto rounded-lg border border-alloy-forge/10">
                            {locations.map((location) => {
                                const locked = location.id === activeLocationId;
                                const checked = selectedLocationIds.includes(location.id);
                                return (
                                    <li key={location.id}>
                                        <label
                                            className={`flex items-start gap-2 px-3 py-2.5 ${
                                                locked ? "bg-alloy-bend-pine/[0.04]" : "cursor-pointer hover:bg-alloy-stone/[0.06]"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-1"
                                                checked={checked}
                                                disabled={locked || busy}
                                                onChange={() => toggleLocation(location.id)}
                                                data-testid={`locations-program-add-location-${location.id}`}
                                            />
                                            <span className="text-sm text-alloy-midnight">
                                                <span className="font-medium">{location.label}</span>
                                                {locked ?
                                                    <span className="config-typo-sublabel ml-1">· active Location</span>
                                                :   null}
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                        {selectedProgram || (mode === "create_new" && createName.trim()) ?
                            <p
                                className="mt-2 text-[11px] text-alloy-midnight/60"
                                data-testid="locations-program-add-preview"
                            >
                                Will associate{" "}
                                <span className="font-semibold text-alloy-midnight">
                                    {selectedProgram?.label
                                        ?? createName.trim()
                                        ?? "Program"}
                                </span>{" "}
                                to {ensureActiveSelected(selectedLocationIds).length}{" "}
                                {ensureActiveSelected(selectedLocationIds).length === 1
                                    ? "Location"
                                    : "Locations"}
                                .
                            </p>
                        :   null}
                    </ConfigEditorSection>

                    {error ?
                        <p className="text-sm text-red-800" role="alert" data-testid="locations-program-add-error">
                            {error}
                        </p>
                    :   null}

                    <div className="flex flex-wrap gap-2 pt-1">
                        <ConfigurationPrimaryButton
                            disabled={
                                busy
                                || (mode === "use_existing" && !selectedProgram)
                                || (mode === "create_new"
                                    && (!createName.trim()
                                        || !(keyTouched ? createKey : slugifyProgramKey(createName)).trim()))
                            }
                            onClick={() =>
                                void (mode === "use_existing" ? submitUseExisting() : submitCreate())
                            }
                            data-testid="locations-program-add-confirm"
                        >
                            {busy ?
                                mode === "create_new" ?
                                    "Creating…"
                                :   "Assigning…"
                            : mode === "create_new" ?
                                "Create and assign"
                            :   "Assign Program"}
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton
                            onClick={() => {
                                setMode("choose");
                                setError(null);
                            }}
                            disabled={busy}
                        >
                            Back
                        </ConfigurationSecondaryButton>
                        <ConfigurationSecondaryButton onClick={onCancel} disabled={busy}>
                            Cancel
                        </ConfigurationSecondaryButton>
                    </div>
                </>
            :   null}
        </div>
    );
}
