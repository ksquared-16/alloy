"use client";

import clsx from "clsx";
import Link from "next/link";
import type { IntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
import { opBody, opMetadata } from "@/lib/operational/ui/operationalVisualTokens";
import { intakeWorkspaceBtnPrimary } from "@/components/forms/workspace/IntakeWorkspaceHubView";

type Props = {
    panel: IntakeWorkspaceFilterPanel;
};

/** Inline contextual drill-in for selected workload filter (FD-12). */
export function IntakeWorkspaceFilterPanelView({ panel }: Props) {
    return (
        <section data-testid={`intake-filter-panel-${panel.filter}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-alloy-midnight">{panel.title}</h2>
                <span className={opMetadata}>
                    {panel.items.length} item{panel.items.length === 1 ? "" : "s"}
                </span>
            </div>
            {panel.items.length === 0 ?
                <p className={clsx("mt-2 rounded-lg bg-alloy-stone/25 px-3 py-4 text-center", opMetadata)}>
                    {panel.empty}
                </p>
            :   <ul className="mt-2 divide-y divide-alloy-midnight/[0.06]">
                    {panel.items.map((item) => (
                        <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
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
