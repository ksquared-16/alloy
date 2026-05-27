"use client";

import clsx from "clsx";
import Link from "next/link";
import type { IntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
import {
    opBody,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";
import { intakeWorkspaceBtnPrimary } from "@/components/forms/workspace/IntakeWorkspaceHubView";

type Props = {
    panel: IntakeWorkspaceFilterPanel;
};

/** Inline contextual drill-in for selected workload filter (FD-12). */
export function IntakeWorkspaceFilterPanelView({ panel }: Props) {
    return (
        <section data-testid={`intake-filter-panel-${panel.filter}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={opSectionTitle}>{panel.title}</h2>
                <span className={opMetadata}>
                    {panel.items.length} item{panel.items.length === 1 ? "" : "s"}
                </span>
            </div>
            {panel.items.length === 0 ?
                <p
                    className={clsx(
                        "mt-2 rounded-xl bg-alloy-stone/20 px-3 py-4 text-center ring-1 ring-alloy-midnight/[0.05]",
                        opMetadata
                    )}
                >
                    {panel.empty}
                </p>
            :   <ul className={clsx(opGroupedSurface, "mt-2")}>
                    {panel.items.map((item) => (
                        <li
                            key={item.id}
                            className={clsx(
                                opGroupedRowInner,
                                "flex flex-wrap items-center justify-between gap-3 transition-colors hover:bg-alloy-stone/10"
                            )}
                            data-testid={`intake-filter-item-${item.id}`}
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-alloy-midnight">{item.title}</p>
                                <p className={clsx("mt-0.5", opBody)}>{item.meta}</p>
                            </div>
                            <Link href={item.href} className={intakeWorkspaceBtnPrimary}>
                                {item.cta}
                            </Link>
                        </li>
                    ))}
                </ul>
            }
        </section>
    );
}
