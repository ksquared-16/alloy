"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { commitAdminV2NavLinkNavigation } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
import {
    markConfigurationContinuity,
    prepareConfigurationSoftNavTarget,
} from "@/lib/configRuntime/configurationContinuity";

export type CompactLauncherItem = {
    id: string;
    label: string;
    summary: string;
    href: string;
    /** Optional short includes — keep to ≤3; omit for quieter tiles. */
    includes?: string[];
    statusLabel?: string;
    statusTone?: "default" | "planned" | "utility";
};

/**
 * Compact grouped-configuration launcher — title helper + launch grid only.
 * No conceptual KPI / philosophy cards.
 */
export function CompactConfigurationLauncher({
    helper,
    items,
    testId,
    continuitySurface,
    columnsClassName = "md:grid-cols-2 xl:grid-cols-3",
}: {
    helper?: string;
    items: CompactLauncherItem[];
    testId: string;
    continuitySurface: string;
    columnsClassName?: string;
}) {
    const router = useRouter();

    const open = (href: string) => {
        markConfigurationContinuity("acknowledge", { href, surface: continuitySurface });
        void prepareConfigurationSoftNavTarget(href, (target) => router.prefetch(target));
        // Soft-nav with reload-floor recovery — bare router.push can stall on rewritten
        // `/organization/*` URLs and bounce the operator back to the Organization landing.
        commitAdminV2NavLinkNavigation(href, { router });
    };

    return (
        <div className="flex w-full flex-col gap-3" data-testid={testId}>
            {helper ?
                <p className="text-sm text-alloy-midnight/55" data-testid={`${testId}-helper`}>
                    {helper}
                </p>
            :   null}
            <div
                className={`grid auto-rows-fr items-stretch gap-2 ${columnsClassName}`}
                data-testid={`${testId}-tiles`}
            >
                {items.map((item) => (
                    <article
                        key={item.id}
                        className="flex h-full min-h-[8.5rem] flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
                        data-testid={`${testId}-tile-${item.id}`}
                    >
                        <div className="flex flex-1 flex-col px-3.5 pb-2.5 pt-3">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="text-[14px] font-semibold tracking-tight text-alloy-midnight">
                                    {item.label}
                                </h3>
                                {item.statusLabel ?
                                    <span
                                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                                            item.statusTone === "planned"
                                                ? "border-alloy-stone/30 bg-alloy-stone/15 text-alloy-midnight/55"
                                            : item.statusTone === "utility"
                                                ? "border-alloy-stone/30 bg-alloy-stone/10 text-alloy-midnight/50"
                                            :   "border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] text-alloy-bend-pine"
                                        }`}
                                    >
                                        {item.statusLabel}
                                    </span>
                                :   null}
                            </div>
                            <p className="mt-1 text-[12px] leading-4 text-alloy-midnight/60">{item.summary}</p>
                            {item.includes && item.includes.length > 0 ?
                                <ul className="mt-2 space-y-0.5 text-[10px] leading-[0.85rem] text-alloy-midnight/50">
                                    {item.includes.slice(0, 3).map((line) => (
                                        <li key={line} className="flex items-start gap-1.5">
                                            <span className="mt-[0.3rem] h-1 w-1 shrink-0 rounded-full bg-alloy-bend-pine/65" />
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                            :   null}
                        </div>
                        <button
                            type="button"
                            className="flex w-full items-center justify-between border-t border-alloy-stone/25 bg-alloy-stone/[0.025] px-3.5 py-2 text-left text-[11px] font-semibold text-alloy-bend-pine transition-colors hover:bg-alloy-bend-pine/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
                            data-testid={`${testId}-open-${item.id}`}
                            onClick={() => open(item.href)}
                        >
                            Open {item.label}
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    </article>
                ))}
            </div>
        </div>
    );
}
