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
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import { ProgramsObjectSelector } from "@/components/adminV2/settings/programs/ProgramsObjectSelector";
import { ProgramSelectedWorkspace } from "@/components/adminV2/settings/programs/ProgramSelectedWorkspace";
import {
    ProgramCreateDialog,
    ProgramEditDialog,
    ProgramManageLocationsDialog,
} from "@/components/adminV2/settings/programs/ProgramOperatorDialogs";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { organizationProgramsHref } from "@/lib/admin/canonicalAdminRoutes";
import { CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    markConfigurationContinuity,
} from "@/lib/configRuntime/configurationContinuity";
import {
    subscribeConfigurationInvalidation,
} from "@/lib/configRuntime/configurationInvalidation";
import {
    invalidateProgramsCollection,
    loadProgramsCollection,
    peekProgramsCollection,
} from "@/lib/programs/programsCollectionCache";
import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";
import {
    associatedLocationIdsForProgram,
    buildProgramOperatorDetail,
    buildProgramsOperatorCollection,
    filterProgramOperatorRows,
    type ProgramsLifecycleFilter,
} from "@/lib/programs/programsOperatorModel";
import {
    archiveProgramOperator,
    createProgramOperator,
    deleteProgramOperator,
    restoreProgramOperator,
    saveProgramOperator,
    syncProgramLocationsOperator,
    type ProgramOperatorFields,
} from "@/lib/programs/programsOperatorClient";
import { operatorProgramError, readAudienceAge } from "@/lib/programs/programsOperatorPresentation";
import { readConfigurationRuntimeIssue } from "@/lib/configPublication/runtimeIssue";

type DialogMode =
    | null
    | { kind: "create" }
    | { kind: "edit" }
    | { kind: "manage-locations" }
    | { kind: "archive"; name: string }
    | { kind: "delete"; name: string; canDelete: boolean; reason: string | null }
    | { kind: "delete-blocked"; name: string; reason: string };

function fieldsFromSnapshot(
    snapshot: ProgramPublicationSnapshot,
    programId: string,
): ProgramOperatorFields {
    const program = snapshot.programs.find((row) => row.id === programId);
    const audience = readAudienceAge((program?.draft.audience ?? {}) as Record<string, unknown>);
    return {
        name: program?.draft.label ?? "",
        description: program?.draft.description ?? "",
        minimumAge: audience.minimumAge != null ? String(audience.minimumAge) : "",
        maximumAge: audience.maximumAge != null ? String(audience.maximumAge) : "",
        ageUnit: audience.ageUnit ?? "years",
    };
}

/**
 * Simplified Organization Programs page — collection rail + selected tile workspace.
 * Replaces the tabbed publication workspace for `/organization/programs`.
 */
export default function ProgramsConfigurationPage({
    initialProgramId = null,
}: {
    initialProgramId?: string | null;
}) {
    const router = useRouter();
    const { orgId: authOrgId } = useAdminAuth();
    const continuity = useConfigurationContinuityOptional();
    const orgId = continuity?.orgId || authOrgId || "";

    const [snapshot, setSnapshot] = useState<ProgramPublicationSnapshot | null>(() =>
        orgId ? (peekProgramsCollection(orgId) ?? null) : null,
    );
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
        initialProgramId?.trim() || continuity?.selection?.programId || null,
    );
    const [shouldSyncRoute, setShouldSyncRoute] = useState(false);
    const [loading, setLoading] = useState(() => !orgId || !peekProgramsCollection(orgId || ""));
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<ProgramsLifecycleFilter>("active");
    const [dialog, setDialog] = useState<DialogMode>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [deleteConfirmName, setDeleteConfirmName] = useState("");
    const [toast, setToast] = useState<string | null>(null);
    const [removalBlocks, setRemovalBlocks] = useState<Map<string, string>>(() => new Map());

    const canManage = snapshot?.capabilities.canManage === true;

    const reload = useCallback(async (_reason: string) => {
        if (!orgId) return;
        const peeked = peekProgramsCollection(orgId);
        if (peeked) {
            setSnapshot(peeked);
            setLoading(false);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const { snapshot: next } = await loadProgramsCollection(orgId, { force: true });
            setSnapshot(next);
            markConfigurationContinuity("reveal", { domain: "programs" });
        } catch (err) {
            const issue = readConfigurationRuntimeIssue(
                err instanceof Error ? err.message : err,
                "Programs",
            );
            setError(operatorProgramError(issue.message));
            if (!peeked) setSnapshot(null);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        const peeked = peekProgramsCollection(orgId);
        if (peeked) {
            setSnapshot(peeked);
            setLoading(false);
            markConfigurationContinuity("reveal", { domain: "programs" });
        }
        void reload("programs-mount");
    }, [orgId, reload]);

    useEffect(() => {
        if (!orgId) return;
        return subscribeConfigurationInvalidation((event) => {
            if (event.scope !== "programs" && event.scope !== "all") return;
            void reload(`invalidation:${event.reason}`);
        });
    }, [orgId, reload]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 3200);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const rows = useMemo(
        () => (snapshot ? buildProgramsOperatorCollection(snapshot) : []),
        [snapshot],
    );
    const visibleRows = useMemo(
        () => filterProgramOperatorRows(rows, { search, filter }),
        [rows, search, filter],
    );
    const detail = useMemo(
        () => (snapshot && selectedProgramId ? buildProgramOperatorDetail(snapshot, selectedProgramId) : null),
        [snapshot, selectedProgramId],
    );

    // Drop selection when the Program no longer exists in a settled snapshot.
    useEffect(() => {
        if (!selectedProgramId || !snapshot || loading || busy) return;
        const exists = snapshot.programs.some((program) => program.id === selectedProgramId);
        if (!exists) {
            setSelectedProgramId(null);
            setShouldSyncRoute(true);
        }
    }, [selectedProgramId, snapshot, loading, busy]);

    const selectProgram = useCallback(
        (programId: string | null, options?: { replace?: boolean }) => {
            setSelectedProgramId(programId);
            continuity?.rememberProgramSelection({
                programId,
                section: null,
            });
            const href = organizationProgramsHref(programId);
            if (options?.replace) router.replace(href, { scroll: false });
            else router.push(href, { scroll: false });
            // Soft-nav can retain a stale search string on same pathname; keep canonical selection in the URL.
            if (typeof window !== "undefined") {
                const current = `${window.location.pathname}${window.location.search}`;
                if (current !== href) {
                    window.history.replaceState(window.history.state, "", href);
                }
            }
        },
        [continuity, router],
    );

    useEffect(() => {
        if (!shouldSyncRoute) return;
        setShouldSyncRoute(false);
        router.replace(organizationProgramsHref(selectedProgramId), { scroll: false });
    }, [router, selectedProgramId, shouldSyncRoute]);

    // Normalize legacy ?section= away without full reload
    useEffect(() => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (!url.searchParams.has("section") && !url.searchParams.has("chapter")) return;
        url.searchParams.delete("section");
        url.searchParams.delete("chapter");
        const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}`;
        router.replace(next);
    }, [router]);

    const existingKeys = useMemo(() => {
        return new Set((snapshot?.programs ?? []).map((program) => program.key));
    }, [snapshot]);

    const openCreate = () => {
        setDialogError(null);
        setDialog({ kind: "create" });
    };

    const afterMutation = async (programId: string | null, message?: string) => {
        if (orgId) {
            invalidateProgramsCollection(orgId, "program-operator-mutation", { publishBus: true });
        }
        if (!orgId) {
            setBusy(false);
            return;
        }
        try {
            const { snapshot: next } = await loadProgramsCollection(orgId, { force: true });
            setSnapshot(next);
            markConfigurationContinuity("reveal", { domain: "programs" });
            setSelectedProgramId(programId);
            continuity?.rememberProgramSelection({ programId, section: null });
            const href = organizationProgramsHref(programId);
            router.replace(href, { scroll: false });
            if (typeof window !== "undefined") {
                window.history.replaceState(window.history.state, "", href);
            }
            if (message) setToast(message);
            setDialog(null);
            setDialogError(null);
            setDeleteConfirmName("");
        } catch (err) {
            setError(operatorProgramError(err instanceof Error ? err.message : "Refresh failed"));
        } finally {
            setLoading(false);
            setBusy(false);
        }
    };

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="programs-configuration-page">
            <div className="w-full" data-testid="programs-content-column">
                <ConfigurationContext
                    title="Programs"
                    subtitle="Manage the Programs your organization offers."
                    titleIcon={<BookOpen className="h-5 w-5" strokeWidth={2} />}
                    testId="programs-configuration-context"
                    actions={
                        canManage ?
                            <ConfigurationPrimaryButton
                                className="gap-1"
                                onClick={openCreate}
                                data-testid="programs-add-program"
                            >
                                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                                Add Program
                            </ConfigurationPrimaryButton>
                        :   null
                    }
                >
                    <ul
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/52"
                        aria-label="Programs breadcrumb"
                    >
                        <li>
                            <Link
                                href={CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF}
                                className="font-medium hover:text-alloy-bend-pine"
                                data-testid="programs-breadcrumb-programs-locations"
                            >
                                Programs & Locations
                            </Link>
                            <span className="mx-1.5 text-alloy-midnight/35" aria-hidden>
                                ›
                            </span>
                            <span className="font-semibold text-alloy-midnight/70">Programs</span>
                        </li>
                    </ul>
                </ConfigurationContext>
            </div>

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}
            {toast ?
                <p
                    className="mb-3 rounded-lg border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.06] px-3 py-2 text-sm text-alloy-midnight"
                    data-testid="programs-toast"
                >
                    {toast}
                </p>
            :   null}

            <ConfigurationShell testId="programs-configuration-shell">
                {loading && !snapshot ?
                    <div
                        className={`grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]`}
                        data-testid="programs-loading-frame"
                    >
                        <aside className="locations-collection-rail process-config-setup-card hidden min-h-[24rem] p-4 xl:block">
                            <p className="text-sm text-alloy-midnight/50">Loading Programs…</p>
                        </aside>
                        <ConfigurationEmptyState
                            testId="programs-loading"
                            title="Loading Programs"
                            description="Fetching Programs for this organization."
                        />
                    </div>
                : !snapshot ?
                    <ConfigurationEmptyState
                        testId="programs-unavailable"
                        title="Programs unavailable"
                        description={error ?? "Programs could not be loaded for this organization."}
                    />
                : rows.length === 0 ?
                    <div className="process-config-setup-card p-8 text-center" data-testid="programs-empty-collection">
                        <h2 className="config-typo-workspace-title">No Programs yet</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm text-alloy-midnight/55">
                            Create your first Program to define a service your organization offers.
                        </p>
                        {canManage ?
                            <ConfigurationPrimaryButton
                                className="mt-4 gap-1"
                                onClick={openCreate}
                                data-testid="programs-empty-add"
                            >
                                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                                Add Program
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                :   <div
                        className={`grid items-start gap-4 pb-4 ${
                            detail || selectedProgramId ? "xl:grid-cols-[20.5rem_minmax(0,1fr)]" : "xl:grid-cols-[20.5rem_minmax(0,1fr)]"
                        }`}
                    >
                        <ProgramsObjectSelector
                            programs={visibleRows}
                            selectedId={selectedProgramId}
                            filter={filter}
                            onFilterChange={setFilter}
                            search={search}
                            onSearchChange={setSearch}
                            canMutate={canManage}
                            onAddProgram={openCreate}
                            totalCount={rows.length}
                            onSelect={(programId) => selectProgram(programId)}
                        />

                        <main className="min-w-0 space-y-2.5" data-testid="programs-selected-column">
                            <div className="xl:hidden">
                                <label className="config-typo-field-label" htmlFor="programs-mobile-selector">
                                    Program
                                </label>
                                <select
                                    id="programs-mobile-selector"
                                    className="config-runtime-select mt-1"
                                    value={selectedProgramId ?? ""}
                                    onChange={(event) => {
                                        const value = event.target.value.trim();
                                        selectProgram(value || null);
                                    }}
                                >
                                    <option value="">Select a Program</option>
                                    {visibleRows.map((program) => (
                                        <option key={program.id} value={program.id}>
                                            {program.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {detail ?
                                <ProgramSelectedWorkspace
                                    detail={detail}
                                    canMutate={canManage}
                                    locationsHref="/organization/locations"
                                    onEdit={() => {
                                        setDialogError(null);
                                        setDialog({ kind: "edit" });
                                    }}
                                    onManageLocations={() => {
                                        setDialogError(null);
                                        setRemovalBlocks(new Map());
                                        setDialog({ kind: "manage-locations" });
                                    }}
                                    onArchive={() =>
                                        setDialog({ kind: "archive", name: detail.name })
                                    }
                                    onRestore={() => {
                                        void (async () => {
                                            setBusy(true);
                                            try {
                                                await restoreProgramOperator(detail.id);
                                                await afterMutation(detail.id, "Program restored.");
                                            } catch (err) {
                                                setError(
                                                    operatorProgramError(
                                                        err instanceof Error ? err.message : "Restore failed",
                                                    ),
                                                );
                                                setBusy(false);
                                            }
                                        })();
                                    }}
                                    onDelete={() =>
                                        setDialog({
                                            kind: "delete",
                                            name: detail.name,
                                            canDelete: detail.canDelete,
                                            reason: detail.deleteBlockReason,
                                        })
                                    }
                                />
                            :   <div
                                    className="process-config-setup-card p-8 text-center"
                                    data-testid="programs-no-selection"
                                >
                                    <h2 className="config-typo-workspace-title">Select a Program</h2>
                                    <p className="mx-auto mt-2 max-w-md text-sm text-alloy-midnight/55">
                                        Choose a Program from the list to view details and manage where it is available.
                                    </p>
                                </div>
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

            {dialog?.kind === "create" && canManage ?
                <ProgramCreateDialog
                    locations={snapshot?.locations ?? []}
                    busy={busy}
                    error={dialogError}
                    onCancel={() => {
                        if (busy) return;
                        setDialog(null);
                        setDialogError(null);
                    }}
                    onSubmit={(input) => {
                        void (async () => {
                            setBusy(true);
                            setDialogError(null);
                            try {
                                const created = await createProgramOperator({
                                    fields: input.fields,
                                    locationIds: input.locationIds,
                                    existingKeys,
                                });
                                await afterMutation(created.programId, "Program created.");
                            } catch (err) {
                                setDialogError(
                                    operatorProgramError(err instanceof Error ? err.message : "Create failed"),
                                );
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "edit" && detail && canManage ?
                <ProgramEditDialog
                    initial={fieldsFromSnapshot(snapshot!, detail.id)}
                    busy={busy}
                    error={dialogError}
                    onCancel={() => {
                        if (busy) return;
                        setDialog(null);
                        setDialogError(null);
                    }}
                    onSubmit={(fields) => {
                        void (async () => {
                            setBusy(true);
                            setDialogError(null);
                            try {
                                await saveProgramOperator({ programId: detail.id, fields });
                                await afterMutation(detail.id, "Program saved.");
                            } catch (err) {
                                setDialogError(
                                    operatorProgramError(err instanceof Error ? err.message : "Save failed"),
                                );
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "manage-locations" && detail && snapshot && canManage ?
                <ProgramManageLocationsDialog
                    locations={snapshot.locations}
                    initialSelectedIds={associatedLocationIdsForProgram(snapshot, detail.id)}
                    busy={busy}
                    error={dialogError}
                    blockedReasons={removalBlocks}
                    onCancel={() => {
                        if (busy) return;
                        setDialog(null);
                        setDialogError(null);
                    }}
                    onSubmit={(locationIds) => {
                        void (async () => {
                            setBusy(true);
                            setDialogError(null);
                            try {
                                const program = snapshot.programs.find((row) => row.id === detail.id);
                                const result = await syncProgramLocationsOperator({
                                    programId: detail.id,
                                    publicationId: program?.latestPublication?.id ?? null,
                                    selectedLocationIds: locationIds,
                                    currentLocationIds: associatedLocationIdsForProgram(snapshot, detail.id),
                                });
                                if (result.blocked.length > 0) {
                                    const next = new Map<string, string>();
                                    for (const item of result.blocked) {
                                        next.set(item.locationId, item.reason);
                                    }
                                    setRemovalBlocks(next);
                                    setDialogError(
                                        result.blocked.map((item) => item.reason).join(" "),
                                    );
                                    await reload("program-locations-partial");
                                    setBusy(false);
                                    return;
                                }
                                await afterMutation(detail.id, "Locations updated.");
                            } catch (err) {
                                setDialogError(
                                    operatorProgramError(err instanceof Error ? err.message : "Update failed"),
                                );
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "archive" && detail ?
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
                    role="dialog"
                    aria-modal="true"
                    data-testid="program-archive-dialog"
                >
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <h2 className="text-lg font-semibold text-alloy-midnight">
                            Archive {dialog.name}?
                        </h2>
                        <p className="mt-2 text-sm text-alloy-midnight/60">
                            Archived Programs are removed from normal active lists and cannot be used for new
                            activity. Existing records are preserved.
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton
                                disabled={busy}
                                onClick={() => setDialog(null)}
                            >
                                Cancel
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                disabled={busy}
                                data-testid="program-archive-confirm"
                                onClick={() => {
                                    void (async () => {
                                        setBusy(true);
                                        try {
                                            await archiveProgramOperator(detail.id);
                                            await afterMutation(detail.id, "Program archived.");
                                            setFilter("archived");
                                        } catch (err) {
                                            setError(
                                                operatorProgramError(
                                                    err instanceof Error ? err.message : "Archive failed",
                                                ),
                                            );
                                            setBusy(false);
                                            setDialog(null);
                                        }
                                    })();
                                }}
                            >
                                {busy ? "Archiving…" : "Archive Program"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                </div>
            :   null}

            {dialog?.kind === "delete" && detail ?
                dialog.canDelete ?
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
                        role="dialog"
                        aria-modal="true"
                        data-testid="program-delete-dialog"
                    >
                        <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                            <h2 className="text-lg font-semibold text-alloy-midnight">
                                Delete {dialog.name}?
                            </h2>
                            <p className="mt-2 text-sm text-alloy-midnight/60">
                                This permanently deletes the Program. This action cannot be undone.
                            </p>
                            <label className="mt-4 block">
                                <span className="config-typo-field-label">
                                    Type {dialog.name} to confirm
                                </span>
                                <input
                                    value={deleteConfirmName}
                                    onChange={(event) => setDeleteConfirmName(event.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="program-delete-confirm-name"
                                />
                            </label>
                            <div className="mt-5 flex justify-end gap-2">
                                <ConfigurationSecondaryButton
                                    disabled={busy}
                                    onClick={() => {
                                        setDialog(null);
                                        setDeleteConfirmName("");
                                    }}
                                >
                                    Cancel
                                </ConfigurationSecondaryButton>
                                <ConfigurationPrimaryButton
                                    disabled={busy || deleteConfirmName.trim() !== dialog.name}
                                    data-testid="program-delete-confirm"
                                    onClick={() => {
                                        void (async () => {
                                            setBusy(true);
                                            try {
                                                const result = await deleteProgramOperator(detail.id);
                                                if (result.blocked) {
                                                    setDialog({
                                                        kind: "delete-blocked",
                                                        name: dialog.name,
                                                        reason:
                                                            result.reason
                                                            ?? "This Program is already in use and its history must be preserved.",
                                                    });
                                                    setBusy(false);
                                                    return;
                                                }
                                                await afterMutation(null, "Program deleted.");
                                            } catch (err) {
                                                setError(
                                                    operatorProgramError(
                                                        err instanceof Error ? err.message : "Delete failed",
                                                    ),
                                                );
                                                setBusy(false);
                                                setDialog(null);
                                            }
                                        })();
                                    }}
                                >
                                    {busy ? "Deleting…" : "Delete Program"}
                                </ConfigurationPrimaryButton>
                            </div>
                        </div>
                    </div>
                :   <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
                        role="dialog"
                        aria-modal="true"
                        data-testid="program-delete-blocked-dialog"
                    >
                        <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                            <h2 className="text-lg font-semibold text-alloy-midnight">
                                {dialog.name} cannot be deleted
                            </h2>
                            <p className="mt-2 text-sm text-alloy-midnight/60">
                                {dialog.reason ?? "This Program is already in use and its history must be preserved."}
                            </p>
                            <p className="mt-2 text-sm text-alloy-midnight/60">Archive it instead.</p>
                            <div className="mt-5 flex justify-end gap-2">
                                <ConfigurationSecondaryButton onClick={() => setDialog(null)}>
                                    Cancel
                                </ConfigurationSecondaryButton>
                                <ConfigurationPrimaryButton
                                    data-testid="program-delete-blocked-archive"
                                    onClick={() => setDialog({ kind: "archive", name: dialog.name })}
                                >
                                    Archive Program
                                </ConfigurationPrimaryButton>
                            </div>
                        </div>
                    </div>
            :   null}

            {dialog?.kind === "delete-blocked" && detail ?
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
                    role="dialog"
                    aria-modal="true"
                    data-testid="program-delete-blocked-dialog"
                >
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <h2 className="text-lg font-semibold text-alloy-midnight">
                            {dialog.name} cannot be deleted
                        </h2>
                        <p className="mt-2 text-sm text-alloy-midnight/60">{dialog.reason}</p>
                        <p className="mt-2 text-sm text-alloy-midnight/60">Archive it instead.</p>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton onClick={() => setDialog(null)}>
                                Cancel
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                onClick={() => setDialog({ kind: "archive", name: dialog.name })}
                            >
                                Archive Program
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                </div>
            :   null}
        </div>
    );
}
