"use client";

import {
    ConfigAttentionPanel,
    ConfigGlanceMetrics,
    ConfigOperationalReadiness,
    ConfigOverviewRuntime,
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
    const publicationReadinessKeys = new Set([
        "identity",
        "requirements",
        "resources",
        "offerings",
        "pricing",
        "policies",
        "relationships",
    ]);
    const publicationAreas = viewModel.runtime.readiness.areas.filter((area) =>
        publicationReadinessKeys.has(area.key),
    );
    const assessedPublicationAreas = publicationAreas.filter((area) => area.complete !== null);
    const completePublicationAreas = assessedPublicationAreas.filter((area) => area.complete === true);
    const publicationReadinessPercent =
        assessedPublicationAreas.length > 0
            ? Math.round((completePublicationAreas.length / assessedPublicationAreas.length) * 100)
            : 0;
    const readinessAreas: ConfigReadinessArea[] = publicationAreas.map((area) => ({
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
    const hasAttention = attentionItems.some((item) => item.grade !== "good");
    const capabilities: Array<{
        key: "relationships" | "publication" | "assignment";
        label: string;
        status: string;
        detail: string;
        tone: "complete" | "setup" | "unknown";
    }> = [
        {
            key: "relationships",
            label: "Relationships",
            status: `${products.length} commercial ${products.length === 1 ? "item" : "items"}`,
            detail: "Accounting and operational ownership preserved",
            tone: products.length > 0 ? "complete" : "unknown",
        },
        {
            key: "publication",
            label: "Publication",
            status: viewModel.runtime.publication.label,
            detail: viewModel.runtime.publication.activeRevisionLabel,
            tone: program.latestPublication ? "complete" : "setup",
        },
        {
            key: "assignment",
            label: "Assignments",
            status: viewModel.runtime.assignment.label,
            detail: `${viewModel.runtime.assignment.currentCount} current · ${viewModel.runtime.assignment.driftCount} need update`,
            tone:
                viewModel.runtime.assignment.state === "attention" ? "setup"
                : viewModel.runtime.assignment.assignedCount > 0 ? "complete"
                : "unknown",
        },
    ];

    return (
        <ConfigOverviewRuntime
            testId="program-overview"
            glance={
                <ConfigWorkspaceCard
                    compact
                    className="flex h-full flex-col"
                    testId="program-overview-at-a-glance"
                >
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-[17px] font-semibold tracking-tight text-alloy-midnight">
                                At a glance
                            </h2>
                            <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/50">
                                The service model and connected posture for this Program.
                            </p>
                        </div>
                        <span className="rounded-full border border-alloy-stone/25 bg-alloy-stone/[0.06] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                            Program picture
                        </span>
                    </div>
                    <ConfigGlanceMetrics
                        bare
                        layout="grid"
                        testId="program-overview-glance"
                        metrics={[
                            {
                                key: "offerings",
                                label: "Offerings",
                                icon: "programs",
                                tone: offerings.length > 0 && variants.length > 0 ? "ready" : "attention",
                                value: String(offerings.length),
                                hint: `${variants.length} ${variants.length === 1 ? "variant" : "variants"}`,
                                onSelect: () => onOpenSection("offerings"),
                            },
                            {
                                key: "pricing",
                                label: "Pricing",
                                icon: "pricing",
                                tone: rates.length > 0 ? "ready" : "attention",
                                value: String(rates.length),
                                hint: `${products.length} fees or add-ons`,
                                onSelect: () => onOpenSection("pricing"),
                            },
                            {
                                key: "availability",
                                label: "Availability",
                                icon: "availability",
                                tone: availability.length > 0 ? "ready" : "default",
                                value: `${offeredLocations}/${snapshot.locations.length}`,
                                hint: "Locations offering",
                                onSelect: () => onOpenSection("availability"),
                            },
                            {
                                key: "policies",
                                label: "Policies",
                                icon: "policies",
                                tone: policies.length > 0 ? "ready" : "default",
                                value: String(policies.length),
                                hint: "Commercial-owned rules",
                                onSelect: () => onOpenSection("policies"),
                            },
                        ]}
                    />
                    <button
                        type="button"
                        className="mt-auto flex items-center justify-between gap-3 border-t border-alloy-stone/20 pt-4 text-left hover:bg-alloy-bend-pine/[0.03]"
                        onClick={() => onOpenSection("definition")}
                        data-testid="program-overview-definition"
                    >
                        <span>
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">
                                What is this Program?
                            </span>
                            <span className="mt-1 block text-sm font-semibold text-alloy-midnight">
                                {program.draft.category ?? "Category not set"} · {audienceLabel(program)}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-alloy-midnight/50">
                                {program.draft.description ?? "No Program description yet."}
                            </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-alloy-bend-pine">Review →</span>
                    </button>
                </ConfigWorkspaceCard>
            }
            readiness={
                <ConfigWorkspaceCard
                    title="Publication readiness"
                    description="What is configured before a revision is ready."
                    compact
                    className="h-full"
                    testId="program-overview-readiness"
                >
                    <ConfigOperationalReadiness
                        percent={publicationReadinessPercent}
                        areas={readinessAreas}
                        embedded
                        compact
                        testId="program-readiness"
                        onSelectArea={(area) => {
                            const source = publicationAreas.find((entry) => entry.key === area.key);
                            if (source) onOpenSection(normalizeProgramConfigurationSection(source.section));
                        }}
                    />
                </ConfigWorkspaceCard>
            }
            attention={
                hasAttention ?
                    <ConfigWorkspaceCard compact className="h-full" testId="program-overview-attention">
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
                :   undefined
            }
            capabilities={
                <ConfigWorkspaceCard
                    title="How this Program works"
                    description="Connected capabilities and lifecycle posture."
                    compact
                    className="h-full"
                    testId="program-overview-capabilities"
                >
                    <ul className="divide-y divide-alloy-forge/10" data-testid="program-overview-concerns">
                        {capabilities.map((item) => (
                            <li key={item.key}>
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0 hover:bg-alloy-bend-pine/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
                                    onClick={() => onOpenSection(item.key)}
                                    data-testid={`program-overview-concern-${item.key}`}
                                >
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-alloy-midnight">{item.label}</span>
                                        <span className="mt-0.5 block text-[12px] leading-snug text-alloy-midnight/50">
                                            {item.status} · {item.detail}
                                        </span>
                                    </span>
                                    <span
                                        className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                            item.tone === "complete"
                                                ? "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                            : item.tone === "setup"
                                                ? "border-alloy-ember/25 bg-alloy-ember/[0.07] text-alloy-ember"
                                                : "border-alloy-stone/25 bg-alloy-stone/[0.05] text-alloy-midnight/40"
                                        }`}
                                    >
                                        {item.tone === "complete" ? "Ready" : item.tone === "setup" ? "Needs attention" : "Not assessed"}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </ConfigWorkspaceCard>
            }
        />
    );
}
