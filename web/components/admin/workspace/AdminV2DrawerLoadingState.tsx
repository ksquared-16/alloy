import type { ReactNode } from "react";
import "@/app/adminV2/components/workspace/workspace.css";

type DrawerLoadingDensity = "panel" | "inline" | "micro";

/**
 * Drawer-local loading surface — same motion language as `AdminV2RouteLoadingState` (spinner + track), scaled for panels.
 * No top ribbon (drawer provides chrome).
 */
export function AdminV2DrawerLoadingState({
    title,
    description,
    density = "panel",
    showTrack = true,
    children,
    className = "",
}: {
    title: string;
    description?: string;
    density?: DrawerLoadingDensity;
    showTrack?: boolean;
    children?: ReactNode;
    className?: string;
}) {
    const isMicro = density === "micro";
    const isInline = density === "inline";
    const spinnerLg = !isMicro && !isInline;
    return (
        <div
            className={`rounded-lg border border-admin-border/50 bg-gradient-to-b from-white to-alloy-stone/[0.03] shadow-sm ring-1 ring-alloy-stone/[0.06] ${
                isMicro ? "px-3 py-3" : isInline ? "px-4 py-4" : "px-5 py-6"
            } ${className}`}
            aria-busy="true"
            aria-live="polite"
            aria-label={title}
        >
            <div className={`flex ${isMicro ? "items-center gap-3" : "items-start gap-3"}`}>
                <div
                    className={`flex shrink-0 items-center justify-center rounded-full bg-alloy-forge/[0.06] ${
                        spinnerLg ? "h-11 w-11" : isInline ? "h-9 w-9" : "h-8 w-8"
                    }`}
                    aria-hidden
                >
                    <div
                        className={`rounded-full border-[3px] border-alloy-forge/12 border-t-alloy-forge/70 border-r-alloy-forge/35 animate-spin motion-reduce:animate-none ${
                            spinnerLg ? "h-7 w-7" : isInline ? "h-[18px] w-[18px] border-[2px]" : "h-4 w-4 border-2"
                        }`}
                        style={{ animationDuration: "0.95s" }}
                    />
                </div>
                <div className="min-w-0 flex-1 text-left">
                    <p className={`m-0 font-semibold text-alloy-forge ${isMicro ? "text-xs" : "text-[13px]"}`}>{title}</p>
                    {description ? (
                        <p
                            className={`m-0 text-alloy-forge/62 ${isMicro ? "mt-0.5 text-[11px] leading-snug" : "mt-1 text-[11px] leading-snug"}`}
                        >
                            {description}
                        </p>
                    ) : null}
                    {showTrack && !isMicro ? (
                        <div
                            className={`adminv2-route-loading-track max-w-[11rem] ${isInline ? "mt-3 opacity-[0.92]" : "mt-4"}`}
                            aria-hidden
                        >
                            <div className="adminv2-route-loading-track__bar" />
                        </div>
                    ) : null}
                    {children ? <div className={isMicro ? "mt-0 min-w-0" : "mt-3 min-w-0"}>{children}</div> : null}
                </div>
            </div>
        </div>
    );
}
