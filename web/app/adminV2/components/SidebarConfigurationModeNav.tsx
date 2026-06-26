"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import {
    CONFIGURATION_MODE_NAV_ITEMS,
    configurationModeNavItemActive,
} from "@/lib/adminV2/configurationModeNav";
import { configurationModeNavLucideIcon } from "@/lib/adminV2/configurationModeNavIcons";
import { writeConfigurationModeLastSurface } from "@/lib/adminV2/configurationModeLastSurface";
import { normalizeToCanonicalAdminPath } from "@/lib/admin/canonicalAdminRoutes";

const EXPANDED_CONFIG_LINK =
    "adminv2-sidebar-config-link block w-full rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors";

export default function SidebarConfigurationModeNav({ collapsed }: { collapsed: boolean }) {
    const pathname = usePathname();
    const path = useMemo(() => normalizeToCanonicalAdminPath(pathname), [pathname]);

    useEffect(() => {
        if (path !== "/settings") writeConfigurationModeLastSurface(path);
    }, [path]);

    if (collapsed) {
        return (
            <nav className="flex min-h-0 flex-1 flex-col gap-1 px-1.5 pt-1" aria-label="Configuration mode">
                {CONFIGURATION_MODE_NAV_ITEMS.map((item) => {
                    const Icon = configurationModeNavLucideIcon(item.icon);
                    return (
                        <AdminV2NavLink
                            key={item.href}
                            href={item.href}
                            title={item.label}
                            aria-label={item.label}
                            active={configurationModeNavItemActive(item.href, path)}
                            className="adminv2-sidebar-rail-link"
                            data-testid={item.testId}
                        >
                            <Icon size={18} strokeWidth={1.75} />
                        </AdminV2NavLink>
                    );
                })}
            </nav>
        );
    }

    return (
        <nav
            className="min-h-0 flex-1 overflow-y-auto pt-2"
            aria-label="Configuration mode"
            data-testid="configuration-mode-sidebar-nav"
        >
            <p className="adminv2-sidebar-section-label mb-1 px-2 text-[11px] font-semibold tracking-wide">
                Configuration
            </p>
            <ul className="adminv2-sidebar-config-list list-none space-y-0.5 px-1">
                {CONFIGURATION_MODE_NAV_ITEMS.map((item) => {
                    const Icon = configurationModeNavLucideIcon(item.icon);
                    const active = configurationModeNavItemActive(item.href, path);
                    return (
                        <li key={item.href}>
                            <AdminV2NavLink
                                href={item.href}
                                active={active}
                                className={`${EXPANDED_CONFIG_LINK} ${
                                    active
                                        ? "adminv2-sidebar-config-link--active bg-white/[0.08] text-white"
                                        : "text-white/75 hover:bg-white/[0.06] hover:text-white/90"
                                }`}
                                title={item.label}
                                data-testid={item.testId}
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </span>
                            </AdminV2NavLink>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
