"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Plus } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigDistributionRuntime,
    ConfigHistoryTimeline,
    ConfigWorkspaceCard,
    type ConfigDetailTab,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ProgramLocationAvailabilityFlow } from "@/components/adminV2/settings/programs/ProgramLocationAvailabilityFlow";
import {
    ConfigurationObjectEditGate,
    ConfigurationObjectWorkspace,
} from "@/components/adminV2/settings/configurationRuntime/object";
import {
    ConfigurationCommandRailActions,
    type ConfigurationRailAction,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationCommandRailActions";
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { organizationProgramsHref } from "@/lib/admin/canonicalAdminRoutes";
import type { ConfigurationDetailSection } from "@/lib/configPublication/runtimeModel";
import {
    classifyConfigurationRuntimeIssue,
    ConfigurationRuntimeIssueError,
    readConfigurationRuntimeIssue,
    type ConfigurationRuntimeIssue,
} from "@/lib/configPublication/runtimeIssue";
import type {
    ProgramDraft,
    ProgramPayload,
    ProgramRevision,
} from "@/lib/programs/publication/programPublicationModel";
import type {
    ProgramCatalogItem,
    ProgramPublicationSnapshot,
} from "@/lib/programs/publication/programPublicationService";
import {
    buildProgramCollectionItem,
    buildProgramPublicationViewModel,
} from "@/lib/programs/publication/programPublicationViewModel";
import {
    normalizeProgramConfigurationSection,
    type ProgramConfigurationSection,
} from "@/lib/programs/programConfigurationSections";
import {
    ProgramAvailabilitySection,
    ProgramOfferingsSection,
    ProgramPoliciesSection,
    ProgramPricingSection,
    ProgramRelationshipsSection,
} from "@/components/adminV2/settings/programs/ProgramDomainSections";
import { ProgramOverviewSurface } from "@/components/adminV2/settings/programs/ProgramOverviewSurface";
import ProgramsLanding from "@/components/adminV2/settings/programs/ProgramsLanding";
import {
    buildProgramsConfigurationObjectDescriptor,
    PROGRAMS_WORKSPACE_SIBLING_CHAPTERS,
} from "@/lib/configRuntime/configurationObject/programsAdoptionSeam";
import type { ProgramsWorkspaceChapter } from "@/lib/commercial/commercialChapterRoutes";
import { buildProgramsLandingViewModel } from "@/lib/programs/publication/programsLandingModel";
import { visibleConfigurationObjectConcerns } from "@/lib/configRuntime/configurationObject/concernRegistry";
import {
    beginConfigurationObjectEdit,
    cancelConfigurationObjectEdit,
    completeConfigurationObjectSave,
    configurationObjectEditBlocksNavigation,
    createConfigurationObjectEditSession,
    failConfigurationObjectSave,
    markConfigurationObjectSaving,
    patchConfigurationObjectDraft,
} from "@/lib/configRuntime/configurationObject/editingLifecycle";
import {
    invalidateProgramsCollection,
    loadProgramsCollection,
    peekProgramsCollection,
} from "@/lib/programs/programsCollectionCache";
import {
    resolveProgramsConcernState,
    resolveProgramsSelection,
} from "@/lib/programs/programsSelectionAdapter";
import {
    markConfigurationContinuity,
} from "@/lib/configRuntime/configurationContinuity";
import {
    publishConfigurationInvalidation,
    subscribeConfigurationInvalidation,
} from "@/lib/configRuntime/configurationInvalidation";

const ENDPOINT = "/api/admin/configuration/programs";

type DraftForm = {
    label: string;
    description: string;
    category: string;
    requiredResourceType: string;
    minimumAge: string;
    maximumAge: string;
    qualificationRequirements: string;
};

function formFor(program: ProgramCatalogItem): DraftForm {
    return {
        label: program.draft.label,
        description: program.draft.description ?? "",
        category: program.draft.category ?? "",
        requiredResourceType: program.draft.requiredResourceType ?? "",
        minimumAge:
            typeof program.draft.audience.minimumAge === "number"
                ? String(program.draft.audience.minimumAge)
                : "",
        maximumAge:
            typeof program.draft.audience.maximumAge === "number"
                ? String(program.draft.audience.maximumAge)
                : "",
        qualificationRequirements: program.draft.qualificationRequirements
            .map(String)
            .join("\n"),
    };
}

function optionalNumber(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function audienceLabel(definition: ProgramPayload): string {
    const minimum =
        typeof definition.audience.minimumAge === "number"
            ? String(definition.audience.minimumAge)
            : null;
    const maximum =
        typeof definition.audience.maximumAge === "number"
            ? String(definition.audience.maximumAge)
            : null;
    if (minimum && maximum) return `Ages ${minimum}–${maximum}`;
    if (minimum) return `Age ${minimum}+`;
    if (maximum) return `Up to age ${maximum}`;
    return "Audience not specified";
}

function ProgramDefinitionSummary({
    definition,
    label,
    testId,
}: {
    definition: ProgramPayload;
    label: string;
    testId: string;
}) {
    const rows = [
        ["Name", definition.label],
        ["Category", definition.category ?? "Not set"],
        ["Audience", audienceLabel(definition)],
        ["Required resource", definition.requiredResourceType ?? "Not set"],
        [
            "Qualifications",
            definition.qualificationRequirements.length > 0
                ? definition.qualificationRequirements.map(String).join(", ")
                : "None specified",
        ],
        ["Description", definition.description ?? "No description"],
    ];
    return (
        <div data-testid={testId}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                {label}
            </p>
            <dl className="divide-y divide-alloy-stone/20">
                {rows.map(([term, value]) => (
                    <div key={term} className="grid gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                        <dt className="text-[11px] font-semibold text-alloy-midnight/45">{term}</dt>
                        <dd className="text-sm text-alloy-midnight/75">{value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

async function postAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
        const issue = readConfigurationRuntimeIssue(json.error, "Programs");
        throw new ConfigurationRuntimeIssueError(issue);
    }
    return json;
}

function programSectionForRuntime(section: ConfigurationDetailSection): ProgramConfigurationSection {
    return normalizeProgramConfigurationSection(section);
}

export default function ProgramsPublicationWorkspace(props: {
    initialProgramId?: string | null;
    initialSection?: ProgramConfigurationSection;
    /** @deprecated Chapters redirect to Financials at the route layer — ignored. */
    initialChapter?: ProgramsWorkspaceChapter | null;
}) {
    const { orgId: authOrgId } = useAdminAuth();
    const continuity = useConfigurationContinuityOptional();
    const orgId = continuity?.orgId || authOrgId || "";

    return <ProgramsPublicationObjectWorkspace {...props} orgId={orgId} />;
}

function ProgramsPublicationObjectWorkspace(props: {
    initialProgramId?: string | null;
    initialSection?: ProgramConfigurationSection;
    orgId: string;
}) {
    const router = useRouter();
    const continuity = useConfigurationContinuityOptional();
    const orgId = props.orgId;
    const retainedProgramId = continuity?.selection?.programId ?? null;
    const retainedSection = continuity?.selection?.programSection ?? null;
    const [snapshot, setSnapshot] = useState<ProgramPublicationSnapshot | null>(() =>
        orgId ? (peekProgramsCollection(orgId) ?? null) : null,
    );
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
        props.initialProgramId?.trim() || null,
    );
    const [activeSection, setActiveSection] = useState<ProgramConfigurationSection>(
        props.initialSection ?? "overview",
    );
    const [shouldSyncRoute, setShouldSyncRoute] = useState(false);
    const [form, setForm] = useState<DraftForm | null>(null);
    const [editSession, setEditSession] = useState(() => createConfigurationObjectEditSession<DraftForm>());
    const [loading, setLoading] = useState(!snapshot);
    const [working, setWorking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadIssue, setLoadIssue] = useState<ConfigurationRuntimeIssue | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createKey, setCreateKey] = useState("");
    const [landingSearch, setLandingSearch] = useState("");
    const [showRetired, setShowRetired] = useState(false);
    const skipHistorySyncRef = useRef(false);
    const objectDescriptor = useMemo(() => buildProgramsConfigurationObjectDescriptor(), []);

    const applySelection = useCallback(
        (programs: ProgramCatalogItem[], routeProgramId: string | null | undefined) => {
            const resolution = resolveProgramsSelection({
                routeProgramId,
                retainedProgramId,
                validProgramIds: programs.map((program) => program.id),
            });
            setSelectedProgramId(resolution.objectId);
            setShouldSyncRoute(resolution.shouldSyncRoute);
            if (resolution.error) setError(resolution.error);
            if (resolution.source === "retained" && resolution.objectId) {
                const section = normalizeProgramConfigurationSection(retainedSection);
                setActiveSection(section);
            }
            return resolution;
        },
        [retainedProgramId, retainedSection],
    );

    const selectProgram = useCallback(
        (programId: string | null, section: ProgramConfigurationSection = "overview") => {
            if (configurationObjectEditBlocksNavigation(editSession)) {
                const confirmed = window.confirm("Discard unsaved Program changes?");
                if (!confirmed) return;
                setEditSession(cancelConfigurationObjectEdit(editSession));
            }
            setSelectedProgramId(programId);
            setActiveSection(section);
            setShouldSyncRoute(false);
            continuity?.rememberProgramSelection({
                programId,
                section: programId ? section : null,
            });
            // Explicit operator selection — push for Back/Forward across Programs.
            router.push(organizationProgramsHref(programId, section), { scroll: false });
        },
        [continuity, editSession, router],
    );

    const navigateSection = useCallback(
        (section: ProgramConfigurationSection) => {
            if (
                configurationObjectEditBlocksNavigation(editSession)
                && activeSection === "definition"
                && section !== "definition"
            ) {
                const confirmed = window.confirm("Discard unsaved Program changes?");
                if (!confirmed) return;
                setEditSession(cancelConfigurationObjectEdit(editSession));
            }
            setActiveSection(section);
            setShouldSyncRoute(false);
            if (selectedProgramId) {
                continuity?.rememberProgramSelection({
                    programId: selectedProgramId,
                    section,
                });
                router.push(organizationProgramsHref(selectedProgramId, section), { scroll: false });
            }
        },
        [activeSection, continuity, editSession, router, selectedProgramId],
    );

    const reload = useCallback(
        async (opts?: { force?: boolean }) => {
            if (!orgId) {
                setLoading(false);
                setLoadIssue(readConfigurationRuntimeIssue("Organization context is required.", "Programs"));
                return;
            }
            const peeked = peekProgramsCollection(orgId);
            if (peeked && !opts?.force) {
                setSnapshot(peeked);
                applySelection(peeked.programs, props.initialProgramId);
                setLoading(false);
            }
            try {
                const { snapshot: next, meta } = await loadProgramsCollection(orgId, {
                    force: opts?.force === true,
                });
                setLoadIssue(null);
                setSnapshot(next);
                applySelection(next.programs, props.initialProgramId);
                markConfigurationContinuity("reveal", {
                    domain: "programs",
                    cache_hit: meta.cacheHit,
                    inflight_join: meta.inflightJoin,
                    stale_reuse: meta.staleReuse,
                });
            } catch (nextError) {
                const issue =
                    nextError instanceof ConfigurationRuntimeIssueError
                        ? nextError.issue
                        : readConfigurationRuntimeIssue(nextError, "Programs");
                setLoadIssue(issue);
                setError(null);
                if (!peeked) {
                    setSnapshot(null);
                    setSelectedProgramId(null);
                }
            } finally {
                setLoading(false);
            }
        },
        [applySelection, orgId, props.initialProgramId],
    );

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (!orgId) return;
        return subscribeConfigurationInvalidation((event) => {
            if (event.scope !== "programs" && event.scope !== "all" && event.scope !== "locations") return;
            invalidateProgramsCollection(orgId, event.reason, { publishBus: false });
            void reload({ force: true });
        });
    }, [orgId, reload]);

    // Retained Continuity restore → replace-sync URL (no history loop).
    //
    // A `router.replace` to the address already displayed is not a no-op: the App Router still issues
    // an RSC round trip for it. That is what made a program save look like it bought its freshness with
    // a route refresh — the freshness actually comes from the configuration invalidation below, and the
    // RSC was this sync re-asserting a URL that had not changed. Syncing only a DIFFERENT href keeps
    // the Continuity restore behaviour and removes the round trip.
    useEffect(() => {
        if (!shouldSyncRoute || !selectedProgramId) return;
        const nextHref = organizationProgramsHref(selectedProgramId, activeSection);
        const currentHref =
            typeof window === "undefined"
                ? null
                : `${window.location.pathname}${window.location.search}`;
        if (currentHref === nextHref) {
            setShouldSyncRoute(false);
            return;
        }
        skipHistorySyncRef.current = true;
        router.replace(nextHref, { scroll: false });
        setShouldSyncRoute(false);
    }, [activeSection, router, selectedProgramId, shouldSyncRoute]);

    // Back/Forward + deep link: URL props win when Continuity restore is not projecting.
    useEffect(() => {
        if (loading || shouldSyncRoute) return;
        if (skipHistorySyncRef.current) {
            skipHistorySyncRef.current = false;
            return;
        }
        const projected = resolveProgramsConcernState({
            routeSection: props.initialSection,
            localSection: activeSection,
            routeProgramId: props.initialProgramId?.trim() || null,
            localProgramId: selectedProgramId,
        });
        if (projected.objectChanged) {
            const resolution = resolveProgramsSelection({
                routeProgramId: props.initialProgramId,
                retainedProgramId: null,
                validProgramIds: snapshot?.programs.map((program) => program.id) ?? [],
                allowRetainedRestore: false,
            });
            setSelectedProgramId(resolution.objectId);
            if (resolution.error) setError(resolution.error);
        }
        if (projected.section !== activeSection || projected.objectChanged) {
            setActiveSection(projected.section);
        }
        // Route props are authoritative; omit local section from deps to avoid loops.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Checkpoint D history projection
    }, [loading, props.initialProgramId, props.initialSection, shouldSyncRoute, snapshot]);

    useEffect(() => {
        if (!configurationObjectEditBlocksNavigation(editSession)) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [editSession]);

    const selectedProgram = useMemo(
        () => snapshot?.programs.find((program) => program.id === selectedProgramId) ?? null,
        [selectedProgramId, snapshot],
    );
    const viewModel = useMemo(
        () =>
            selectedProgram && snapshot
                ? buildProgramPublicationViewModel(selectedProgram, snapshot)
                : null,
        [selectedProgram, snapshot],
    );
    const collectionItems = useMemo(
        () =>
            snapshot?.programs.map((program) => ({
                ...buildProgramCollectionItem(program, snapshot),
                leading: <BookOpen className="h-4 w-4" strokeWidth={2} />,
            })) ?? [],
        [snapshot],
    );
    const landing = useMemo(
        () => (snapshot ? buildProgramsLandingViewModel(snapshot) : null),
        [snapshot],
    );
    const canManage = snapshot?.capabilities.canManage ?? false;

    useEffect(() => {
        setForm(selectedProgram ? formFor(selectedProgram) : null);
        setEditSession(createConfigurationObjectEditSession<DraftForm>());
    }, [selectedProgram]);

    const run = useCallback(
        async (
            key: string,
            action: () => Promise<unknown>,
            options?: { reload?: boolean; afterSuccess?: () => void },
        ) => {
            setWorking(key);
            setError(null);
            try {
                await action();
                if (options?.reload !== false) await reload();
                options?.afterSuccess?.();
            } catch (nextError) {
                const message =
                    nextError instanceof Error ? nextError.message : "The action could not be completed.";
                const issue =
                    nextError instanceof ConfigurationRuntimeIssueError
                        ? nextError.issue
                        : classifyConfigurationRuntimeIssue(nextError, {
                              domainLabel: "Programs",
                              fallbackMessage: message,
                          }).issue;
                setError(`${issue.message} ${issue.nextStep}`);
            } finally {
                setWorking(null);
            }
        },
        [reload],
    );

    const railActions = useMemo<ConfigurationRailAction[]>(() => {
        if (!selectedProgram || !viewModel) {
            return canManage ? [{
                id: "add-configuration-object",
                label: "Add Program",
                reason: "Create an Organization-owned working draft.",
                group: "manage",
                onClick: () => setCreateOpen(true),
            }] : [];
        }
        const actions: ConfigurationRailAction[] = viewModel.runtime.attention
            .filter((item) => item.grade === "fix")
            .map((item) => ({
                id: `attention-${item.key}`,
                label: item.nextLabel,
                reason: item.consequence,
                group: "fix" as const,
                onClick: () => navigateSection(programSectionForRuntime(item.section)),
            }));
        if (canManage && viewModel.runtime.publication.canPublish) {
            actions.push({
                id: "publish-configuration-draft",
                label: "Publish working draft",
                reason: `${viewModel.runtime.publication.activeRevisionLabel} remains active until publication.`,
                group: "next",
                onClick: () => navigateSection("definition"),
            });
        } else if (canManage && viewModel.runtime.publication.hasUnpublishedChanges) {
            actions.push({
                id: "review-configuration-draft",
                label: "Review working draft",
                reason: "Validate the draft before publishing.",
                group: "next",
                onClick: () => navigateSection("definition"),
            });
        }
        if (canManage) {
            actions.push({
                id: "edit-configuration-draft",
                label: "Edit working draft",
                group: "manage",
                onClick: () => navigateSection("definition"),
            }, {
                id: "manage-configuration-assignment",
                label: "Add to Locations",
                group: "manage",
                onClick: () => navigateSection("assignment"),
            });
        }
        actions.push({
            id: "review-configuration-history",
            label: "Review history",
            group: "more",
            onClick: () => navigateSection("history"),
        });
        return actions;
    }, [canManage, navigateSection, selectedProgram, viewModel]);

    if (loading) {
        return (
            <p className="p-6 text-sm text-alloy-midnight/55" data-testid="programs-loading">
                Loading Programs…
            </p>
        );
    }

    const showLanding = !selectedProgramId;

    if (showLanding) {
        return (
            <div
                className="config-runtime-shell process-config-page min-h-0 flex-1"
                data-testid="programs-publication-runtime"
                data-programs-mode="landing"
            >
                <ConfigurationCommandRailActions
                    actions={
                        canManage ?
                            [{
                                id: "add-configuration-object",
                                label: "Add Program",
                                reason: "Create an Organization-owned working draft.",
                                group: "manage",
                                onClick: () => setCreateOpen(true),
                            }]
                        :   []
                    }
                    testIdPrefix="programs-rail"
                />
                <ConfigurationContext
                    title="Programs"
                    subtitle="Reusable Organization services published for Locations to offer."
                    titleIcon={<BookOpen className="h-5 w-5" strokeWidth={2} />}
                    testId="programs-configuration-context"
                    actions={
                        canManage ?
                            <ConfigurationPrimaryButton
                                className="xl:hidden"
                                onClick={() => setCreateOpen(true)}
                                data-testid="programs-mobile-add"
                            >
                                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Add Program
                            </ConfigurationPrimaryButton>
                        :   undefined
                    }
                >
                    <ul
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/52"
                        aria-label="Programs posture"
                        data-testid="programs-collection-posture"
                    >
                        <li>
                            <Link href="/organization" className="font-medium hover:text-alloy-bend-pine">
                                Organization
                            </Link>
                            <span className="mx-1.5 text-alloy-midnight/35" aria-hidden>
                                ›
                            </span>
                            <span className="font-semibold text-alloy-midnight/70">Programs</span>
                        </li>
                        {landing ?
                            <>
                                <li>
                                    <strong className="font-semibold text-alloy-midnight">
                                        {landing.summary.activePrograms}
                                    </strong>{" "}
                                    Active
                                </li>
                                <li>
                                    <strong className="font-semibold text-alloy-midnight">
                                        {landing.summary.averageReadinessPercent}%
                                    </strong>{" "}
                                    Average readiness
                                </li>
                                <li>
                                    <strong className="font-semibold text-alloy-midnight">
                                        {landing.summary.attentionPrograms}
                                    </strong>{" "}
                                    Need attention
                                </li>
                            </>
                        :   null}
                    </ul>
                    <div
                        className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-alloy-midnight/40"
                        data-testid="programs-sibling-chapters"
                    >
                        <span className="font-semibold uppercase tracking-[0.08em]">Related</span>
                        {PROGRAMS_WORKSPACE_SIBLING_CHAPTERS.map((chapter) => (
                            <Link
                                key={chapter.id}
                                href={chapter.href}
                                className="hover:text-alloy-midnight/65 hover:underline"
                                data-testid={`programs-sibling-${chapter.id}`}
                            >
                                {chapter.label}
                            </Link>
                        ))}
                    </div>
                </ConfigurationContext>

                <ConfigurationShell testId="programs-configuration-shell">
                    {loadIssue && !landing ?
                        <div
                            className="mx-auto max-w-xl rounded-xl border border-alloy-forge/10 bg-white px-5 py-6 shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
                            data-testid="programs-unavailable-state"
                            data-issue-code={loadIssue.code}
                        >
                            <p className="text-base font-semibold text-alloy-midnight">{loadIssue.title}</p>
                            <p className="mt-1.5 text-sm text-alloy-midnight/65">{loadIssue.message}</p>
                            <p className="mt-1 text-xs text-alloy-midnight/50">{loadIssue.nextStep}</p>
                            {loadIssue.reference ?
                                <p className="mt-3 text-[11px] text-alloy-midnight/40">
                                    Engineering reference · {loadIssue.reference}
                                </p>
                            :   null}
                            <ConfigurationSecondaryButton
                                className="mt-4"
                                onClick={() => void reload({ force: true })}
                                data-testid="programs-unavailable-retry"
                            >
                                Retry
                            </ConfigurationSecondaryButton>
                        </div>
                    : landing ?
                        <>
                            {loadIssue ?
                                <div
                                    className="mb-3 rounded-lg border border-alloy-forge/15 bg-alloy-sand/40 px-3 py-2 text-sm text-alloy-midnight/75"
                                    data-testid="programs-landing-soft-error"
                                    data-issue-code={loadIssue.code}
                                >
                                    <p className="font-medium text-alloy-midnight">{loadIssue.title}</p>
                                    <p className="mt-0.5 text-xs text-alloy-midnight/60">{loadIssue.message}</p>
                                    <ConfigurationSecondaryButton
                                        className="mt-2"
                                        onClick={() => void reload({ force: true })}
                                        data-testid="programs-landing-soft-error-retry"
                                    >
                                        Retry
                                    </ConfigurationSecondaryButton>
                                </div>
                            :   null}
                            <ProgramsLanding
                                landing={landing}
                                showRetired={showRetired}
                                onShowRetiredChange={setShowRetired}
                                search={landingSearch}
                                onSearchChange={setLandingSearch}
                                onOpenProgram={(programId, section) =>
                                    selectProgram(programId, section ?? "overview")
                                }
                                onAddProgram={() => setCreateOpen(true)}
                            />
                        </>
                    :   null}
                </ConfigurationShell>

                {createOpen ?
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/30 p-4">
                        <div
                            className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-4 shadow-lg"
                            data-testid="programs-create-dialog"
                        >
                            <p className="text-sm font-semibold text-alloy-midnight">Add Program</p>
                            <label className="mt-3 block text-xs font-medium text-alloy-midnight/70">
                                Name
                                <input
                                    className="mt-1 w-full rounded border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                    value={createName}
                                    onChange={(event) => setCreateName(event.target.value)}
                                    data-testid="programs-create-name"
                                />
                            </label>
                            <label className="mt-3 block text-xs font-medium text-alloy-midnight/70">
                                Key
                                <input
                                    className="mt-1 w-full rounded border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                    value={createKey}
                                    onChange={(event) => setCreateKey(event.target.value)}
                                    data-testid="programs-create-key"
                                />
                            </label>
                            <div className="mt-4 flex justify-end gap-2">
                                <ConfigurationSecondaryButton onClick={() => setCreateOpen(false)}>
                                    Cancel
                                </ConfigurationSecondaryButton>
                                <ConfigurationPrimaryButton
                                    disabled={!createName.trim() || !createKey.trim() || working === "create"}
                                    onClick={() =>
                                        void run("create", async () => {
                                            const result = await postAction({
                                                action: "create",
                                                label: createName.trim(),
                                                key: createKey.trim(),
                                            });
                                            const createdId =
                                                typeof result.programId === "string" ? result.programId : null;
                                            setCreateOpen(false);
                                            setCreateName("");
                                            setCreateKey("");
                                            if (createdId) selectProgram(createdId, "overview");
                                        })
                                    }
                                    data-testid="programs-create-submit"
                                >
                                    Create
                                </ConfigurationPrimaryButton>
                            </div>
                        </div>
                    </div>
                :   null}
            </div>
        );
    }

    const activeRevision: ProgramRevision | null =
        selectedProgram?.latestPublication
            ? selectedProgram.revisions.find(
                  (revision) => revision.id === selectedProgram.latestPublication?.revision.id,
              ) ?? null
            : null;
    const visibleDefinition: ProgramDraft | ProgramRevision | null =
        activeRevision ?? selectedProgram?.draft ?? null;
    const tabs: ConfigDetailTab<ProgramConfigurationSection>[] =
        viewModel
            ? visibleConfigurationObjectConcerns(objectDescriptor.concerns)
                  .filter((concern) => concern.key !== "definition")
                  .map((concern) => {
                      const key = concern.key as ProgramConfigurationSection;
                      const attentionCount =
                          key === "publication"
                              ? viewModel.runtime.attention.filter((item) =>
                                    item.section === "distribution" || item.section === "publication",
                                ).length
                          : key === "assignment"
                            ? viewModel.runtime.attention.filter((item) => item.section === "assignment").length
                          : key === "availability"
                            ? viewModel.runtime.attention.filter((item) => item.section === "assignment").length
                          : 0;
                      return {
                          key,
                          label: concern.label,
                          attentionCount: attentionCount > 0 ? attentionCount : undefined,
                      };
                  })
            : [];
    const revisionLabelByPublicationId = new Map(
        selectedProgram?.publications.map((publication) => [
            publication.id,
            `Revision ${publication.revision.number}`,
        ]) ?? [],
    );
    const locationLabelById = new Map(
        snapshot?.locations.map((location) => [location.id, location.label]) ?? [],
    );
    const activeAssignmentLocationIds = new Set(
        viewModel?.assignments
            .filter((assignment) => assignment.revisionId === selectedProgram?.latestPublication?.revision.id)
            .map((assignment) => assignment.locationId) ?? [],
    );

    return (
        <div
            className="config-runtime-shell process-config-page min-h-0 flex-1"
            data-testid="programs-publication-runtime"
        >
            <ConfigurationCommandRailActions actions={railActions} testIdPrefix="programs-rail" />

            <ConfigurationContext
                title="Programs"
                subtitle="Manage reusable Organization service definitions and how they connect to Locations."
                testId="programs-configuration-context"
                actions={
                    canManage ?
                        <ConfigurationPrimaryButton
                        className="xl:hidden"
                        onClick={() => setCreateOpen(true)}
                        data-testid="programs-mobile-add"
                    >
                        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                        Add Program
                        </ConfigurationPrimaryButton>
                    :   undefined
                }
            >
                <div className="flex flex-wrap items-center gap-1.5 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/45">
                    <Link href="/organization" className="font-medium hover:text-alloy-bend-pine">
                        Organization
                    </Link>
                    <span aria-hidden>›</span>
                    <Link
                        href="/organization/programs-locations"
                        className="font-medium hover:text-alloy-bend-pine"
                        data-testid="programs-breadcrumb-programs-locations"
                    >
                        Programs & Locations
                    </Link>
                    <span aria-hidden>›</span>
                    <span className="font-semibold text-alloy-midnight/65">Programs</span>
                    {snapshot ?
                        <span className="ml-auto">
                            {snapshot.programs.length} Programs · {snapshot.programs.filter((program) => program.latestPublication).length} published
                        </span>
                    :   null}
                </div>
                <div
                    className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-alloy-stone/15 pt-2"
                    data-testid="programs-sibling-chapters"
                >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                        Workspace chapters
                    </span>
                    {PROGRAMS_WORKSPACE_SIBLING_CHAPTERS.map((chapter) => (
                        <Link
                            key={chapter.id}
                            href={chapter.href}
                            className="text-[11px] font-medium text-alloy-midnight/50 underline-offset-2 hover:text-alloy-bend-pine hover:underline"
                            data-testid={`programs-sibling-${chapter.id}`}
                        >
                            {chapter.label}
                        </Link>
                    ))}
                </div>
            </ConfigurationContext>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <ConfigurationShell testId="programs-configuration-shell">
                <ConfigurationObjectWorkspace
                    collectionTitle="Programs"
                    collectionDescription="Reusable services the Organization can publish and assign to Locations."
                    objectLabel="Program"
                    items={collectionItems}
                    selectedId={selectedProgramId}
                    canAdd={canManage}
                    onAdd={() => setCreateOpen(true)}
                    onSelect={(programId) => selectProgram(programId, "overview")}
                    addLabel="Add Program"
                    identity={
                        selectedProgram
                            ? {
                                  domainId: "programs",
                                  objectId: selectedProgram.id,
                                  objectType: "Program",
                                  displayName: selectedProgram.draft.label,
                                  secondaryIdentity: selectedProgram.key,
                                  lifecycleStatus:
                                      selectedProgram.lifecycleStatus === "active" ? "active" : "retired",
                                  ownershipScopeLabel: "Organization",
                                  versionLabel:
                                      viewModel?.runtime.publication.activeRevisionLabel ?? null,
                              }
                            : null
                    }
                    headerStatus={{
                        label: selectedProgram?.lifecycleStatus === "active" ? "Active" : "Retired",
                        tone: selectedProgram?.lifecycleStatus === "active" ? "active" : "inactive",
                    }}
                    headerBreadcrumb={
                        selectedProgram ?
                            <nav
                                className="flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-midnight/45"
                                aria-label="Program ownership"
                            >
                                <button
                                    type="button"
                                    className="font-medium underline-offset-2 hover:text-alloy-midnight/70 hover:underline"
                                    onClick={() => selectProgram(null)}
                                    data-testid="programs-breadcrumb-collection"
                                >
                                    Programs
                                </button>
                                <span aria-hidden="true">›</span>
                                <span className="font-semibold text-alloy-midnight/65">
                                    {selectedProgram.draft.label}
                                </span>
                            </nav>
                        :   undefined
                    }
                    headerFacts={
                        selectedProgram
                            ? [
                                  `Key · ${selectedProgram.key}`,
                                  selectedProgram.draft.category ?? "Category not set",
                                  audienceLabel(selectedProgram.draft),
                                  viewModel?.runtime.publication.activeRevisionLabel ?? "Not published",
                              ]
                            : undefined
                    }
                    headerActions={
                        canManage && selectedProgram && activeSection !== "definition" ?
                            <ConfigurationSecondaryButton
                                onClick={() => navigateSection("definition")}
                                data-testid="program-edit-draft"
                            >
                                Edit Program
                            </ConfigurationSecondaryButton>
                        :   undefined
                    }
                    concernTabs={tabs}
                    activeConcern={activeSection === "definition" ? "overview" : activeSection}
                    onConcernChange={(concern) =>
                        navigateSection(normalizeProgramConfigurationSection(concern))
                    }
                    emptyDetail={
                        <ConfigurationEmptyState
                            title={
                                loadIssue ? "Programs are not ready in this environment"
                                : canManage ? "Select or create a Program"
                                : "No Programs have been created"
                            }
                            description="Programs are reusable service definitions owned by the Organization, such as Preschool, After-school care, or Summer camp."
                            purpose="Define a service once, publish an immutable revision, then assign that revision to Locations. Each Location still owns local availability, resources, evidence, and schedule."
                            examples={["Preschool", "After-school care", "Summer camp"]}
                            setupSteps={[
                                {
                                    label: "Create a working draft",
                                    description: "Describe the reusable service and its Organization-owned requirements.",
                                },
                                {
                                    label: "Publish a revision",
                                    description: "Make an immutable version available for Location assignment.",
                                },
                                {
                                    label: "Assign to Locations",
                                    description: "Choose which Locations may consume the published revision.",
                                },
                            ]}
                            issue={loadIssue}
                            actions={
                                canManage && !loadIssue ?
                                    <ConfigurationPrimaryButton onClick={() => setCreateOpen(true)}>
                                        Add Program
                                    </ConfigurationPrimaryButton>
                                :   undefined
                            }
                            testId="programs-empty-state"
                        />
                    }
                    testId="programs-object-workspace"
                >
                    {!selectedProgram || !form || !snapshot || !viewModel || !visibleDefinition ?
                        null
                    : activeSection === "overview" || activeSection === "definition" ?
                        <>
                            {activeSection === "overview" ?
                                <ProgramOverviewSurface
                                    program={selectedProgram}
                                    snapshot={snapshot}
                                    viewModel={viewModel}
                                    onOpenSection={navigateSection}
                                />
                            :   null}
                            {activeSection === "definition" ?
                                <div className="space-y-4 pb-2" data-testid="program-draft-runtime">
                                    <ConfigWorkspaceCard
                                        title="Active revision"
                                        description="Immutable configuration currently available to assigned Locations."
                                        compact
                                        testId="program-active-revision"
                                    >
                                        {activeRevision ?
                                            <ProgramDefinitionSummary
                                                definition={activeRevision}
                                                label={`Revision ${activeRevision.revisionNumber} · published ${new Date(activeRevision.publishedAt).toLocaleString()}`}
                                                testId="program-active-revision-definition"
                                            />
                                        :   <p className="py-4 text-sm text-alloy-midnight/50">
                                                Nothing has been published yet.
                                            </p>
                                        }
                                    </ConfigWorkspaceCard>

                                    <ConfigWorkspaceCard
                                        title="Working draft"
                                        description={
                                            viewModel.runtime.publication.hasUnpublishedChanges
                                                ? "Changes remain private to Organization until published."
                                                : "This draft matches the active published revision."
                                        }
                                        compact
                                        testId="program-working-draft"
                                    >
                                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-3 py-2">
                                            <div>
                                                <p className="text-xs font-semibold text-alloy-midnight">
                                                    {viewModel.runtime.publication.draftLabel}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                                    {viewModel.runtime.publication.activeRevisionLabel} remains active.
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-alloy-stone/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                                {selectedProgram.draft.status}
                                            </span>
                                        </div>
                                        <ConfigurationObjectEditGate
                                            session={editSession}
                                            testId="program-definition-edit-gate"
                                            editLabel="Edit working draft"
                                            onBeginEdit={() => {
                                                if (!form) return;
                                                setEditSession(beginConfigurationObjectEdit(editSession, form));
                                            }}
                                            onCancel={() => {
                                                setForm(selectedProgram ? formFor(selectedProgram) : null);
                                                setEditSession(cancelConfigurationObjectEdit(editSession));
                                            }}
                                            onSave={() => {
                                                if (!form || !editSession.draft) return;
                                                const draft = editSession.draft;
                                                setEditSession(markConfigurationObjectSaving(editSession, true));
                                                void run(
                                                    "save",
                                                    () =>
                                                        postAction({
                                                            action: "update_draft",
                                                            programId: selectedProgram.id,
                                                            patch: {
                                                                label: draft.label,
                                                                description: draft.description.trim() || null,
                                                                category: draft.category.trim() || null,
                                                                required_resource_type:
                                                                    draft.requiredResourceType.trim() || null,
                                                                audience: {
                                                                    minimumAge: optionalNumber(draft.minimumAge),
                                                                    maximumAge: optionalNumber(draft.maximumAge),
                                                                },
                                                                qualification_requirements: draft.qualificationRequirements
                                                                    .split("\n")
                                                                    .map((value) => value.trim())
                                                                    .filter(Boolean),
                                                            },
                                                        }),
                                                    {
                                                        afterSuccess: () => {
                                                            setForm(draft);
                                                            setEditSession(completeConfigurationObjectSave(editSession));
                                                            if (orgId) {
                                                                invalidateProgramsCollection(orgId, "program-draft-saved");
                                                                publishConfigurationInvalidation(
                                                                    "programs",
                                                                    "program-draft-saved",
                                                                );
                                                            }
                                                        },
                                                    },
                                                ).then(() => {
                                                    /* run() clears working; salvage edit session on failure via error banner */
                                                });
                                            }}
                                            readContent={
                                                <ProgramDefinitionSummary
                                                    definition={{
                                                        ...selectedProgram.draft,
                                                        label: form.label,
                                                        description: form.description || null,
                                                        category: form.category || null,
                                                        requiredResourceType: form.requiredResourceType || null,
                                                        audience: {
                                                            minimumAge: optionalNumber(form.minimumAge),
                                                            maximumAge: optionalNumber(form.maximumAge),
                                                        },
                                                        qualificationRequirements: form.qualificationRequirements
                                                            .split("\n")
                                                            .map((value) => value.trim())
                                                            .filter(Boolean),
                                                    }}
                                                    label="Current working draft"
                                                    testId="program-draft-read-summary"
                                                />
                                            }
                                            editContent={
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <label>
                                                        <span className="config-typo-field-label">Name · Organization locked</span>
                                                        <input
                                                            value={editSession.draft?.label ?? form.label}
                                                            onChange={(event) => {
                                                                const next = {
                                                                    ...(editSession.draft ?? form),
                                                                    label: event.target.value,
                                                                };
                                                                setForm(next);
                                                                setEditSession(patchConfigurationObjectDraft(editSession, next));
                                                            }}
                                                            className="config-runtime-input mt-1"
                                                            data-testid="program-draft-label"
                                                            disabled={!canManage}
                                                        />
                                                    </label>
                                                    <label>
                                                        <span className="config-typo-field-label">Category · Organization locked</span>
                                                        <input
                                                            value={editSession.draft?.category ?? form.category}
                                                            onChange={(event) => {
                                                                const next = {
                                                                    ...(editSession.draft ?? form),
                                                                    category: event.target.value,
                                                                };
                                                                setForm(next);
                                                                setEditSession(patchConfigurationObjectDraft(editSession, next));
                                                            }}
                                                            className="config-runtime-input mt-1"
                                                            disabled={!canManage}
                                                        />
                                                    </label>
                                                    <label className="sm:col-span-2">
                                                        <span className="config-typo-field-label">Description · Location may override</span>
                                                        <textarea
                                                            value={editSession.draft?.description ?? form.description}
                                                            onChange={(event) => {
                                                                const next = {
                                                                    ...(editSession.draft ?? form),
                                                                    description: event.target.value,
                                                                };
                                                                setForm(next);
                                                                setEditSession(patchConfigurationObjectDraft(editSession, next));
                                                            }}
                                                            className="config-runtime-input mt-1 min-h-20"
                                                            disabled={!canManage}
                                                        />
                                                    </label>
                                                    <label>
                                                        <span className="config-typo-field-label">Minimum audience age</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={editSession.draft?.minimumAge ?? form.minimumAge}
                                                            onChange={(event) => {
                                                                const next = {
                                                                    ...(editSession.draft ?? form),
                                                                    minimumAge: event.target.value,
                                                                };
                                                                setForm(next);
                                                                setEditSession(patchConfigurationObjectDraft(editSession, next));
                                                            }}
                                                            className="config-runtime-input mt-1"
                                                            disabled={!canManage}
                                                        />
                                                    </label>
                                                    <label>
                                                        <span className="config-typo-field-label">Maximum audience age</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={editSession.draft?.maximumAge ?? form.maximumAge}
                                                            onChange={(event) => {
                                                                const next = {
                                                                    ...(editSession.draft ?? form),
                                                                    maximumAge: event.target.value,
                                                                };
                                                                setForm(next);
                                                                setEditSession(patchConfigurationObjectDraft(editSession, next));
                                                            }}
                                                            className="config-runtime-input mt-1"
                                                            disabled={!canManage}
                                                        />
                                                    </label>
                                                    <label>
                                                        <span className="config-typo-field-label">Required resource type</span>
                                                        <input
                                                            value={
                                                                editSession.draft?.requiredResourceType
                                                                ?? form.requiredResourceType
                                                            }
                                                            onChange={(event) => {
                                                                const next = {
                                                                    ...(editSession.draft ?? form),
                                                                    requiredResourceType: event.target.value,
                                                                };
                                                                setForm(next);
                                                                setEditSession(patchConfigurationObjectDraft(editSession, next));
                                                            }}
                                                            className="config-runtime-input mt-1"
                                                            disabled={!canManage}
                                                        />
                                                    </label>
                                                    <label>
                                                        <span className="config-typo-field-label">Qualification requirements</span>
                                                        <textarea
                                                            value={
                                                                editSession.draft?.qualificationRequirements
                                                                ?? form.qualificationRequirements
                                                            }
                                                            onChange={(event) => {
                                                                const next = {
                                                                    ...(editSession.draft ?? form),
                                                                    qualificationRequirements: event.target.value,
                                                                };
                                                                setForm(next);
                                                                setEditSession(patchConfigurationObjectDraft(editSession, next));
                                                            }}
                                                            placeholder="One requirement per line"
                                                            className="config-runtime-input mt-1 min-h-20"
                                                            disabled={!canManage}
                                                        />
                                                    </label>
                                                </div>
                                            }
                                        />
                                        {selectedProgram.draft.validationErrors.length > 0 ?
                                            <ul className="mt-3 list-disc pl-5 text-sm text-red-700">
                                                {selectedProgram.draft.validationErrors.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        :   null}
                                        {canManage ?
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <ConfigurationSecondaryButton
                                                    disabled={
                                                        working != null
                                                        || !viewModel.runtime.publication.hasUnpublishedChanges
                                                    }
                                                    data-testid="program-validate-draft"
                                                    onClick={() =>
                                                        void run("validate", () =>
                                                            postAction({
                                                                action: "validate_draft",
                                                                programId: selectedProgram.id,
                                                            }),
                                                        )
                                                    }
                                                >
                                                    {working === "validate" ? "Validating…" : "Validate draft"}
                                                </ConfigurationSecondaryButton>
                                                <ConfigurationSecondaryButton
                                                    disabled={!viewModel.runtime.publication.canPublish || working != null}
                                                    data-testid="program-publish"
                                                    onClick={() =>
                                                        void run(
                                                            "publish",
                                                            () =>
                                                                postAction({
                                                                    action: "publish",
                                                                    programId: selectedProgram.id,
                                                                }),
                                                            {
                                                                afterSuccess: () => {
                                                                    if (orgId) {
                                                                        invalidateProgramsCollection(
                                                                            orgId,
                                                                            "program-published",
                                                                        );
                                                                    }
                                                                    navigateSection("overview");
                                                                },
                                                            },
                                                        )
                                                    }
                                                >
                                                    {working === "publish" ? "Publishing…" : "Publish immutable revision"}
                                                </ConfigurationSecondaryButton>
                                            </div>
                                        :   null}
                                    </ConfigWorkspaceCard>
                                </div>
                            :   null}
                        </>
                    : activeSection === "availability" ?
                                    <ProgramAvailabilitySection program={selectedProgram} snapshot={snapshot} />
                                : activeSection === "offerings" ?
                                    <ProgramOfferingsSection
                                        program={selectedProgram}
                                        snapshot={snapshot}
                                        canManage={canManage}
                                        onReload={reload}
                                        onError={setError}
                                    />
                                : activeSection === "pricing" ?
                                    <ProgramPricingSection
                                        program={selectedProgram}
                                        snapshot={snapshot}
                                        canManage={canManage}
                                        onReload={reload}
                                    />
                                : activeSection === "policies" ?
                                    <ProgramPoliciesSection
                                        program={selectedProgram}
                                        snapshot={snapshot}
                                        canManage={canManage}
                                    />
                                : activeSection === "relationships" ?
                                    <ProgramRelationshipsSection
                                        program={selectedProgram}
                                        snapshot={snapshot}
                                    />
                                : activeSection === "publication" ?
                                    <div className="space-y-4" data-testid="program-publication-runtime">
                                        <ConfigWorkspaceCard
                                            title="Publication"
                                            description="Publication creates an immutable revision. It does not distribute to Locations."
                                        >
                                            <div className="grid gap-3 sm:grid-cols-3">
                                                <div className="config-runtime-object-cell">
                                                    <p className="config-typo-field-label">Active revision</p>
                                                    <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                                                        {viewModel.runtime.publication.activeRevisionLabel}
                                                    </p>
                                                </div>
                                                <div className="config-runtime-object-cell">
                                                    <p className="config-typo-field-label">Working draft</p>
                                                    <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                                                        {viewModel.runtime.publication.draftLabel}
                                                    </p>
                                                </div>
                                                <div className="config-runtime-object-cell">
                                                    <p className="config-typo-field-label">Published revisions</p>
                                                    <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                                                        {selectedProgram.revisions.length}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <ConfigurationSecondaryButton onClick={() => navigateSection("definition")}>
                                                    Review working draft
                                                </ConfigurationSecondaryButton>
                                                <ConfigurationSecondaryButton onClick={() => navigateSection("assignment")}>
                                                    Add to Locations
                                                </ConfigurationSecondaryButton>
                                            </div>
                                        </ConfigWorkspaceCard>
                                        {selectedProgram.revisions.length > 0 ?
                                            <ConfigWorkspaceCard
                                                title="Immutable revisions"
                                                description="Published revisions are never overwritten."
                                                compact
                                            >
                                                <ul className="divide-y divide-alloy-stone/20">
                                                    {selectedProgram.revisions
                                                        .slice()
                                                        .sort((a, b) => b.revisionNumber - a.revisionNumber)
                                                        .map((revision) => (
                                                            <li
                                                                key={revision.id}
                                                                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                                                            >
                                                                <span className="font-semibold text-alloy-midnight">
                                                                    Revision {revision.revisionNumber}
                                                                </span>
                                                                <span className="text-[11px] text-alloy-midnight/45">
                                                                    {new Date(revision.publishedAt).toLocaleString()}
                                                                </span>
                                                            </li>
                                                        ))}
                                                </ul>
                                            </ConfigWorkspaceCard>
                                        :   null}
                                    </div>
                                : activeSection === "assignment" ?
                                    <div className="space-y-4" data-testid="program-distribution-concern">
                                        {selectedProgram && canManage ?
                                            <ProgramLocationAvailabilityFlow
                                                entry={{
                                                    direction: "organization_program",
                                                    programId: selectedProgram.id,
                                                    programLabel:
                                                        selectedProgram.draft?.label
                                                        ?? selectedProgram.key,
                                                    publicationReady: Boolean(selectedProgram.latestPublication),
                                                    publicationId: selectedProgram.latestPublication?.id ?? null,
                                                    lifecycleStatus: selectedProgram.lifecycleStatus,
                                                    currentLocationCount: activeAssignmentLocationIds.size,
                                                }}
                                                locations={snapshot?.locations ?? []}
                                                onCancel={() => navigateSection("overview")}
                                                onDone={async () => {
                                                    if (orgId) {
                                                        invalidateProgramsCollection(orgId, "program-make-available");
                                                        publishConfigurationInvalidation(
                                                            "locations",
                                                            "program-make-available",
                                                        );
                                                    }
                                                    await reload({ force: true });
                                                    navigateSection("assignment");
                                                }}
                                            />
                                        : selectedProgram ?
                                            <p className="text-sm text-alloy-midnight/55">
                                                You can review Location availability. Managing availability requires Program configuration permission.
                                            </p>
                                        :   null}
                                        {selectedProgram && canManage ?
                                            <div className="rounded-lg border border-alloy-forge/10 bg-white px-3 py-3">
                                                <p className="text-sm font-semibold text-alloy-midnight">
                                                    Edit Organization definition
                                                </p>
                                                <p className="mt-1 text-[11px] text-alloy-midnight/55">
                                                    Organization-owned fields are edited on the Program definition — not mixed with Location configuration.
                                                </p>
                                                <div className="mt-2">
                                                    <ConfigurationSecondaryButton
                                                        onClick={() => navigateSection("definition")}
                                                        data-testid="programs-edit-organization-definition"
                                                    >
                                                        Edit Organization definition
                                                    </ConfigurationSecondaryButton>
                                                </div>
                                            </div>
                                        :   null}
                                        <ConfigDistributionRuntime
                                            runs={viewModel.runs}
                                            revisionLabelByPublicationId={revisionLabelByPublicationId}
                                            locationLabelById={locationLabelById}
                                            retryingRunId={
                                                working?.startsWith("retry:") ? working.slice("retry:".length) : null
                                            }
                                            onRetry={
                                                canManage ?
                                                    (runId) =>
                                                        void run(`retry:${runId}`, () =>
                                                            postAction({ action: "retry", runId }),
                                                        )
                                                :   undefined
                                            }
                                            testId="program-distribution-runtime"
                                        />
                                    </div>
                                : activeSection === "history" ?
                                    <ConfigHistoryTimeline
                                        entries={viewModel.history}
                                        onAction={
                                            canManage ?
                                                (entry) => {
                                                    if (!entry.id.startsWith("run:")) return;
                                                    const runId = entry.id.slice("run:".length);
                                                    void run(`retry:${runId}`, () =>
                                                        postAction({ action: "retry", runId }),
                                                    );
                                                }
                                            :   undefined
                                        }
                                        testId="program-history-runtime"
                                    />
                                :   null}
                </ConfigurationObjectWorkspace>
            </ConfigurationShell>

            {createOpen && canManage ?
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="program-create-title"
                    data-testid="program-create-dialog"
                >
                    <div className="w-full max-w-lg rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <h2 id="program-create-title" className="text-lg font-semibold text-alloy-midnight">
                            Add Program
                        </h2>
                        <p className="mt-1 text-sm text-alloy-midnight/50">
                            Create an Organization-owned working draft. Locations will not see it until publication and assignment.
                        </p>
                        <div className="mt-4 grid gap-3">
                            <label>
                                <span className="config-typo-field-label">Program name</span>
                                <input
                                    value={createName}
                                    onChange={(event) => setCreateName(event.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="program-create-name"
                                    autoFocus
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Stable key</span>
                                <input
                                    value={createKey}
                                    onChange={(event) => setCreateKey(event.target.value)}
                                    placeholder="preschool"
                                    className="config-runtime-input mt-1 font-mono"
                                    data-testid="program-create-key"
                                />
                            </label>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton onClick={() => setCreateOpen(false)}>
                                Cancel
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                disabled={!createName.trim() || !createKey.trim() || working != null}
                                data-testid="program-create-submit"
                                onClick={() =>
                                    void run(
                                        "create",
                                        async () => {
                                            const result = await postAction({
                                                action: "create_draft",
                                                label: createName,
                                                key: createKey,
                                            });
                                            const newId = String(result.programId ?? "").trim();
                                            setCreateName("");
                                            setCreateKey("");
                                            setCreateOpen(false);
                                            if (orgId) {
                                                invalidateProgramsCollection(orgId, "program-created", {
                                                    publishBus: true,
                                                });
                                            }
                                            if (newId) {
                                                selectProgram(newId, "definition");
                                            }
                                        },
                                        { reload: true },
                                    )
                                }
                            >
                                {working === "create" ? "Creating…" : "Create working draft"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                </div>
            :   null}
        </div>
    );
}
