"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    buildFinancialsLandingSections,
    type FinancialsLandingSectionTile,
} from "@/lib/financials/financialsLandingModel";
import {
    markConfigurationContinuity,
    prepareConfigurationSoftNavTarget,
} from "@/lib/configRuntime/configurationContinuity";

function postureTone(kind: FinancialsLandingSectionTile["kind"]): string {
    if (kind === "utility") {
        return "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-blue";
    }
    if (kind === "boundary") {
        return "border-alloy-forge/10 bg-alloy-stone/[0.08] text-alloy-midnight/50";
    }
    return "border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] text-[#007d68]";
}

function SectionTile({
    section,
    onOpen,
}: {
    section: FinancialsLandingSectionTile;
    onOpen: (href: string) => void;
}) {
    return (
        <article
            className="flex h-full min-h-[11rem] flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-testid={`financials-landing-tile-${section.id}`}
            data-financials-section={section.id}
            data-financials-kind={section.kind}
        >
            <div className="flex flex-1 flex-col px-3 pb-2.5 pt-2.5">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="pt-0.5 text-[14px] font-semibold tracking-tight text-alloy-midnight">
                        {section.label}
                    </h3>
                    <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${postureTone(section.kind)}`}
                    >
                        {section.postureLabel}
                    </span>
                </div>
                <p className="mt-0.5 line-clamp-2 min-h-7 text-[11px] leading-4 text-alloy-midnight/55">
                    {section.summary}
                </p>
                <div className="mt-1.5 border-t border-alloy-stone/20 pt-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                        Includes
                    </p>
                    <ul className="mt-0.5 space-y-0 text-[10px] leading-[0.85rem] text-alloy-midnight/58">
                        {section.capabilities.slice(0, 4).map((item) => (
                            <li key={item} className="flex items-start gap-1.5">
                                <span className="mt-[0.3rem] h-1 w-1 shrink-0 rounded-full bg-alloy-bend-pine/65" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <button
                type="button"
                className="flex w-full items-center justify-between border-t border-alloy-stone/25 bg-alloy-stone/[0.025] px-3 py-1.5 text-left text-[11px] font-semibold text-[#007d68] transition-colors hover:bg-alloy-bend-pine/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
                data-testid={`financials-landing-open-${section.id}`}
                onClick={() => onOpen(section.href)}
            >
                Open {section.label}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </button>
        </article>
    );
}

export default function FinancialsLanding() {
    const router = useRouter();
    const sections = buildFinancialsLandingSections();

    const openSection = (href: string) => {
        markConfigurationContinuity("acknowledge", { href, surface: "financials_landing" });
        void prepareConfigurationSoftNavTarget(href, (target) => router.prefetch(target));
        router.push(href, { scroll: false });
    };

    return (
        <div className="flex w-full flex-col gap-3" data-testid="financials-landing">
            <div className="grid gap-3 md:grid-cols-3" data-testid="financials-landing-summary">
                <ConfigWorkspaceCard compact className="h-full min-h-[7.5rem]" testId="financials-landing-domains">
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Financial domains
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            {sections.length}
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            Tuition, catalog, policies, accounting, simulator, and funding boundary
                        </p>
                    </section>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full min-h-[7.5rem]" testId="financials-landing-entry">
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            How to start
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            Choose a domain
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            Open Tuition for rates, Catalog for fees, or Policies for discounts — no default selection
                        </p>
                    </section>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full min-h-[7.5rem]" testId="financials-landing-programs-boundary">
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Programs
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            Separate domain
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            Service catalog and Delivery Options stay under{" "}
                            <Link href="/organization/programs" className="font-semibold text-alloy-bend-pine hover:underline">
                                Programs
                            </Link>
                            — not inside Financials
                        </p>
                    </section>
                </ConfigWorkspaceCard>
            </div>

            <ConfigWorkspaceCard compact testId="financials-landing-sections-card">
                <div className="mb-2.5">
                    <p className="config-typo-queue-section-label">Financials sections</p>
                    <p className="config-typo-sublabel mt-0.5">
                        First-class launch surfaces — open only the domain you need
                    </p>
                </div>
                <div
                    className="grid auto-rows-fr items-stretch gap-2 md:grid-cols-2 xl:grid-cols-3"
                    data-testid="financials-landing-tiles"
                >
                    {sections.map((section) => (
                        <SectionTile key={section.id} section={section} onOpen={openSection} />
                    ))}
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}
