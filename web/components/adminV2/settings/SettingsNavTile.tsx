"use client";

import type { ReactNode } from "react";
import SettingsIntentLink from "@/components/adminV2/settings/SettingsIntentLink";
import { settingsSurfacePrefix, type SettingsSurfaceMode } from "@/lib/adminV2/settingsSurfaceModes";

const TILE_MIN_H = "min-h-[4.75rem]";

export function SettingsNavTile({
    href,
    title,
    children,
    emphasis = false,
    mode,
    variant = "tile",
}: {
    href: string;
    title: string;
    children: ReactNode;
    emphasis?: boolean;
    mode?: SettingsSurfaceMode;
    variant?: "tile" | "diagnostic";
}) {
    const description = mode ? `${settingsSurfacePrefix(mode)}${children}` : children;

    if (variant === "diagnostic") {
        return (
            <SettingsIntentLink
                href={href}
                className="block rounded-md border border-dashed border-alloy-forge/22 bg-white/40 px-3 py-2 text-sm transition-colors hover:border-alloy-forge/35 hover:bg-white/70"
            >
                <span className="font-medium text-alloy-midnight/85">{title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-alloy-midnight/50">{description}</span>
            </SettingsIntentLink>
        );
    }

    return (
        <SettingsIntentLink
            href={href}
            className={[
                "group flex h-full flex-col justify-center rounded-lg border px-3 py-2.5 shadow-sm transition-colors",
                TILE_MIN_H,
                emphasis
                    ? "border-alloy-pine/25 bg-alloy-pine/[0.06] hover:bg-alloy-pine/[0.1]"
                    : "border-alloy-forge/12 bg-white/60 hover:bg-white/85",
            ].join(" ")}
        >
            <div className="text-sm font-semibold leading-tight text-alloy-midnight group-hover:text-alloy-pine">{title}</div>
            <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-alloy-midnight/55">{description}</div>
        </SettingsIntentLink>
    );
}

export function SettingsNavGroup({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="space-y-3 rounded-xl border border-alloy-forge/10 bg-white/50 px-4 py-3.5">
            <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">{label}</h2>
                {description ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/45">{description}</p>
                ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>
        </section>
    );
}
