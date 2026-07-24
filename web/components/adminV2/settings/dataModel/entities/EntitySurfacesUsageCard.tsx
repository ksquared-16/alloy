"use client";

/**
 * Where a Data Model object shows up in Surfaces — Focus Panels and Queue Rows.
 * Links into `/organization/surfaces` (not a detached editor).
 */

import Link from "next/link";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { surfacesSectionHref } from "@/lib/configRuntime/surfacesLandingModel";

const SURFACE_USAGE_ROWS = [
    {
        id: "focus-panels",
        label: "Focus Panels",
        description: "Side evidence panels on work records",
        href: surfacesSectionHref("focus-panels"),
    },
    {
        id: "queue-rows",
        label: "Queue Rows",
        description: "Queue preview rows for each process",
        href: surfacesSectionHref("queue-rows"),
    },
] as const;

export function EntitySurfacesUsageCard({
    title = "Where this is used",
    testId = "entity-surfaces-usage",
}: {
    title?: string;
    testId?: string;
}) {
    return (
        <ConfigWorkspaceCard title={title} compact testId={testId}>
            <ul className="space-y-2" data-testid={`${testId}-list`}>
                {SURFACE_USAGE_ROWS.map((row) => (
                    <li key={row.id}>
                        <Link
                            href={row.href}
                            className="group flex items-baseline justify-between gap-2 text-[12px] text-alloy-midnight hover:text-alloy-bend-pine"
                            data-testid={`${testId}-${row.id}`}
                        >
                            <span className="font-medium group-hover:underline">{row.label}</span>
                            <span className="text-right text-[11px] text-alloy-midnight/45">{row.description}</span>
                        </Link>
                    </li>
                ))}
            </ul>
            <p className="mt-2.5 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/50">
                Open Surfaces to configure Focus Panels and Queue Rows that present this entity.
            </p>
        </ConfigWorkspaceCard>
    );
}
