"use client";

import {
    ConfigAttentionPanel,
    ConfigOperationalReadiness,
    ConfigWorkspaceCard,
    type ConfigAttentionItem,
    type ConfigReadinessArea,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import type {
    ProgramCatalogItem,
    ProgramPublicationSnapshot,
} from "@/lib/programs/publication/programPublicationService";
import type { ProgramPublicationViewModel } from "@/lib/programs/publication/programPublicationViewModel";
import {
    normalizeProgramConfigurationSection,
    type ProgramConfigurationSection,
} from "@/lib/programs/programConfigurationSections";

type ProgramConcernSummary = {
    key: ProgramConfigurationSection;
    label: string;
    value: string;
    detail: string;
    tone: "ready" | "attention" | "neutral";
};

function audienceLabel(program: ProgramCatalogItem): string {
    const minimum = program.draft.audience.minimumAge;
    const maximum = program.draft.audience.maximumAge;
    if (typeof minimum === "number" && typeof maximum === "number") return `Ages ${minimum}–${maximum}`;
    if (typeof minimum === "number") return `Age ${minimum}+`;
    if (typeof maximum === "number") return `Up to age ${maximum}`;
    return "Audience not specified";
}

export function ProgramOverviewSurface({
    program,
    snapshot,
    viewModel,
    onOpenSection,
}: {
    program: ProgramCatalogItem;
    snapshot: ProgramPublicationSnapshot;
    viewModel: ProgramPublicationViewModel;
    onOpenSection: (section: ProgramConfigurationSection) => void;
}) {
    const offerings = snapshot.offerings.filter((offering) => offering.program_key === program.key);
    const offeringIds = new Set(offerings.map((offering) => offering.id));
    const variants = snapshot.variants.filter((variant) => offeringIds.has(variant.offering_id));
    const variantIds = new Set(variants.map((variant) => variant.id));
    const rates = snapshot.tuitionRates.filter((rate) => variantIds.has(rate.variant_id));
    const policies = snapshot.policies.filter(
        (policy) =>
            policy.programKey === program.key
            || (policy.offeringId != null && offeringIds.has(policy.offeringId))
            || (policy.variantId != null && variantIds.has(policy.variantId)),
    );
    const products = snapshot.products.filter((product) => product.program_key === program.key);
    const availability = snapshot.availability.filter(
        (item) => item.programId === program.id || item.programKey === program.key,
    );
    const offeredLocations = availability.filter((item) => item.offered).length;

    const concerns: ProgramConcernSummary[] = [
        {
            key: "definition",
            label: "Definition",
            value: program.draft.category ?? "Category not set",
            detail: audienceLabel(program),
            tone: program.draft.label.trim() ? "ready" : "attention",
        },
        {
            key: "offerings",
            label: "Offerings",
            value: `${offerings.length} ${offerings.length === 1 ? "offering" : "offerings"}`,
            detail: `${variants.length} ${variants.length === 1 ? "variant" : "variants"}`,
            tone: offerings.length > 0 && variants.length > 0 ? "ready" : "attention",
        },
        {
            key: "pricing",
            label: "Pricing",
            value: `${rates.length} ${rates.length === 1 ? "rate" : "rates"}`,
            detail: `${products.length} fees or add-ons · preview available`,
            tone: rates.length > 0 ? "ready" : "attention",
        },
        {
            key: "availability",
            label: "Availability",
            value: `${offeredLocations} of ${snapshot.locations.length} Locations offer`,
            detail: "Location-owned",
            tone: availability.length > 0 ? "ready" : "neutral",
        },
        {
            key: "policies",
            label: "Policies",
            value: `${policies.length} ${policies.length === 1 ? "related policy" : "related policies"}`,
            detail: "Commercial-owned resolution",
            tone: policies.length > 0 ? "ready" : "neutral",
        },
        {
            key: "relationships",
            label: "Relationships",
            value: `${products.length} commercial ${products.length === 1 ? "item" : "items"}`,
            detail: "Accounting and operational ownership preserved",
            tone: products.length > 0 ? "ready" : "neutral",
        },
        {
            key: "publication",
            label: "Publication",
            value: viewModel.runtime.publication.label,
            detail: viewModel.runtime.publication.activeRevisionLabel,
            tone: program.latestPublication ? "ready" : "attention",
        },
        {
            key: "assignment",
            label: "Assignments",
            value: viewModel.runtime.assignment.label,
            detail: `${viewModel.runtime.assignment.currentCount} current · ${viewModel.runtime.assignment.driftCount} need update`,
            tone: viewModel.runtime.assignment.state === "attention" ? "attention" : "ready",
        },
    ];
    const readinessAreas: ConfigReadinessArea[] = viewModel.runtime.readiness.areas.map((area) => ({
        key: area.key,
        label: area.label,
        complete: area.complete,
    }));
    const attentionItems: ConfigAttentionItem[] = viewModel.runtime.attention.map((item) => ({
        key: item.key,
        grade: item.grade,
        label: item.label,
        consequence: item.consequence,
        nextLabel: item.nextLabel,
    }));

    return (
        <div className="space-y-4" data-testid="program-overview">
            <ConfigWorkspaceCard
                title="Program definition"
                description="The Organization-owned identity and purpose that every connected concern builds on."
                testId="program-overview-definition"
            >
                <button
                    type="button"
                    className="grid w-full gap-3 text-left sm:grid-cols-[minmax(0,1fr)_auto]"
                    onClick={() => onOpenSection("definition")}
                >
                    <span>
                        <span className="block text-base font-semibold text-alloy-midnight">{program.draft.label}</span>
                        <span className="mt-1 block text-sm leading-5 text-alloy-midnight/60">
                            {program.draft.description ?? "No Program description yet."}
                        </span>
                    </span>
                    <span className="text-sm font-semibold text-alloy-bend-pine">
                        {program.draft.category ?? "Category not set"} · {audienceLabel(program)} →
                    </span>
                </button>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard
                title="Whole Program posture"
                description="Every Program concern in one operating picture. Open any row for authoritative detail."
                testId="program-overview-concerns"
            >
                <div className="grid gap-x-5 md:grid-cols-2">
                    {concerns.map((concern) => (
                        <button
                            key={concern.key}
                            type="button"
                            className="flex items-center justify-between gap-3 border-b border-alloy-stone/20 py-3 text-left hover:bg-alloy-bend-pine/[0.03]"
                            onClick={() => onOpenSection(concern.key)}
                            data-testid={`program-overview-concern-${concern.key}`}
                        >
                            <span className="min-w-0">
                                <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">
                                    {concern.label}
                                </span>
                                <span className="mt-0.5 block text-sm font-semibold text-alloy-midnight">{concern.value}</span>
                                <span className="mt-0.5 block text-xs text-alloy-midnight/50">{concern.detail}</span>
                            </span>
                            <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                    concern.tone === "ready" ? "bg-alloy-bend-pine"
                                    : concern.tone === "attention" ? "bg-alloy-ember"
                                    : "bg-alloy-stone"
                                }`}
                                aria-hidden
                            />
                        </button>
                    ))}
                </div>
            </ConfigWorkspaceCard>

            <div className="grid items-start gap-4 lg:grid-cols-2">
                <ConfigWorkspaceCard
                    title="Attention"
                    description="The issues that most affect Program readiness now."
                    testId="program-overview-attention"
                >
                    <ConfigAttentionPanel
                        items={attentionItems}
                        embedded
                        compact
                        actionAlign="inline"
                        testId="program-attention"
                        onResolve={(item) => {
                            const source = viewModel.runtime.attention.find((entry) => entry.key === item.key);
                            if (source) onOpenSection(normalizeProgramConfigurationSection(source.section));
                        }}
                    />
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard
                    title="Setup readiness"
                    description="How completely this Program is configured across its owned and connected concerns."
                    testId="program-overview-readiness"
                >
                    <ConfigOperationalReadiness
                        percent={viewModel.runtime.readiness.percent}
                        areas={readinessAreas}
                        embedded
                        compact
                        testId="program-readiness"
                        onSelectArea={(area) => {
                            const source = viewModel.runtime.readiness.areas.find((entry) => entry.key === area.key);
                            if (source) onOpenSection(normalizeProgramConfigurationSection(source.section));
                        }}
                    />
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
