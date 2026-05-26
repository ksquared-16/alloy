"use client";

import clsx from "clsx";
import Link from "next/link";
import type { IntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
import { opBody, opGroupedRowInner, opGroupedSurface, opMetadata } from "@/lib/operational/ui/operationalVisualTokens";
import { intakeWorkspaceBtnPrimary } from "@/components/forms/workspace/IntakeWorkspaceHubView";

type Props = {
    panel: IntakeWorkspaceFilterPanel;
};

/** Inline contextual region for selected intake workload filter (FD-1). */
export function IntakeWorkspaceFilterPanelView({ panel }: Props) {
    return (
        <section data-testid={`intake-filter-panel-${panel.filter}`}>
            <h2 className="text-sm font-semibold text-alloy-midnight">{panel.title}</h2>
            <p className={clsx("mt-0.5", opMetadata)}>{panel.lead}</p>

            {panel.items.length === 0 ?
                <p className={clsx("mt-3", opMetadata)}>{panel.empty}</p>
            :   <ul className={clsx(opGroupedSurface, "mt-3")}>
                    {panel.items.map((item) => (
                        <li
                            key={item.id}
                            className={clsx(opGroupedRowInner, "flex flex-wrap items-center justify-between gap-3")}
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
