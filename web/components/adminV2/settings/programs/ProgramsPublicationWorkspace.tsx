"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    ConfigAssignmentRuntime,
    ConfigCollectionRail,
    ConfigConsequenceLine,
    ConfigDetailRuntime,
    ConfigDistributionRuntime,
    ConfigHistoryTimeline,
    ConfigObjectHeader,
    ConfigPublicationOverview,
    ConfigWorkspaceCard,
    type ConfigDetailTab,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    ConfigurationCommandRailActions,
    type ConfigurationRailAction,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationCommandRailActions";
import { organizationProgramsHref } from "@/lib/admin/canonicalAdminRoutes";
import type { ConfigurationTargetPreview } from "@/lib/configPublication/types";
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

export default function ProgramsPublicationWorkspace(props: {
    initialProgramId?: string | null;
    initialSection?: ConfigurationDetailSection;
}) {
    const router = useRouter();
    const [snapshot, setSnapshot] = useState<ProgramPublicationSnapshot | null>(null);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
        props.initialProgramId?.trim() || null,
    );
    const [activeSection, setActiveSection] = useState<ConfigurationDetailSection>(
        props.initialSection ?? "overview",
    );
    const [form, setForm] = useState<DraftForm | null>(null);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
    const [preview, setPreview] = useState<ConfigurationTargetPreview[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadIssue, setLoadIssue] = useState<ConfigurationRuntimeIssue | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createKey, setCreateKey] = useState("");

    const selectProgram = useCallback((programId: string | null) => {
        setSelectedProgramId(programId);
        setActiveSection("overview");
    }, []);

    const reload = useCallback(async () => {
        const response = await fetch(ENDPOINT, { credentials: "include" });
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            setLoadIssue(readConfigurationRuntimeIssue(payload.error, "Programs"));
            setSnapshot(null);
            setSelectedProgramId(null);
            return;
        }
        const json = payload as ProgramPublicationSnapshot;
        setLoadIssue(null);
        setSnapshot(json);
        setSelectedProgramId((current) => {
            if (current && json.programs.some((program) => program.id === current)) return current;
            const preferred = props.initialProgramId?.trim() || null;
            if (preferred && json.programs.some((program) => program.id === preferred)) return preferred;
            return json.programs[0]?.id ?? null;
        });
    }, [props.initialProgramId]);

    useEffect(() => {
        void reload()
            .catch((nextError) => {
                setLoadIssue(readConfigurationRuntimeIssue(nextError, "Programs"));
                setSnapshot(null);
            })
            .finally(() => setLoading(false));
    }, [reload]);

    useEffect(() => {
        if (loading) return;
        router.replace(organizationProgramsHref(selectedProgramId, activeSection), { scroll: false });
    }, [activeSection, loading, router, selectedProgramId]);

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
    const canManage = snapshot?.capabilities.canManage ?? false;

    useEffect(() => {
        setForm(selectedProgram ? formFor(selectedProgram) : null);
        setPreview(null);
        setSelectedLocationIds([]);
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
                onClick: () => setActiveSection(item.section),
            }));
        if (canManage && viewModel.runtime.publication.canPublish) {
            actions.push({
                id: "publish-configuration-draft",
                label: "Publish working draft",
                reason: `${viewModel.runtime.publication.activeRevisionLabel} remains active until publication.`,
                group: "next",
                onClick: () => setActiveSection("draft"),
            });
        } else if (canManage && viewModel.runtime.publication.hasUnpublishedChanges) {
            actions.push({
                id: "review-configuration-draft",
                label: "Review working draft",
                reason: "Validate the draft before publishing.",
                group: "next",
                onClick: () => setActiveSection("draft"),
            });
        }
        if (canManage) {
            actions.push({
                id: "edit-configuration-draft",
                label: "Edit working draft",
                group: "manage",
                onClick: () => setActiveSection("draft"),
            }, {
                id: "manage-configuration-assignment",
                label: "Manage assignments",
                group: "manage",
                onClick: () => setActiveSection("assignment"),
            });
        }
        actions.push({
            id: "review-configuration-history",
            label: "Review history",
            group: "more",
            onClick: () => setActiveSection("history"),
        });
        return actions;
    }, [canManage, selectedProgram, viewModel]);

    if (loading) {
        return <p className="p-6 text-sm text-alloy-midnight/55">Loading Programs…</p>;
    }

    const activeRevision: ProgramRevision | null =
        selectedProgram?.latestPublication
            ? selectedProgram.revisions.find(
                  (revision) => revision.id === selectedProgram.latestPublication?.revision.id,
              ) ?? null
            : null;
    const visibleDefinition: ProgramDraft | ProgramRevision | null =
        activeRevision ?? selectedProgram?.draft ?? null;
    const tabs: ConfigDetailTab[] =
        viewModel
            ? [
                  { key: "overview", label: "Overview" },
                  {
                      key: "draft",
                      label: "Working draft",
                      attentionCount: viewModel.runtime.attention.filter((item) => item.section === "draft").length,
                  },
                  {
                      key: "assignment",
                      label: "Assignments",
                      attentionCount: viewModel.runtime.attention.filter((item) => item.section === "assignment").length,
                  },
                  {
                      key: "distribution",
                      label: "Distribution",
                      attentionCount: viewModel.runtime.attention.filter((item) => item.section === "distribution").length,
                  },
                  { key: "history", label: "History" },
              ]
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
    const availableAssignmentLocations =
        snapshot?.locations.filter((location) => !activeAssignmentLocationIds.has(location.id)) ?? [];

    return (
        <div
            className="config-runtime-shell process-config-page min-h-0 flex-1"
            data-testid="programs-publication-runtime"
        >
            <ConfigurationCommandRailActions actions={railActions} testIdPrefix="programs-rail" />

            <ConfigurationContext
                title="Programs"
                subtitle="Create reusable Organization service definitions, publish revisions, and assign them to Locations."
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
                    <span className="font-semibold text-alloy-midnight/65">Programs</span>
                    {snapshot ?
                        <span className="ml-auto">
                            {snapshot.programs.length} Programs · {snapshot.programs.filter((program) => program.latestPublication).length} published
                        </span>
                    :   null}
                </div>
            </ConfigurationContext>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <ConfigurationShell testId="programs-configuration-shell">
                <div
                    className={`grid items-start gap-4 pb-4 ${
                        selectedProgram ? "xl:grid-cols-[20.5rem_minmax(0,1fr)]" : ""
                    }`}
                >
                    <ConfigCollectionRail
                        title="Program collection"
                        description="Reusable services the Organization can publish and make available to Locations."
                        objectLabel="Program"
                        items={collectionItems}
                        selectedId={selectedProgramId}
                        canAdd={canManage}
                        onAdd={() => setCreateOpen(true)}
                        onSelect={selectProgram}
                        testId="programs-collection"
                    />

                    <main className="min-w-0" data-testid="programs-workspace">
                        {!selectedProgram || !form || !snapshot || !viewModel || !visibleDefinition ?
                            <ConfigurationEmptyState
                                title={
                                    loadIssue ? "Programs are not ready in this environment"
                                    : canManage ? "Create your first Program"
                                    : "No Programs have been created"
                                }
                                description="Programs are reusable service definitions owned by the Organization, such as Preschool, After-school care, or Summer camp."
                                purpose="Define a service once, publish an immutable revision, then assign that revision to the Locations that may offer it. Each Location still owns its local availability, resources, evidence, and schedule."
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
                        :   <ConfigDetailRuntime
                                header={
                                    <ConfigObjectHeader
                                        size="hero"
                                        name={selectedProgram.draft.label}
                                        status={{
                                            label: viewModel.runtime.publication.label,
                                            tone:
                                                viewModel.runtime.attention.some((item) => item.grade === "fix")
                                                    ? "attention"
                                                    : "active",
                                        }}
                                        breadcrumb={
                                            <nav
                                                className="flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-midnight/45"
                                                aria-label="Program ownership"
                                            >
                                                <Link href="/organization" className="hover:text-alloy-bend-pine">
                                                    Organization
                                                </Link>
                                                <span aria-hidden>›</span>
                                                <span>Programs</span>
                                                <span aria-hidden>›</span>
                                                <span className="font-semibold text-alloy-midnight/65">
                                                    {selectedProgram.draft.label}
                                                </span>
                                            </nav>
                                        }
                                        facts={[
                                            `Key · ${selectedProgram.key}`,
                                            viewModel.runtime.publication.activeRevisionLabel,
                                            viewModel.runtime.assignment.label,
                                        ]}
                                        actions={
                                            canManage && activeSection !== "draft" ?
                                                <ConfigurationSecondaryButton
                                                    onClick={() => setActiveSection("draft")}
                                                    data-testid="program-edit-draft"
                                                >
                                                    Edit working draft
                                                </ConfigurationSecondaryButton>
                                            :   undefined
                                        }
                                        testId="program-object-header"
                                    />
                                }
                                consequence={
                                    <ConfigConsequenceLine>
                                        Organization publishes Program identity. Locations consume an assigned revision while local offer state, evidence, resources, and schedules remain Location-owned.
                                    </ConfigConsequenceLine>
                                }
                                tabs={tabs}
                                activeSection={activeSection}
                                onSectionChange={setActiveSection}
                                testId="program-detail-runtime"
                            >
                                {activeSection === "overview" ?
                                    <ConfigPublicationOverview
                                        model={viewModel.runtime}
                                        activePublishedAt={selectedProgram.latestPublication?.publishedAt ?? null}
                                        orientation={{
                                            purpose: "This Program defines a reusable service the Organization can make available across Locations.",
                                            ownership: "The Organization owns the published definition. Each assigned Location decides whether to offer it and owns local delivery details.",
                                        }}
                                        onOpenSection={setActiveSection}
                                        domainSummary={
                                            <ProgramDefinitionSummary
                                                definition={visibleDefinition}
                                                label={
                                                    activeRevision
                                                        ? `Active Revision ${activeRevision.revisionNumber}`
                                                        : "Working draft"
                                                }
                                                testId="program-overview-definition"
                                            />
                                        }
                                        testId="program-overview"
                                    />
                                : activeSection === "draft" ?
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
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <label>
                                                    <span className="config-typo-field-label">Name · Organization locked</span>
                                                    <input
                                                        value={form.label}
                                                        onChange={(event) => setForm({ ...form, label: event.target.value })}
                                                        className="config-runtime-input mt-1"
                                                        data-testid="program-draft-label"
                                                        disabled={!canManage}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="config-typo-field-label">Category · Organization locked</span>
                                                    <input
                                                        value={form.category}
                                                        onChange={(event) => setForm({ ...form, category: event.target.value })}
                                                        className="config-runtime-input mt-1"
                                                        disabled={!canManage}
                                                    />
                                                </label>
                                                <label className="sm:col-span-2">
                                                    <span className="config-typo-field-label">Description · Location may override</span>
                                                    <textarea
                                                        value={form.description}
                                                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                                                        className="config-runtime-input mt-1 min-h-20"
                                                        disabled={!canManage}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="config-typo-field-label">Minimum audience age</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={form.minimumAge}
                                                        onChange={(event) => setForm({ ...form, minimumAge: event.target.value })}
                                                        className="config-runtime-input mt-1"
                                                        disabled={!canManage}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="config-typo-field-label">Maximum audience age</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={form.maximumAge}
                                                        onChange={(event) => setForm({ ...form, maximumAge: event.target.value })}
                                                        className="config-runtime-input mt-1"
                                                        disabled={!canManage}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="config-typo-field-label">Required resource type</span>
                                                    <input
                                                        value={form.requiredResourceType}
                                                        onChange={(event) => setForm({ ...form, requiredResourceType: event.target.value })}
                                                        className="config-runtime-input mt-1"
                                                        disabled={!canManage}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="config-typo-field-label">Qualification requirements</span>
                                                    <textarea
                                                        value={form.qualificationRequirements}
                                                        onChange={(event) => setForm({ ...form, qualificationRequirements: event.target.value })}
                                                        placeholder="One requirement per line"
                                                        className="config-runtime-input mt-1 min-h-20"
                                                        disabled={!canManage}
                                                    />
                                                </label>
                                            </div>
                                            {selectedProgram.draft.validationErrors.length > 0 ?
                                                <ul className="mt-3 list-disc pl-5 text-sm text-red-700">
                                                    {selectedProgram.draft.validationErrors.map((item) => <li key={item}>{item}</li>)}
                                                </ul>
                                            :   null}
                                            {canManage ?
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                <ConfigurationPrimaryButton
                                                    disabled={working != null}
                                                    data-testid="program-save-draft"
                                                    onClick={() =>
                                                        void run("save", () =>
                                                            postAction({
                                                                action: "update_draft",
                                                                programId: selectedProgram.id,
                                                                patch: {
                                                                    label: form.label,
                                                                    description: form.description.trim() || null,
                                                                    category: form.category.trim() || null,
                                                                    required_resource_type: form.requiredResourceType.trim() || null,
                                                                    audience: {
                                                                        minimumAge: optionalNumber(form.minimumAge),
                                                                        maximumAge: optionalNumber(form.maximumAge),
                                                                    },
                                                                    qualification_requirements: form.qualificationRequirements
                                                                        .split("\n")
                                                                        .map((value) => value.trim())
                                                                        .filter(Boolean),
                                                                },
                                                            }),
                                                        )
                                                    }
                                                >
                                                    {working === "save" ? "Saving…" : "Save working draft"}
                                                </ConfigurationPrimaryButton>
                                                <ConfigurationSecondaryButton
                                                    disabled={working != null || !viewModel.runtime.publication.hasUnpublishedChanges}
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
                                                            { afterSuccess: () => setActiveSection("overview") },
                                                        )
                                                    }
                                                >
                                                    {working === "publish" ? "Publishing…" : "Publish immutable revision"}
                                                </ConfigurationSecondaryButton>
                                                </div>
                                            :   null}
                                        </ConfigWorkspaceCard>
                                    </div>
                                : activeSection === "assignment" ?
                                    <ConfigAssignmentRuntime
                                        posture={viewModel.runtime.assignment}
                                        assignments={viewModel.assignments}
                                        activeRevisionId={selectedProgram.latestPublication?.revision.id ?? null}
                                        activeRevisionLabel={viewModel.runtime.publication.activeRevisionLabel}
                                        testId="program-assignment-runtime"
                                        workflow={
                                            !canManage ? undefined
                                            : !selectedProgram.latestPublication ?
                                                <p className="py-4 text-sm text-alloy-midnight/50">
                                                    Publish this Program before assigning it to Locations.
                                                </p>
                                            : availableAssignmentLocations.length === 0 ?
                                                <p className="py-4 text-sm text-alloy-midnight/50">
                                                    Every eligible Location is already consuming the active revision.
                                                </p>
                                            :   <>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {availableAssignmentLocations.map((location) => (
                                                            <label
                                                                key={location.id}
                                                                className="flex items-center gap-2 rounded-lg border border-alloy-stone/15 px-3 py-2 text-sm"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedLocationIds.includes(location.id)}
                                                                    onChange={(event) =>
                                                                        setSelectedLocationIds((current) =>
                                                                            event.target.checked
                                                                                ? [...current, location.id]
                                                                                : current.filter((id) => id !== location.id),
                                                                        )
                                                                    }
                                                                />
                                                                <span>{location.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <ConfigurationSecondaryButton
                                                            disabled={selectedLocationIds.length === 0 || working != null}
                                                            data-testid="program-preview-delivery"
                                                            onClick={() =>
                                                                void run(
                                                                    "preview",
                                                                    async () => {
                                                                        const result = await postAction({
                                                                            action: "preview",
                                                                            publicationId: selectedProgram.latestPublication!.id,
                                                                            targetIds: selectedLocationIds,
                                                                        });
                                                                        setPreview((result.preview as ConfigurationTargetPreview[]) ?? []);
                                                                    },
                                                                    { reload: false },
                                                                )
                                                            }
                                                        >
                                                            {working === "preview" ? "Previewing…" : "Preview impact"}
                                                        </ConfigurationSecondaryButton>
                                                        <ConfigurationPrimaryButton
                                                            disabled={!preview || preview.length === 0 || working != null}
                                                            data-testid="program-assign-delivery"
                                                            onClick={() =>
                                                                void run(
                                                                    "assign",
                                                                    async () => {
                                                                        await postAction({
                                                                            action: "assign",
                                                                            publicationId: selectedProgram.latestPublication!.id,
                                                                            targetIds: selectedLocationIds,
                                                                        });
                                                                        setPreview(null);
                                                                    },
                                                                    { afterSuccess: () => setActiveSection("overview") },
                                                                )
                                                            }
                                                        >
                                                            {working === "assign" ? "Assigning…" : "Confirm assignment"}
                                                        </ConfigurationPrimaryButton>
                                                    </div>
                                                    {preview ?
                                                        <div className="mt-4 space-y-2" data-testid="program-delivery-preview">
                                                            <p className="text-xs font-semibold text-alloy-midnight">
                                                                Impact preview · {preview.length} Locations
                                                            </p>
                                                            {preview.map((target) => (
                                                                <div
                                                                    key={target.locationId}
                                                                    className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.035] p-3"
                                                                >
                                                                    <div className="flex justify-between gap-2">
                                                                        <strong className="text-sm text-alloy-midnight">{target.locationLabel}</strong>
                                                                        <span className="text-xs text-alloy-midnight/45">
                                                                            {target.currentRevisionId === target.nextRevisionId ? "Current" : "Update ready"}
                                                                        </span>
                                                                    </div>
                                                                    <ul className="mt-2 space-y-1 text-xs text-alloy-midnight/60">
                                                                        {target.impacts.map((impact) => (
                                                                            <li key={`${impact.fieldKey}-${impact.kind}`}>{impact.message}</li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    :   null}
                                                </>
                                        }
                                    />
                                : activeSection === "distribution" ?
                                    <ConfigDistributionRuntime
                                        runs={viewModel.runs}
                                        revisionLabelByPublicationId={revisionLabelByPublicationId}
                                        locationLabelById={locationLabelById}
                                        retryingRunId={working?.startsWith("retry:") ? working.slice("retry:".length) : null}
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
                                :   <ConfigHistoryTimeline
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
                                }
                            </ConfigDetailRuntime>
                        }
                    </main>
                </div>
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
                                            setSelectedProgramId(String(result.programId ?? ""));
                                            setCreateName("");
                                            setCreateKey("");
                                            setCreateOpen(false);
                                        },
                                        { afterSuccess: () => setActiveSection("draft") },
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
