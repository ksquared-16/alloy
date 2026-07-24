"use client";

import Link from "next/link";
import { ArrowUpRight, LibraryBig, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    buildProgramsLocationsLandingTiles,
    type ProgramsLocationsLandingTile,
} from "@/lib/configRuntime/programsLocationsLandingModel";
import {
    markConfigurationContinuity,
    prepareConfigurationSoftNavTarget,
} from "@/lib/configRuntime/configurationContinuity";

function SectionTile({
    section,
    onOpen,
}: {
    section: ProgramsLocationsLandingTile;
    onOpen: (href: string) => void;
}) {
    const Icon = section.id === "programs" ? LibraryBig : MapPin;
    return (
        <article
            className="flex h-full min-h-[12rem] flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-testid={`programs-locations-landing-tile-${section.id}`}
            data-programs-locations-section={section.id}
        >
            <div className="flex flex-1 flex-col px-3.5 pb-2.5 pt-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.06] text-alloy-bend-pine">
                            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </span>
                        <h3 className="text-[15px] font-semibold tracking-tight text-alloy-midnight">
                            {section.label}
                        </h3>
                    </div>
                    <span className="shrink-0 rounded-full border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] px-1.5 py-0.5 text-[9px] font-semibold text-alloy-bend-pine">
                        {section.postureLabel}
                    </span>
                </div>
                <p className="mt-2 text-[12px] leading-4 text-alloy-midnight/60">{section.summary}</p>
                <div className="mt-2 border-t border-alloy-stone/20 pt-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                        Includes
                    </p>
                    <ul className="mt-0.5 space-y-0 text-[10px] leading-[0.85rem] text-alloy-midnight/58">
                        {section.capabilities.map((item) => (
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
                className="flex w-full items-center justify-between border-t border-alloy-stone/25 bg-alloy-stone/[0.025] px-3.5 py-2 text-left text-[11px] font-semibold text-alloy-bend-pine transition-colors hover:bg-alloy-bend-pine/[0.05]"
                data-testid={`programs-locations-landing-open-${section.id}`}
                onClick={() => onOpen(section.href)}
            >
                Open {section.label}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </button>
        </article>
    );
}

export default function ProgramsLocationsLanding() {
    const router = useRouter();
    const tiles = buildProgramsLocationsLandingTiles();

    const openSection = (href: string) => {
        markConfigurationContinuity("acknowledge", {
            href,
            surface: "programs_locations_landing",
        });
        void prepareConfigurationSoftNavTarget(href, (target) => router.prefetch(target));
        router.push(href, { scroll: false });
    };

    return (
        <div className="flex w-full flex-col gap-3" data-testid="programs-locations-landing">
            <div className="grid gap-3 md:grid-cols-3" data-testid="programs-locations-landing-summary">
                <ConfigWorkspaceCard
                    compact
                    className="h-full min-h-[7.5rem]"
                    testId="programs-locations-landing-relationship"
                >
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Relationship
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            One operational system
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            Programs answer what we provide. Locations answer where and how we deliver it.
                        </p>
                    </section>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard
                    compact
                    className="h-full min-h-[7.5rem]"
                    testId="programs-locations-landing-authorship"
                >
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Authorship
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            Define once
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            Organization Programs are authored centrally and assigned to Locations — not duplicated.
                        </p>
                    </section>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard
                    compact
                    className="h-full min-h-[7.5rem]"
                    testId="programs-locations-landing-delivery"
                >
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Delivery
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            Local ownership
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            Each Location owns offering, rooms, capacity, schedule, and local overrides.
                        </p>
                    </section>
                </ConfigWorkspaceCard>
            </div>

            <ConfigWorkspaceCard compact testId="programs-locations-landing-sections-card">
                <div className="mb-2.5">
                    <p className="config-typo-queue-section-label">Launch surfaces</p>
                    <p className="config-typo-sublabel mt-0.5">
                        Separate collections — linked by assignment, not merged into one workspace.{" "}
                        <Link
                            href="/organization/financials"
                            className="font-semibold text-alloy-bend-pine hover:underline"
                        >
                            Financials
                        </Link>{" "}
                        consumes Programs; it does not own them.
                    </p>
                </div>
                <div
                    className="grid auto-rows-fr items-stretch gap-3 md:grid-cols-2"
                    data-testid="programs-locations-landing-tiles"
                >
                    {tiles.map((section) => (
                        <SectionTile key={section.id} section={section} onOpen={openSection} />
                    ))}
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}
