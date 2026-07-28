"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ConfigurationEmptyState,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import {
    TuitionPlansObjectSelector,
    type TuitionPlansLifecycleFilter,
} from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlansObjectSelector";
import { TuitionPlansLanding } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlansLanding";
import {
    normalizeTuitionPlanTab,
    TuitionPlanWorkspace,
    type TuitionPlanWorkspaceTab,
} from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanWorkspace";
import { TuitionPlanCreateDialog } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanCreateDialog";
import { TuitionPlanEditDialog } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanEditDialog";
import { TuitionPlanScheduleChangeDialog } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanScheduleChangeDialog";
import {
    TuitionPlanAddCommitmentDialog,
    TuitionPlanManageCommitmentsDialog,
    TuitionPlanStopCommitmentDialog,
} from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanCommitmentDialogs";
import { TuitionPlanCompareDialog } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanCompareDialog";
import {
    TuitionSetupSubnav,
    normalizeTuitionSetupSection,
    type TuitionSetupSection,
} from "@/components/adminV2/settings/financials/tuitionPlans/TuitionSetupSubnav";
import { TuitionBillingFrequenciesPanel } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel";
import { TuitionEnrollmentCommitmentsPanel } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionEnrollmentCommitmentsPanel";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { organizationTuitionPlansHref } from "@/lib/commercial/commercialChapterRoutes";
import {
    buildTuitionRateMap,
    tuitionRateCellKey,
} from "@/lib/commercial/tuitionRates";
import {
    addEnrollmentCommitment,
    createTuitionPlan,
    stopOfferingCommitment,
    updateTuitionPlanDetails,
    upsertTuitionPrice,
} from "@/lib/financials/tuitionPlans/tuitionPlanClient";
import {
    invalidateTuitionPlans,
    loadTuitionPlans,
    peekTuitionPlans,
    type TuitionPlansSnapshot,
} from "@/lib/financials/tuitionPlans/tuitionPlansCache";
import {
    buildActiveDayCommitmentValues,
    deriveEnrollmentCommitments,
} from "@/lib/financials/tuitionPlans/enrollmentCommitmentsViewModel";
import { fetchEnrollmentCommitmentTemplates } from "@/lib/financials/tuitionPlans/enrollmentCommitmentsClient";
import {
    buildTuitionPlanCollectionRows,
    buildTuitionPlanDetail,
    buildTuitionSetupReadiness,
    type TuitionPlanCollectionRow,
} from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import { readTuitionLocationApplicability } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";
import { occupiedCareFormatsForProgram } from "@/lib/financials/tuitionPlans/occupiedCareFormats";
import { operatorFriendlyProgramOfferingError } from "@/lib/programs/operatorFriendlyProgramOfferingError";

type DialogMode =
    | null
    | { kind: "create" }
    | { kind: "edit" }
    | { kind: "schedule" }
    | { kind: "manage-commitments" }
    | { kind: "add-commitment" }
    | { kind: "stop-commitment" }
    | { kind: "compare" };

function filterTuitionPlanRows(
    rows: TuitionPlanCollectionRow[],
    { search, filter }: { search: string; filter: TuitionPlansLifecycleFilter },
): TuitionPlanCollectionRow[] {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
        if (filter === "active" && row.status === "archived") return false;
        if (filter === "archived" && row.status !== "archived") return false;
        if (!query) return true;
        const haystack = [
            row.name,
            row.programLabel,
            row.careFormatLabel,
            row.priceRangeLabel ?? "",
            row.billingFrequencyLabel,
        ]
            .join(" ")
            .toLowerCase();
        return haystack.includes(query);
    });
}

function countLocationOverrides(snapshot: TuitionPlansSnapshot): number {
    return snapshot.rates.filter((rate) => rate.location_id != null).length;
}

function countCommitmentPatterns(snapshot: TuitionPlansSnapshot): number {
    const patterns = new Set<string>();
    for (const variant of snapshot.variants) {
        if (variant.quantity_type && variant.quantity_value != null) {
            patterns.add(`${variant.quantity_type}:${variant.quantity_value}`);
        }
    }
    return patterns.size;
}

export default function TuitionPlansConfigurationPage({
    initialPlanId = null,
    initialTab = null,
    initialSetup = null,
}: {
    initialPlanId?: string | null;
    initialTab?: string | null;
    initialSetup?: string | null;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { orgId: authOrgId } = useAdminAuth();
    const continuity = useConfigurationContinuityOptional();
    const orgId = continuity?.orgId || authOrgId || "";

    const [snapshot, setSnapshot] = useState<TuitionPlansSnapshot | null>(() =>
        orgId ? (peekTuitionPlans(orgId) ?? null) : null,
    );
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId?.trim() || null);
    const [tab, setTab] = useState<TuitionPlanWorkspaceTab>(() => normalizeTuitionPlanTab(initialTab));
    const [loading, setLoading] = useState(() => !orgId || !peekTuitionPlans(orgId || ""));
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<TuitionPlansLifecycleFilter>("active");
    const [dialog, setDialog] = useState<DialogMode>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [shouldSyncRoute, setShouldSyncRoute] = useState(false);
    const [commitmentTemplates, setCommitmentTemplates] = useState<
        Awaited<ReturnType<typeof fetchEnrollmentCommitmentTemplates>>
    >([]);

    const canManage = true;

    const urlPlanId = searchParams.get("planId")?.trim() || null;
    const urlTab = normalizeTuitionPlanTab(searchParams.get("tab"));
    const setup = normalizeTuitionSetupSection(searchParams.get("setup") ?? initialSetup);

    useEffect(() => {
        setSelectedPlanId((current) => (current === urlPlanId ? current : urlPlanId));
        setTab((current) => (current === urlTab ? current : urlTab));
    }, [urlPlanId, urlTab]);

    const reload = useCallback(async () => {
        if (!orgId) return;
        const peeked = peekTuitionPlans(orgId);
        if (peeked) {
            setSnapshot(peeked);
            setLoading(false);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const next = await loadTuitionPlans(orgId, { force: true });
            setSnapshot(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load Tuition Plans.");
            if (!peeked) setSnapshot(null);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        const peeked = peekTuitionPlans(orgId);
        if (peeked) {
            setSnapshot(peeked);
            setLoading(false);
        }
        void reload();
    }, [orgId, reload]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 3200);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const rows = useMemo(
        () => (snapshot ? buildTuitionPlanCollectionRows(snapshot) : []),
        [snapshot],
    );
    const visibleRows = useMemo(
        () => filterTuitionPlanRows(rows, { search, filter }),
        [rows, search, filter],
    );
    const detail = useMemo(() => {
        if (!snapshot || !selectedPlanId) return null;
        const offering = snapshot.offerings.find((row) => row.id === selectedPlanId);
        if (!offering) return null;
        const variants = snapshot.variants.filter((row) => row.offering_id === selectedPlanId);
        return buildTuitionPlanDetail({
            offering,
            variants,
            rates: snapshot.rates,
            programs: snapshot.programs,
            locations: snapshot.locations,
            cadences: snapshot.cadences,
            revenueCategories: snapshot.revenueCategories,
        });
    }, [snapshot, selectedPlanId]);

    const readiness = useMemo(
        () =>
            snapshot
                ? buildTuitionSetupReadiness({
                      revenueCategoryCount: snapshot.revenueCategories.length,
                      cadenceCount: snapshot.cadences.length,
                      commitmentPatternCount: countCommitmentPatterns(snapshot),
                      planCount: snapshot.offerings.length,
                      overrideCount: countLocationOverrides(snapshot),
                  })
                : null,
        [snapshot],
    );

    useEffect(() => {
        void fetchEnrollmentCommitmentTemplates()
            .then(setCommitmentTemplates)
            .catch(() => setCommitmentTemplates([]));
    }, [snapshot?.fetchedAtMs]);

    const dayCommitments = useMemo(() => {
        if (!snapshot) return [1, 2, 3, 4, 5];
        return buildActiveDayCommitmentValues(
            deriveEnrollmentCommitments({
                variants: snapshot.variants,
                templateItems: commitmentTemplates,
            }),
        );
    }, [snapshot, commitmentTemplates]);

    const plansHref = useCallback(
        (planId: string | null, nextTab?: TuitionPlanWorkspaceTab, nextSetup: TuitionSetupSection = "plans") =>
            organizationTuitionPlansHref({
                planId: nextSetup === "plans" ? planId : null,
                tab: nextSetup === "plans" && planId ? (nextTab ?? tab) : null,
                setup: nextSetup,
            }),
        [tab],
    );

    useEffect(() => {
        if (!selectedPlanId || !snapshot || loading || busy) return;
        const exists = snapshot.offerings.some((row) => row.id === selectedPlanId);
        if (!exists) {
            setSelectedPlanId(null);
            setShouldSyncRoute(true);
        }
    }, [selectedPlanId, snapshot, loading, busy]);

    useEffect(() => {
        if (!snapshot || loading || busy) return;
        if (!selectedPlanId) return;
        const stillVisible = visibleRows.some((row) => row.id === selectedPlanId);
        if (!stillVisible) {
            setSelectedPlanId(null);
            setShouldSyncRoute(true);
        }
    }, [visibleRows, selectedPlanId, snapshot, loading, busy]);

    const selectPlan = useCallback(
        (planId: string | null, options?: { tab?: TuitionPlanWorkspaceTab; replace?: boolean }) => {
            setSelectedPlanId(planId);
            const nextTab = options?.tab ?? (planId ? tab : "overview");
            if (options?.tab) setTab(options.tab);
            const href = plansHref(planId, nextTab);
            if (options?.replace) router.replace(href, { scroll: false });
            else router.push(href, { scroll: false });
        },
        [plansHref, router, tab],
    );

    const changeTab = useCallback(
        (nextTab: TuitionPlanWorkspaceTab) => {
            setTab(nextTab);
            if (!selectedPlanId) return;
            router.replace(plansHref(selectedPlanId, nextTab), { scroll: false });
        },
        [plansHref, router, selectedPlanId],
    );

    useEffect(() => {
        if (!shouldSyncRoute) return;
        setShouldSyncRoute(false);
        router.replace(plansHref(selectedPlanId), { scroll: false });
    }, [router, selectedPlanId, shouldSyncRoute, plansHref]);

    const afterMutation = async (planId: string | null, message?: string) => {
        if (orgId) invalidateTuitionPlans(orgId);
        setBusy(true);
        try {
            const next = await loadTuitionPlans(orgId, { force: true });
            setSnapshot(next);
            if (planId) setSelectedPlanId(planId);
            const href = plansHref(planId);
            router.replace(href, { scroll: false });
            if (message) setToast(message);
            setDialog(null);
            setDialogError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Refresh failed.");
        } finally {
            setBusy(false);
            setLoading(false);
        }
    };

    const openCreate = () => {
        setDialogError(null);
        setDialog({ kind: "create" });
    };

    return (
        <div data-testid="tuition-plans-configuration-page">
            <TuitionSetupSubnav
                active={setup}
                planId={selectedPlanId}
                tab={tab}
                onNewPlan={canManage ? openCreate : undefined}
            />

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}
            {toast ?
                <p
                    className="mb-3 rounded-lg border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.06] px-3 py-2 text-sm text-alloy-midnight"
                    data-testid="tuition-plans-toast"
                >
                    {toast}
                </p>
            :   null}

            <ConfigurationShell testId="tuition-plans-configuration-shell">
                {setup === "frequencies" ?
                    snapshot ?
                        <TuitionBillingFrequenciesPanel snapshot={snapshot} onReload={() => void reload()} />
                    :   <ConfigurationEmptyState
                            testId="tuition-frequencies-loading"
                            title="Loading Billing Frequencies"
                            description="Fetching configured billing frequencies."
                        />
                : setup === "commitments" ?
                    snapshot ?
                        <TuitionEnrollmentCommitmentsPanel snapshot={snapshot} />
                    :   <ConfigurationEmptyState
                            testId="tuition-commitments-loading"
                            title="Loading Enrollment Commitments"
                            description="Fetching configured enrollment commitments."
                        />
                : loading && !snapshot ?
                    <div className="grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                        <aside className="locations-collection-rail process-config-setup-card hidden min-h-[24rem] p-4 xl:block">
                            <p className="text-sm text-alloy-midnight/50">Loading Tuition Plans…</p>
                        </aside>
                        <ConfigurationEmptyState
                            testId="tuition-plans-loading"
                            title="Loading Tuition Plans"
                            description="Fetching Tuition Plans for this organization."
                        />
                    </div>
                : !snapshot ?
                    <ConfigurationEmptyState
                        testId="tuition-plans-unavailable"
                        title="Tuition Plans unavailable"
                        description={error ?? "Tuition Plans could not be loaded for this organization."}
                    />
                : rows.length === 0 ?
                    <div className="space-y-4">
                        {readiness ?
                            <TuitionPlansLanding
                                plans={[]}
                                readiness={readiness}
                                onCreatePlan={openCreate}
                                canManage={canManage}
                            />
                        :   null}
                    </div>
                :   <div className="grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                        <TuitionPlansObjectSelector
                            plans={visibleRows}
                            selectedId={selectedPlanId}
                            filter={filter}
                            onFilterChange={setFilter}
                            search={search}
                            onSearchChange={setSearch}
                            totalCount={rows.length}
                            onSelect={(planId) => selectPlan(planId)}
                        />

                        <main className="min-w-0 space-y-2.5" data-testid="tuition-plans-selected-column">
                            <div className="xl:hidden">
                                <label className="config-typo-field-label" htmlFor="tuition-plans-mobile-selector">
                                    Tuition Plan
                                </label>
                                <select
                                    id="tuition-plans-mobile-selector"
                                    className="config-runtime-select mt-1"
                                    value={selectedPlanId ?? ""}
                                    onChange={(event) => {
                                        const value = event.target.value.trim();
                                        selectPlan(value || null);
                                    }}
                                >
                                    <option value="">Tuition Plans overview</option>
                                    {visibleRows.map((plan) => (
                                        <option key={plan.id} value={plan.id}>
                                            {plan.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {detail && snapshot ?
                                <TuitionPlanWorkspace
                                    detail={detail}
                                    snapshot={snapshot}
                                    tab={tab}
                                    canMutate={canManage}
                                    onTabChange={changeTab}
                                    onEdit={() => {
                                        setDialogError(null);
                                        setDialog({ kind: "edit" });
                                    }}
                                    onScheduleChange={() => {
                                        setDialogError(null);
                                        setDialog({ kind: "schedule" });
                                    }}
                                    onManageCommitments={() => {
                                        setDialogError(null);
                                        setDialog({ kind: "manage-commitments" });
                                    }}
                                    onCompare={() => {
                                        setDialogError(null);
                                        setDialog({ kind: "compare" });
                                    }}
                                    onReload={() => void reload()}
                                />
                            : readiness ?
                                <TuitionPlansLanding
                                    plans={rows}
                                    readiness={readiness}
                                    onCreatePlan={openCreate}
                                    canManage={canManage}
                                />
                            :   null}
                        </main>
                    </div>
                }
            </ConfigurationShell>

            {dialog?.kind === "create" && snapshot && canManage ?
                <TuitionPlanCreateDialog
                    programs={snapshot.programs}
                    cadences={snapshot.cadences}
                    revenueCategories={snapshot.revenueCategories}
                    existingVariants={snapshot.variants}
                    dayCommitments={dayCommitments}
                    locations={snapshot.locations}
                    offerings={snapshot.offerings}
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
                                const created = await createTuitionPlan(input);
                                await afterMutation(created.offering.id, "Tuition Plan created.");
                            } catch (err) {
                                setDialogError(
                                    operatorFriendlyProgramOfferingError(
                                        err instanceof Error ? err.message : "Create failed.",
                                        {
                                            programLabel: input.programKey,
                                            careFormat: input.careFormat,
                                            planName: input.name,
                                        },
                                    ),
                                );
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "edit" && detail && snapshot && canManage ?
                <TuitionPlanEditDialog
                    detail={detail}
                    cadences={snapshot.cadences}
                    revenueCategories={snapshot.revenueCategories}
                    locations={snapshot.locations}
                    occupiedCareFormats={occupiedCareFormatsForProgram(
                        snapshot.offerings,
                        detail.offering.program_key,
                        detail.id,
                    )}
                    initialLocationMode={readTuitionLocationApplicability(detail.offering.metadata).mode}
                    initialLocationIds={readTuitionLocationApplicability(detail.offering.metadata).locationIds}
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
                                await updateTuitionPlanDetails({
                                    offeringId: detail.id,
                                    name: input.name,
                                    careFormat: input.careFormat,
                                    previousCareFormat: detail.careFormat,
                                    billingFrequencyKey: input.billingFrequencyKey,
                                    revenueCategoryId: input.revenueCategoryId,
                                    status: input.status,
                                    metadata: detail.offering.metadata,
                                    locationMode: input.locationMode,
                                    locationIds: input.locationIds,
                                });
                                await afterMutation(detail.id, "Tuition Plan saved.");
                            } catch (err) {
                                setDialogError(
                                    operatorFriendlyProgramOfferingError(
                                        err instanceof Error ? err.message : "Save failed.",
                                        {
                                            programLabel: detail.programLabel,
                                            careFormat: input.careFormat,
                                            planName: input.name,
                                        },
                                    ),
                                );
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "schedule" && detail && snapshot && canManage ?
                <TuitionPlanScheduleChangeDialog
                    detail={detail}
                    snapshot={snapshot}
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
                                const cadenceKey = detail.billingFrequencyKey;
                                if (!cadenceKey) throw new Error("Billing Frequency is not set.");
                                const orgMap = buildTuitionRateMap(snapshot.rates, null);
                                for (const change of input.changes) {
                                    const existing = orgMap.get(tuitionRateCellKey(change.variantId, cadenceKey)) ?? null;
                                    await upsertTuitionPrice({
                                        existing,
                                        variantId: change.variantId,
                                        cadenceKey,
                                        locationId: null,
                                        rateCents: change.rateCents,
                                        effectiveStart: input.effectiveDate,
                                        preserveHistory: true,
                                    });
                                }
                                await afterMutation(detail.id, "Tuition change scheduled.");
                            } catch (err) {
                                setDialogError(err instanceof Error ? err.message : "Schedule failed.");
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "manage-commitments" && detail && canManage ?
                <TuitionPlanManageCommitmentsDialog
                    detail={detail}
                    busy={busy}
                    onClose={() => setDialog(null)}
                    onAdd={() => {
                        setDialog({ kind: "add-commitment" });
                    }}
                    onStop={() => {
                        setDialog({ kind: "stop-commitment" });
                    }}
                />
            :   null}

            {dialog?.kind === "add-commitment" && detail && canManage ?
                <TuitionPlanAddCommitmentDialog
                    detail={detail}
                    dayCommitments={dayCommitments}
                    busy={busy}
                    error={dialogError}
                    onCancel={() => {
                        if (busy) return;
                        setDialog({ kind: "manage-commitments" });
                        setDialogError(null);
                    }}
                    onSubmit={(input) => {
                        void (async () => {
                            setBusy(true);
                            setDialogError(null);
                            try {
                                const cadenceKey = detail.billingFrequencyKey;
                                if (!cadenceKey) throw new Error("Billing Frequency is not set.");
                                await addEnrollmentCommitment({
                                    offeringId: detail.id,
                                    quantityType: "days",
                                    quantityValue: input.quantityValue,
                                    rateCents: input.rateCents,
                                    billingFrequencyKey: cadenceKey,
                                    effectiveDate: input.effectiveDate,
                                });
                                await afterMutation(detail.id, "Enrollment Commitment added.");
                            } catch (err) {
                                setDialogError(err instanceof Error ? err.message : "Add failed.");
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "stop-commitment" && detail && canManage ?
                <TuitionPlanStopCommitmentDialog
                    detail={detail}
                    busy={busy}
                    error={dialogError}
                    onCancel={() => {
                        if (busy) return;
                        setDialog({ kind: "manage-commitments" });
                        setDialogError(null);
                    }}
                    onSubmit={(variantId) => {
                        void (async () => {
                            setBusy(true);
                            setDialogError(null);
                            try {
                                await stopOfferingCommitment({
                                    offeringId: detail.id,
                                    variantId,
                                });
                                await afterMutation(detail.id, "Enrollment Commitment stopped.");
                            } catch (err) {
                                setDialogError(err instanceof Error ? err.message : "Stop failed.");
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}

            {dialog?.kind === "compare" && detail && snapshot ?
                <TuitionPlanCompareDialog
                    detail={detail}
                    snapshot={snapshot}
                    onClose={() => setDialog(null)}
                />
            :   null}
        </div>
    );
}
