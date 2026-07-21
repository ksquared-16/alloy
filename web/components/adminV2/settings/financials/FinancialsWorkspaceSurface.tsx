"use client";

/**
 * Organization Financials workspace — Locations-quality shell around existing
 * Tuition / Catalog / Policies / Accounting / Simulator / Funding panels.
 * Controls and mutations are unchanged; only route ownership + chrome translate.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote } from "lucide-react";
import CommercialPoliciesPanel from "@/components/adminV2/commercial/CommercialPoliciesPanel";
import CommercialSimulatorPanel from "@/components/adminV2/commercial/CommercialSimulatorPanel";
import { CommercialCatalogPanel, AccountingReferencePanel } from "@/components/adminV2/commercial/CommercialConfigWorkspace";
import { TuitionGridWorkspace } from "@/components/adminV2/commercial/TuitionGridWorkspace";
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
import { sortProducts, type CommercialCategory, type CommercialProduct, type CommercialRevenueCategory } from "@/lib/commercial/commercialProducts";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import {
    loadProgramsChapterContext,
    peekProgramsChapterContext,
} from "@/lib/programs/programsChapterContextCache";
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";
import { CANONICAL_ORGANIZATION_BASE } from "@/lib/admin/canonicalAdminRoutes";

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
                        className={`px-3 py-2 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 rounded-sm ${
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
    const continuity = useConfigurationContinuityOptional();
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
                <div
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2"
                    data-testid="financials-collection-posture"
                >
                    <ul
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/52"
                        aria-label="Financials breadcrumb"
                    >
                        <li>
                            <Link href={CANONICAL_ORGANIZATION_BASE} className="font-medium hover:text-alloy-bend-pine">
                                Organization
                            </Link>
                            <span className="mx-1.5 text-alloy-midnight/35" aria-hidden>
                                ›
                            </span>
                            <span className="font-semibold text-alloy-midnight/70">Financials</span>
                            <span className="mx-1.5 text-alloy-midnight/35" aria-hidden>
                                ›
                            </span>
                            <span className="font-semibold text-alloy-bend-pine">{meta.label}</span>
                        </li>
                    </ul>
                </div>
                <div className="mt-2">
                    <ChapterTabs active={chapter} onSelect={selectChapter} />
                </div>
            </ConfigurationContext>

            <ConfigurationShell testId={`financials-chapter-shell-${chapter}`}>
                {error ?
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                : loading ?
                    <p className="p-4 text-sm text-alloy-midnight/55">Loading {meta.label}…</p>
                : chapter === "tuition" ?
                    <ConfigWorkspaceCard
                        title="Tuition rates"
                        description="Organization defaults and Location overrides for Program offerings."
                        testId="financials-chapter-tuition"
                    >
                        <TuitionGridWorkspace canManage embedded={false} />
                    </ConfigWorkspaceCard>
                : chapter === "catalog" ?
                    <div data-testid="financials-chapter-catalog">
                        <CommercialCatalogPanel
                            products={products}
                            categories={categories}
                            revenueCategories={revenueCategories}
                            locations={locations}
                            programs={programs}
                            loading={false}
                            canManage
                            onProductCreated={(product) =>
                                setProducts((current) => sortProducts([...current, product]))
                            }
                            onProductUpdated={(product) =>
                                setProducts((current) =>
                                    sortProducts(current.map((item) => (item.id === product.id ? product : item))),
                                )
                            }
                            onProductDeleted={(id) =>
                                setProducts((current) => current.filter((item) => item.id !== id))
                            }
                            onCategoryCreated={(category) =>
                                setCategories((current) => [...current, category])
                            }
                        />
                    </div>
                : chapter === "policies" ?
                    <ConfigWorkspaceCard
                        title="Commercial policies"
                        description="Organization-authored discount, deposit, and commercial rules."
                        testId="financials-chapter-policies"
                    >
                        <CommercialPoliciesPanel programs={programs} locations={locations} />
                    </ConfigWorkspaceCard>
                : chapter === "accounting" ?
                    <div data-testid="financials-chapter-accounting">
                        <AccountingReferencePanel products={products} loading={false} />
                    </div>
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
