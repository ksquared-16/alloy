"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    organizationProgramsChapterHref,
    PROGRAMS_WORKSPACE_CHAPTER_META,
    PROGRAMS_WORKSPACE_CHAPTERS,
    type ProgramsWorkspaceChapter,
} from "@/lib/commercial/commercialChapterRoutes";
import { sortProducts, type CommercialCategory, type CommercialProduct, type CommercialRevenueCategory } from "@/lib/commercial/commercialProducts";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import {
    loadProgramsChapterContext,
    peekProgramsChapterContext,
} from "@/lib/programs/programsChapterContextCache";

function ChapterTabs({
    active,
    onSelect,
}: {
    active: ProgramsWorkspaceChapter;
    onSelect: (chapter: ProgramsWorkspaceChapter) => void;
}) {
    return (
        <div
            className="flex flex-wrap items-end gap-1 border-b border-alloy-stone/20"
            data-testid="programs-workspace-chapter-tabs"
            role="tablist"
            aria-label="Programs workspace chapters"
        >
            {PROGRAMS_WORKSPACE_CHAPTERS.map((chapter) => {
                const selected = chapter === active;
                return (
                    <button
                        key={chapter}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        data-testid={`programs-workspace-chapter-${chapter}`}
                        onClick={() => onSelect(chapter)}
                        className={`px-3 py-2 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 rounded-sm ${
                            selected
                                ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"
                        }`}
                    >
                        {PROGRAMS_WORKSPACE_CHAPTER_META[chapter].label}
                    </button>
                );
            })}
        </div>
    );
}

export default function ProgramsWorkspaceChapterSurface({
    chapter,
    orgId,
}: {
    chapter: ProgramsWorkspaceChapter;
    orgId: string;
}) {
    const router = useRouter();
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

    const meta = PROGRAMS_WORKSPACE_CHAPTER_META[chapter];
    const selectChapter = (next: ProgramsWorkspaceChapter) => {
        router.push(organizationProgramsChapterHref(next), { scroll: false });
    };

    return (
        <div className="min-h-0 flex-1" data-testid="programs-workspace-chapter-surface" data-chapter={chapter}>
            <ConfigurationContext
                title={meta.label}
                subtitle={meta.description}
                testId={`programs-chapter-context-${chapter}`}
            >
                <div className="flex flex-wrap items-center gap-1.5 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/45">
                    <button
                        type="button"
                        className="font-medium hover:text-alloy-bend-pine"
                        onClick={() => router.push("/organization/programs")}
                        data-testid="programs-chapter-breadcrumb-programs"
                    >
                        Programs
                    </button>
                    <span aria-hidden>›</span>
                    <span className="font-semibold text-alloy-midnight/65">{meta.label}</span>
                </div>
                <div className="mt-2">
                    <ChapterTabs active={chapter} onSelect={selectChapter} />
                </div>
            </ConfigurationContext>

            <ConfigurationShell testId={`programs-chapter-shell-${chapter}`}>
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
                        testId="programs-chapter-tuition"
                    >
                        <TuitionGridWorkspace canManage embedded={false} />
                    </ConfigWorkspaceCard>
                : chapter === "catalog" ?
                    <div data-testid="programs-chapter-catalog">
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
                        testId="programs-chapter-policies"
                    >
                        <CommercialPoliciesPanel programs={programs} locations={locations} />
                    </ConfigWorkspaceCard>
                : chapter === "accounting" ?
                    <div data-testid="programs-chapter-accounting">
                        <AccountingReferencePanel products={products} loading={false} />
                    </div>
                : chapter === "simulator" ?
                    <ConfigWorkspaceCard
                        title="Commercial simulator"
                        description="Preview how commercial execution resolves for a Program and schedule."
                        testId="programs-chapter-simulator"
                    >
                        <CommercialSimulatorPanel programs={programs} cadences={cadences} />
                    </ConfigWorkspaceCard>
                :
                    <ConfigWorkspaceCard
                        title="Funding"
                        description="Payment responsibility stays in Processing."
                        testId="programs-chapter-funding"
                    >
                        <div className="max-w-lg space-y-2 py-2 text-sm text-alloy-midnight/65">
                            <p className="font-semibold text-alloy-midnight">Funding is managed in Processing</p>
                            <p>
                                Who pays — private pay, subsidies, employer sponsorship, and splits — is configured
                                through the Processing Platform. Programs and Commercial set price and catalog;
                                Processing decides responsibility.
                            </p>
                        </div>
                    </ConfigWorkspaceCard>
                }
            </ConfigurationShell>
        </div>
    );
}
