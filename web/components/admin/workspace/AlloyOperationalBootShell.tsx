"use client";

/**
 * Branded first-load / Suspense fallback for the operator workspace shell.
 *
 * Mirrors AdminV2Shell workspace-v2 geometry (sidebar rail, top nav, content column,
 * command-rail column) so cold auth, layout bootstrap, and useSearchParams Suspense
 * never paint a blank page or generic "Loading…" text.
 *
 * Extends existing BOS identity — not a parallel loading runtime.
 */

import Image from "next/image";
import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";
import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";
import { WsRouteLoadingRibbon } from "@/components/admin/workspace/workspaceRouteSkeletons";
import {
    ADMIN_V2_ROUTE_LOADING_VOCABULARY,
    type AdminV2RouteLoadingVariant,
} from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";
import { derived, palette } from "@/styles/tokens/colors";

const SIDEBAR_RAIL_W_PX = 56;
const TOP_NAV_H = "3.75rem";

function BootSidebarRail() {
    return (
        <aside
            className="adminv2-sidebar-shell relative z-[100] flex shrink-0 flex-col overflow-hidden border-r"
            style={{
                width: SIDEBAR_RAIL_W_PX,
                backgroundColor: palette.midnightForge,
                borderColor: derived.topBarDivider,
            }}
            aria-hidden
        >
            <div className="flex h-14 shrink-0 items-center justify-center">
                <Image
                    src="/brand/alloy-brandmark-blue.svg"
                    alt=""
                    width={28}
                    height={28}
                    className="opacity-90 brightness-0 invert"
                    priority
                />
            </div>
        </aside>
    );
}

function BootTopNavBar() {
    return (
        <header
            className="relative z-[100] flex shrink-0 items-center gap-3 px-4"
            style={{ height: TOP_NAV_H, backgroundColor: palette.midnightForge }}
            aria-hidden
        >
            <div
                className="h-[2.375rem] min-w-[min(280px,34vw)] max-w-[min(280px,34vw)] rounded-md opacity-40"
                style={{ backgroundColor: derived.searchBgOnPrimary }}
            />
            <div className="ml-auto flex items-center gap-2">
                <span className="h-9 w-9 rounded-full opacity-35" style={{ backgroundColor: derived.searchBgOnPrimary }} />
            </div>
        </header>
    );
}

function BootWorkspaceContentReserve() {
    return (
        <div className="flex flex-col gap-5 px-6 py-5" aria-hidden>
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="space-y-1.5">
                    <span className="block h-7 w-56 animate-pulse rounded bg-alloy-stone/16" />
                    <span className="block h-4 w-36 animate-pulse rounded bg-alloy-stone/12" />
                </div>
                <div className="flex gap-8">
                    {Array.from({ length: 3 }, (_, i) => (
                        <span
                            key={`boot-kpi-${i}`}
                            className="block h-12 w-20 animate-pulse rounded bg-alloy-stone/12"
                        />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                    <span
                        key={`boot-tile-${i}`}
                        className="block min-h-[10rem] animate-pulse rounded-lg border border-alloy-stone/18 bg-alloy-stone/8"
                    />
                ))}
            </div>
        </div>
    );
}

function BootCommandRailColumn() {
    return (
        <div
            className="adminv2-persistent-command-rail-column hidden min-h-0 shrink-0 flex-col lg:flex"
            data-adminv2-persistent-command-rail="true"
            data-adminv2-workspace-command-column="true"
            aria-hidden
        >
            <div className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell min-h-0 flex-1 border-l border-alloy-stone/10 bg-alloy-stone/[0.03]" />
        </div>
    );
}

export function AlloyOperationalBootShell({
    variant = "workspace",
    showRibbon = true,
    showContentReserve = true,
    chrome = "full",
}: {
    variant?: AdminV2RouteLoadingVariant;
    showRibbon?: boolean;
    showContentReserve?: boolean;
    /**
     * `full` — paints its own sidebar rail + top nav (use ONLY where no AdminV2Shell is mounted,
     * e.g. a Suspense fallback that replaces the whole inner shell).
     * `content` — paints ONLY the content-area loader. Use for any fallback that fills the shell's
     * `{children}` slot (route `loading.tsx`, nested layout boot states): AdminV2Shell already owns
     * the sidebar, top nav, ambient root, and command rail, so painting them again duplicated the
     * midnight-blue chrome inside the content area (Kelly A1). Content mode also centers a LARGER
     * Alloy loading visual instead of a small top-left inline loader + skeleton (Kelly A5).
     */
    chrome?: "full" | "content";
}) {
    const copy = ADMIN_V2_ROUTE_LOADING_VOCABULARY[variant];

    // CONTENT MODE — no chrome, just a centered Alloy loader filling the shell's content slot.
    if (chrome === "content") {
        return (
            <div
                className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-white"
                data-alloy-operational-boot-shell="true"
                data-alloy-operational-boot-variant={variant}
                data-alloy-operational-boot-chrome="content"
                aria-busy="true"
            >
                {/* Single "Thinking…" owner (Kelly): the Alloy mark with the word stacked BELOW it —
                    one calm, consistent loader while the surface prepares, never a per-variant
                    "Loading work unit…"/skeleton chorus. */}
                <div
                    className="flex flex-col items-center gap-5 text-center"
                    data-testid="alloy-operational-boot-loader"
                >
                    {/* 2× the identity visual (largest preset is a 32px mark). Transform-scaled inside
                        a reserved box so the enlarged mark never overlaps the word below it. */}
                    <div className="flex h-44 w-44 items-center justify-center">
                        <AlloyIdentityLoader markSize="lg" showMessage={false} className="scale-[2]" />
                    </div>
                    <p className="text-lg font-semibold text-alloy-midnight">Thinking…</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex h-screen w-full overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
            data-adminv2-app-shell="workspace-v2"
            data-adminv2-workspace-shell="v2"
            data-adminv2-sidebar-collapsed="true"
            data-alloy-operational-boot-shell="true"
            data-alloy-operational-boot-variant={variant}
            aria-busy="true"
        >
            <BootSidebarRail />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <BootTopNavBar />
                <div
                    data-adminv2-workspace-ambient-root
                    className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row"
                    style={{ backgroundColor: "#ffffff" }}
                >
                    <div className="relative z-10 isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        {showRibbon ? <WsRouteLoadingRibbon label={copy.ribbon} /> : null}
                        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            <div className="border-b border-alloy-stone/10 px-6 py-5">
                                <BosExecutionLoader
                                    variant="inline"
                                    title={copy.title}
                                    subtitle={copy.description}
                                    data-testid="alloy-operational-boot-loader"
                                />
                            </div>
                            {showContentReserve ? <BootWorkspaceContentReserve /> : null}
                        </main>
                    </div>
                    <BootCommandRailColumn />
                </div>
            </div>
        </div>
    );
}
