"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { CANONICAL_ORGANIZATION_BASE } from "@/lib/admin/canonicalAdminRoutes";

/**
 * Compact shell for grouped configuration landings.
 * Breadcrumb + optional compact title → launch surfaces. No ownership framing,
 * conceptual KPI cards, or duplicated doctrine copy.
 */
export function CompactGroupedLandingShell({
    title,
    titleIcon,
    testIdPrefix,
    children,
}: {
    title: string;
    titleIcon?: ReactNode;
    testIdPrefix: string;
    children: ReactNode;
}) {
    return (
        <div className="process-config-page min-h-0 flex-1" data-testid={`${testIdPrefix}-configuration-page`}>
            <div className="w-full" data-testid={`${testIdPrefix}-content-column`}>
                <ConfigurationContext
                    title={title}
                    titleIcon={titleIcon}
                    testId={`${testIdPrefix}-landing-context`}
                >
                    <ul
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/52"
                        aria-label={`${title} breadcrumb`}
                        data-testid={`${testIdPrefix}-landing-breadcrumb`}
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
                            <span className="font-semibold text-alloy-midnight/70">{title}</span>
                        </li>
                    </ul>
                </ConfigurationContext>
            </div>

            <ConfigurationShell testId={`${testIdPrefix}-landing-shell`}>
                <main
                    className="mx-auto min-w-0 max-w-[1480px] pb-3"
                    data-testid={`${testIdPrefix}-landing-workspace`}
                >
                    {children}
                </main>
            </ConfigurationShell>
        </div>
    );
}
