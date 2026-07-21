"use client";

import {
    ArrowUpRight,
    Boxes,
    KeyRound,
    LayoutTemplate,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigScopeContextBar, ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    markConfigurationContinuity,
    prepareConfigurationSoftNavTarget,
} from "@/lib/configRuntime/configurationContinuity";
import type {
    OrganizationDomainLandingModel,
    OrganizationDomainLandingTile,
} from "@/lib/configRuntime/organizationDomainLandingModel";
import { CANONICAL_ORGANIZATION_BASE } from "@/lib/admin/canonicalAdminRoutes";

export type OrganizationDomainLandingIcon = "boxes" | "key-round" | "workflow" | "layout-template";

const ICONS: Record<OrganizationDomainLandingIcon, LucideIcon> = {
    boxes: Boxes,
    "key-round": KeyRound,
    workflow: Workflow,
    "layout-template": LayoutTemplate,
};

function postureTone(kind: OrganizationDomainLandingTile["kind"]): string {
    if (kind === "utility") return "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-blue";
    if (kind === "boundary") return "border-alloy-forge/10 bg-alloy-stone/[0.08] text-alloy-midnight/50";
    if (kind === "assignment") return "border-alloy-ember/20 bg-alloy-ember/[0.06] text-alloy-ember";
    return "border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] text-alloy-bend-pine";
}

function SectionTile({
    section,
    onOpen,
    testIdPrefix,
}: {
    section: OrganizationDomainLandingTile;
    onOpen: (href: string) => void;
    testIdPrefix: string;
}) {
    return (
        <article
            className="flex h-full min-h-[11rem] flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-testid={`${testIdPrefix}-tile-${section.id}`}
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
                className="flex w-full items-center justify-between border-t border-alloy-stone/25 bg-alloy-stone/[0.025] px-3 py-1.5 text-left text-[11px] font-semibold text-alloy-bend-pine transition-colors hover:bg-alloy-bend-pine/[0.05]"
                data-testid={`${testIdPrefix}-open-${section.id}`}
                onClick={() => onOpen(section.href)}
            >
                Open {section.label}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </button>
        </article>
    );
}

export default function OrganizationDomainLanding({
    model,
    icon,
    testIdPrefix,
}: {
    model: OrganizationDomainLandingModel;
    icon: OrganizationDomainLandingIcon;
    testIdPrefix: string;
}) {
    const router = useRouter();
    const Icon = ICONS[icon];

    const openSection = (href: string) => {
        markConfigurationContinuity("acknowledge", {
            href,
            surface: `${model.domainKey}_landing`,
        });
        void prepareConfigurationSoftNavTarget(href, (target) => router.prefetch(target));
        router.push(href, { scroll: false });
    };

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid={`${testIdPrefix}-landing-page`}>
            <div className="w-full">
                <ConfigurationContext
                    title={model.title}
                    subtitle={model.purpose}
                    titleIcon={<Icon className="h-5 w-5" strokeWidth={2} />}
                    testId={`${testIdPrefix}-landing-context`}
                >
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2">
                        <ConfigScopeContextBar
                            mode="organization"
                            organizationLabel="Organization"
                            objectLabel={model.title}
                            ownershipHint={model.ownershipNote}
                            onModeChange={(mode) => {
                                if (mode === "organization") {
                                    router.push(CANONICAL_ORGANIZATION_BASE);
                                }
                            }}
                        />
                        <ul
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/52"
                            aria-label={`${model.title} breadcrumb`}
                        >
                            <li>
                                <Link
                                    href={CANONICAL_ORGANIZATION_BASE}
                                    className="font-medium hover:text-alloy-bend-pine"
                                >
                                    Organization
                                </Link>
                                <span className="mx-1.5 text-alloy-midnight/35" aria-hidden>
                                    ›
                                </span>
                                <span className="font-semibold text-alloy-midnight/70">{model.title}</span>
                            </li>
                        </ul>
                    </div>
                </ConfigurationContext>
            </div>

            <ConfigurationShell testId={`${testIdPrefix}-landing-shell`}>
                <main className="mx-auto min-w-0 max-w-[1480px] space-y-2.5 pb-3" data-testid={`${testIdPrefix}-landing`}>
                    <div className="grid gap-3 md:grid-cols-3" data-testid={`${testIdPrefix}-landing-summary`}>
                        {model.summaryCards.map((card) => (
                            <ConfigWorkspaceCard
                                key={card.id}
                                compact
                                className="h-full min-h-[7.5rem]"
                                testId={`${testIdPrefix}-summary-${card.id}`}
                            >
                                <section>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                        {card.label}
                                    </p>
                                    <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                                        {card.value}
                                    </p>
                                    <p className="config-typo-sublabel mt-1">{card.detail}</p>
                                </section>
                            </ConfigWorkspaceCard>
                        ))}
                    </div>

                    <ConfigWorkspaceCard compact testId={`${testIdPrefix}-landing-sections-card`}>
                        <div className="mb-2.5">
                            <p className="config-typo-queue-section-label">{model.title} sections</p>
                            <p className="config-typo-sublabel mt-0.5">
                                First-class launch surfaces — existing editors only
                            </p>
                        </div>
                        <div
                            className="grid auto-rows-fr items-stretch gap-2 md:grid-cols-2 xl:grid-cols-3"
                            data-testid={`${testIdPrefix}-landing-tiles`}
                        >
                            {model.tiles.map((section) => (
                                <SectionTile
                                    key={section.id}
                                    section={section}
                                    onOpen={openSection}
                                    testIdPrefix={testIdPrefix}
                                />
                            ))}
                        </div>
                    </ConfigWorkspaceCard>
                </main>
            </ConfigurationShell>
        </div>
    );
}
