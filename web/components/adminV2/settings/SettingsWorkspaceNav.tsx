"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import {
    CANONICAL_ADMIN_CONFIG_LANDING,
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    CONFIGURATION_WORKSPACE_ADVANCED_ITEMS,
    CONFIGURATION_WORKSPACE_DOMAINS,
    configurationWorkspaceDomainForPath,
} from "@/lib/adminV2/configurationWorkspaceDomains";

const COLLAPSE_STORAGE_KEY = "alloy:configuration-workspace-nav-collapsed";

function navItemActive(href: string, path: string): boolean {
    const h = href.replace(/\/$/, "");
    const p = path.replace(/\/$/, "");
    if (h === CANONICAL_ADMIN_CONFIG_LANDING) return p === h;
    return p === h || p.startsWith(`${h}/`);
}

export default function SettingsWorkspaceNav() {
    const pathname = usePathname();
    const path = useMemo(() => normalizeToCanonicalAdminPath(pathname), [pathname]);
    const activeDomain = configurationWorkspaceDomainForPath(path);
    const isHub = path === CANONICAL_ADMIN_CONFIG_LANDING || path === "/admin/settings";
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        try {
            setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
        } catch {
            /* ignore */
        }
    }, []);

    const toggleCollapsed = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    return (
        <nav
            className={`flex w-full shrink-0 flex-col gap-4 ${collapsed ? "lg:w-[52px]" : "lg:w-[220px] xl:w-[240px]"}`}
            aria-label="Configuration workspace"
            data-testid="configuration-workspace-nav"
            data-collapsed={collapsed ? "true" : "false"}
        >
            <div className="flex items-center justify-between gap-1 px-1">
                {!collapsed ?
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        Configuration
                    </span>
                :   <span className="sr-only">Configuration</span>}
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    className="rounded-md border border-alloy-forge/12 px-2 py-1 text-[10px] font-medium text-alloy-midnight/55 hover:bg-white/80"
                    aria-label={collapsed ? "Expand configuration sidebar" : "Collapse configuration sidebar"}
                    data-testid="configuration-workspace-nav-toggle"
                >
                    {collapsed ? "»" : "«"}
                </button>
            </div>

            <div>
                <AdminV2NavLink
                    href={CANONICAL_ADMIN_CONFIG_LANDING}
                    active={isHub}
                    className={`block rounded-lg border border-transparent text-sm font-semibold text-alloy-midnight hover:border-alloy-forge/12 hover:bg-white/80 ${
                        collapsed ? "px-2 py-2 text-center" : "px-2.5 py-2"
                    }`}
                    title="Overview"
                >
                    {collapsed ? "◎" : "Overview"}
                </AdminV2NavLink>
            </div>

            {CONFIGURATION_WORKSPACE_DOMAINS.map((domain) => (
                <div key={domain.id} data-configuration-domain={domain.id}>
                    {!collapsed ?
                        <p
                            className={`px-2.5 text-[10px] font-semibold uppercase tracking-wide ${
                                activeDomain === domain.id ? "text-alloy-pine" : "text-alloy-midnight/40"
                            }`}
                        >
                            {domain.label}
                        </p>
                    :   null}
                    <ul className={`mt-1 space-y-0.5 ${collapsed ? "flex flex-col items-center" : ""}`}>
                        {domain.items
                            .filter((item) => !item.advanced)
                            .map((item) => (
                                <li key={item.href} className={collapsed ? "w-full" : undefined}>
                                    <AdminV2NavLink
                                        href={item.href}
                                        active={navItemActive(item.href, path)}
                                        title={item.label}
                                        className={`block rounded-lg text-[13px] leading-snug transition-colors ${
                                            item.emphasis ? "font-semibold" : "font-medium"
                                        } ${
                                            navItemActive(item.href, path)
                                                ? "border border-alloy-pine/25 bg-alloy-pine/[0.06] text-alloy-midnight"
                                                : "border border-transparent text-alloy-midnight/75 hover:border-alloy-forge/10 hover:bg-white/70 hover:text-alloy-midnight"
                                        } ${collapsed ? "px-2 py-2 text-center text-[11px]" : "px-2.5 py-1.5"}`}
                                    >
                                        {collapsed ? item.label.charAt(0) : item.label}
                                    </AdminV2NavLink>
                                </li>
                            ))}
                    </ul>
                </div>
            ))}

            {!collapsed ?
                <div className="rounded-lg border border-dashed border-alloy-forge/18 bg-alloy-stone/[0.04] px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        Advanced
                    </p>
                    <ul className="mt-1 space-y-0.5">
                        {CONFIGURATION_WORKSPACE_ADVANCED_ITEMS.map((item) => (
                            <li key={item.href}>
                                <AdminV2NavLink
                                    href={item.href}
                                    active={navItemActive(item.href, path)}
                                    className="block rounded-md px-1.5 py-1 text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-midnight"
                                >
                                    {item.label}
                                </AdminV2NavLink>
                            </li>
                        ))}
                    </ul>
                </div>
            :   null}
        </nav>
    );
}
