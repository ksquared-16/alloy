"use client";

/**
 * Organization Financials workspace — Locations-quality shell around Tuition / Catalog /
 * Policies / Accounting / Simulator / Funding panels.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banknote } from "lucide-react";
import CommercialSimulatorPanel from "@/components/adminV2/commercial/CommercialSimulatorPanel";
import TuitionPlansConfigurationPage from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlansConfigurationPage";
import GlCodesConfigurationPage from "@/components/adminV2/settings/financials/accounting/GlCodesConfigurationPage";
import CatalogConfigurationPage from "@/components/adminV2/settings/financials/catalog/CatalogConfigurationPage";
import PoliciesConfigurationPage from "@/components/adminV2/settings/financials/policies/PoliciesConfigurationPage";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    FINANCIALS_WORKSPACE_CHAPTER_META,
    FINANCIALS_WORKSPACE_CHAPTERS,
    organizationFinancialsChapterHref,
    type FinancialsWorkspaceChapter,
} from "@/lib/commercial/commercialChapterRoutes";
import { type CommercialCategory, type CommercialProduct, type CommercialRevenueCategory } from "@/lib/commercial/commercialProducts";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import {
    loadProgramsChapterContext,
    peekProgramsChapterContext,
} from "@/lib/programs/programsChapterContextCache";
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";

function ChapterTabs({
    active,
    onSelect,
}: {
    active: FinancialsWorkspaceChapter;
    onSelect: (chapter: FinancialsWorkspaceChapter) => void;
}) {
    return (
        <div
            className="flex flex-wrap items-end gap-1 border-b border-alloy-stone/20"
            data-testid="financials-workspace-chapter-tabs"
            role="tablist"
            aria-label="Financials sections"
        >
            {FINANCIALS_WORKSPACE_CHAPTERS.map((chapter) => {
                const selected = chapter === active;
                return (
                    <button
                        key={chapter}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        data-testid={`financials-workspace-chapter-${chapter}`}
                        onClick={() => onSelect(chapter)}
                        className={`px-3 py-1.5 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 rounded-sm ${
                            selected
                                ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"
                        }`}
                    >
                        {FINANCIALS_WORKSPACE_CHAPTER_META[chapter].label}
                    </button>
                );
            })}
        </div>
    );
}

export default function FinancialsWorkspaceSurface({
    chapter,
    orgId,
}: {
    chapter: FinancialsWorkspaceChapter;
    orgId: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const continuity = useConfigurationContinuityOptional();
    const tuitionPlanId = searchParams.get("planId");
    const tuitionTab = searchParams.get("tab");
    const tuitionSetup = searchParams.get("setup");
    const catalogSetup = searchParams.get("setup");
    const catalogItemId = searchParams.get("itemId");
    const peeked = orgId ? peekProgramsChapterContext(orgId) : null;
    const [loading, setLoading] = useState(!peeked);
    const [error, setError] = useState<string | null>(null);
    const [locations, setLocations] = useState(peeked?.locations ?? []);
    const [programs, setPrograms] = useState(peeked?.programs ?? []);
    const [products, setProducts] = useState<CommercialProduct[]>(
        (peeked?.products as CommercialProduct[] | undefined) ?? [],
    );
    const [categories, setCategories] = useState<CommercialCategory[]>(
        (peeked?.categories as CommercialCategory[] | undefined) ?? [],
    );
    const [revenueCategories, setRevenueCategories] = useState<CommercialRevenueCategory[]>(
        (peeked?.revenueCategories as CommercialRevenueCategory[] | undefined) ?? [],
    );
    const [cadences, setCadences] = useState<BillingCadence[]>(
        (peeked?.cadences as BillingCadence[] | undefined) ?? [],
    );

    const reload = useCallback(
        async (force = false) => {
            if (!orgId) return;
            if (!peekProgramsChapterContext(orgId)) setLoading(true);
            setError(null);
            try {
                const snapshot = await loadProgramsChapterContext(orgId, { force });
                setLocations(snapshot.locations);
                setPrograms(snapshot.programs);
                setProducts(snapshot.products as CommercialProduct[]);
                setCategories(snapshot.categories as CommercialCategory[]);
                setRevenueCategories(snapshot.revenueCategories as CommercialRevenueCategory[]);
                setCadences(snapshot.cadences as BillingCadence[]);
            } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "Could not load chapter.");
            } finally {
                setLoading(false);
            }
        },
        [orgId],
    );

    useEffect(() => {
        void reload(false);
    }, [reload]);

    const rememberChapter = continuity?.rememberProgramsChapterSelection;
    useEffect(() => {
        rememberChapter?.({ chapter });
        for (const sibling of FINANCIALS_WORKSPACE_CHAPTERS) {
            void prepareConfigurationSoftNavTarget(organizationFinancialsChapterHref(sibling), (href) =>
                router.prefetch(href),
            );
        }
        void prepareConfigurationSoftNavTarget(organizationFinancialsChapterHref(null), (href) =>
            router.prefetch(href),
        );
    }, [chapter, rememberChapter, router]);

    const meta = FINANCIALS_WORKSPACE_CHAPTER_META[chapter];
    const selectChapter = (next: FinancialsWorkspaceChapter) => {
        rememberChapter?.({ chapter: next });
        router.push(organizationFinancialsChapterHref(next), { scroll: false });
    };

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="financials-workspace-surface" data-chapter={chapter}>
            <ConfigurationContext
                title="Financials"
                titleIcon={<Banknote className="h-5 w-5" strokeWidth={2} />}
                subtitle={meta.description}
                testId="financials-configuration-context"
            >
                <div className="mt-1.5">
                    <ChapterTabs active={chapter} onSelect={selectChapter} />
                </div>
            </ConfigurationContext>

            <ConfigurationShell testId={`financials-chapter-shell-${chapter}`}>
                {chapter === "tuition" ?
                    <div data-testid="financials-chapter-tuition">
                        <TuitionPlansConfigurationPage
                            initialPlanId={tuitionPlanId}
                            initialTab={tuitionTab}
                            initialSetup={tuitionSetup}
                        />
                    </div>
                : chapter === "accounting" ?
                    <div data-testid="financials-chapter-accounting">
                        <GlCodesConfigurationPage />
                    </div>
                : chapter === "policies" ?
                    <div data-testid="financials-chapter-policies">
                        <PoliciesConfigurationPage programs={programs} locations={locations} />
                    </div>
                : chapter === "catalog" ?
                    <div data-testid="financials-chapter-catalog">
                        <CatalogConfigurationPage
                            products={products}
                            categories={categories}
                            revenueCategories={revenueCategories}
                            locations={locations}
                            programs={programs}
                            cadences={cadences}
                            loading={loading}
                            initialSetup={catalogSetup}
                            initialItemId={catalogItemId}
                            onCategoriesChanged={setCategories}
                            onProductCreated={(product) =>
                                setProducts((current) =>
                                    current.some((row) => row.id === product.id) ? current : [...current, product],
                                )
                            }
                            onProductUpdated={(product) =>
                                setProducts((current) => current.map((row) => (row.id === product.id ? product : row)))
                            }
                            onCategoryCreated={(category) =>
                                setCategories((current) =>
                                    current.some((row) => row.id === category.id) ? current : [...current, category],
                                )
                            }
                        />
                    </div>
                : error ?
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                : loading ?
                    <p className="p-4 text-sm text-alloy-midnight/55">Loading {meta.label}…</p>
                : chapter === "simulator" ?
                    <ConfigWorkspaceCard
                        title="Commercial simulator"
                        description="Preview how commercial execution resolves for a Program and schedule."
                        testId="financials-chapter-simulator"
                    >
                        <CommercialSimulatorPanel programs={programs} cadences={cadences} />
                    </ConfigWorkspaceCard>
                :
                    <ConfigWorkspaceCard
                        title="Funding"
                        description="Payment responsibility stays in Processing."
                        testId="financials-chapter-funding"
                    >
                        <div className="max-w-lg space-y-2 py-2 text-sm text-alloy-midnight/65">
                            <p className="font-semibold text-alloy-midnight">Funding is managed in Processing</p>
                            <p>
                                Who pays — private pay, subsidies, employer sponsorship, and splits — is configured
                                through the Processing Platform. Programs and Financials set price and catalog;
                                Processing decides responsibility.
                            </p>
                        </div>
                    </ConfigWorkspaceCard>
                }
            </ConfigurationShell>
        </div>
    );
}
