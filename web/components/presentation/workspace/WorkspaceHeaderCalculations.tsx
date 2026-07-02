/**
 * Presentation Runtime V2 — WS.HEADER_CALCULATIONS.
 *
 * The published "Workspace Header" surface strip: one card per configured placement,
 * rendered with the SAME renderers the /settings/surfaces preview uses
 * (`MetricKpiCard` / `MetricTrendCard`, density="compact") so what the operator publishes
 * is exactly what the workspace shows. Pure presentation: receives resolved
 * `WorkspaceHeaderCalculationCardVm`s from WorkspaceSurface, never fetches. Cards with a
 * drill target link to the canonical work-unit route; the link never alters card chrome.
 */

import Link from "next/link";
import type { WorkspaceHeaderCalculationCardVm } from "@/lib/presentation/runtime";
import { resolveAccentFromHealth } from "@/lib/metrics/platform/metricSourceRegistry";
import { MetricKpiCard } from "@/components/admin/metrics/MetricKpiCard";
import { MetricTrendCard } from "@/components/admin/metrics/MetricTrendCard";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

/** Parity with the surface preview: configured accent wins, else derive from health. */
function CalculationCard({ card }: { card: WorkspaceHeaderCalculationCardVm }) {
    const accent = card.accent ?? resolveAccentFromHealth(card.status);
    if (card.vizType === "trend") {
        return (
            <MetricTrendCard
                label={card.label}
                value={card.formattedValue}
                status={card.status}
                accent={accent}
                density="compact"
                showHealthChip={card.showHealthChip}
            />
        );
    }
    return (
        <MetricKpiCard
            label={card.label}
            value={card.formattedValue}
            status={card.status}
            accent={accent}
            density="compact"
            showHealthChip={card.showHealthChip}
        />
    );
}

export function WorkspaceHeaderCalculations({
    cards,
}: {
    cards: WorkspaceHeaderCalculationCardVm[];
}) {
    if (!cards.length) return null;
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workspaceHeaderCalculations)}
            data-alloy-section="WS.HEADER_CALCULATIONS"
            className="flex flex-wrap items-stretch gap-2"
            role="list"
            aria-label="Workspace calculations"
        >
            {cards.map((card) =>
                card.drillHref ? (
                    <Link
                        key={card.sourceKey}
                        href={card.drillHref}
                        role="listitem"
                        data-calculation-key={card.sourceKey}
                        className="shrink-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-alloy-juniper/60"
                    >
                        <CalculationCard card={card} />
                    </Link>
                ) : (
                    <div
                        key={card.sourceKey}
                        role="listitem"
                        data-calculation-key={card.sourceKey}
                        className="shrink-0"
                    >
                        <CalculationCard card={card} />
                    </div>
                ),
            )}
        </div>
    );
}
