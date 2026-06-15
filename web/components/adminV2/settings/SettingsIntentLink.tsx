"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { markSettingsRouteSwitchStart } from "@/lib/perf/settingsRoutePerf";

type SettingsIntentLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
    children: ReactNode;
};

/**
 * Settings navigation with intent-based RSC prefetch — avoids viewport prefetch tax
 * on heavy settings routes while warming likely next clicks on hover/focus.
 */
export default function SettingsIntentLink({ href, children, onMouseEnter, onFocus, onClick, ...rest }: SettingsIntentLinkProps) {
    const router = useRouter();
    const path = typeof href === "string" ? href : href.pathname ?? "";

    const warm = () => {
        if (!path) return;
        markSettingsRouteSwitchStart(path, "intent");
        try {
            router.prefetch(path);
        } catch {
            /* prefetch optional */
        }
    };

    return (
        <Link
            href={href}
            prefetch={false}
            onMouseEnter={(e) => {
                warm();
                onMouseEnter?.(e);
            }}
            onFocus={(e) => {
                warm();
                onFocus?.(e);
            }}
            onClick={(e) => {
                if (path) markSettingsRouteSwitchStart(path, "click");
                onClick?.(e);
            }}
            {...rest}
        >
            {children}
        </Link>
    );
}
