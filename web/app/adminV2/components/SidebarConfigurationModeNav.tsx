"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Home, Settings } from "lucide-react";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import {
    CONFIGURATION_MODE_NAV_GROUPS,
    configurationModeNavItemActive,
} from "@/lib/adminV2/configurationModeNav";
import { configurationModeNavLucideIcon } from "@/lib/adminV2/configurationModeNavIcons";
import { writeConfigurationModeLastSurface } from "@/lib/adminV2/configurationModeLastSurface";
import {
    CANONICAL_OPERATOR_BASE,
    CANONICAL_SETTINGS_BASE,
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import { appendWorkspaceSiteToPath, readStickyWorkspaceSiteIdForNavigation } from "@/lib/adminV2/workspaceSiteFilterClient";

const EXPANDED_CONFIG_LINK =
    "adminv2-sidebar-config-link block w-full rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors";

function workspaceHref(path: string): string {
    return appendWorkspaceSiteToPath(path, readStickyWorkspaceSiteIdForNavigation());
}

export default function SidebarConfigurationModeNav({ collapsed }: { collapsed: boolean }) {
    const pathname = usePathname();
    const path = useMemo(() => normalizeToCanonicalAdminPath(pathname), [pathname]);
    const homeHref = workspaceHref(CANONICAL_OPERATOR_BASE);
    const settingsHomeHref = CANONICAL_SETTINGS_BASE;
    const onSettingsHome = path === CANONICAL_SETTINGS_BASE;

    useEffect(() => {
        if (path !== "/settings") writeConfigurationModeLastSurface(path);
    }, [path]);

    const homeLink = (
        <AdminV2NavLink
            href={homeHref}
            title="Workspace home"
            aria-label="Workspace home"
            active={false}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_CONFIG_LINK}
            data-testid="config-mode-nav-home"
        >
            {collapsed ?
                <Home size={18} strokeWidth={1.75} />
            :   <span className="inline-flex items-center gap-2">
                    <Home size={15} strokeWidth={1.75} className="shrink-0" />
                    <span className="truncate">Home</span>
                </span>
            }
        </AdminV2NavLink>
    );

    const settingsHomeLink = (
        <AdminV2NavLink
            href={settingsHomeHref}
            title="Settings"
            aria-label="Settings"
            active={onSettingsHome}
            className={
                collapsed
                    ? `adminv2-sidebar-rail-link ${onSettingsHome ? "adminv2-sidebar-config-link--active" : ""}`
                    : `${EXPANDED_CONFIG_LINK} ${
                          onSettingsHome
                              ? "adminv2-sidebar-config-link--active"
                              : "text-white/75 hover:bg-white/[0.06] hover:text-white/90"
                      }`
            }
            data-testid="config-mode-nav-settings-home"
        >
            {collapsed ?
                <Settings size={18} strokeWidth={1.75} />
            :   <span className="inline-flex items-center gap-2">
                    <Settings size={15} strokeWidth={1.75} className="shrink-0" />
                    <span className="truncate">Settings</span>
                </span>
            }
        </AdminV2NavLink>
    );

    const configGroupLinks = CONFIGURATION_MODE_NAV_GROUPS.map((group, groupIndex) => {
        const groupItems = group.items.map((item) => {
            const Icon = configurationModeNavLucideIcon(item.icon);
            const active = configurationModeNavItemActive(item.href, path);

            if (collapsed) {
                return (
                    <AdminV2NavLink
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        aria-label={item.label}
                        active={active}
                        className={`adminv2-sidebar-rail-link ${active ? "adminv2-sidebar-config-link--active" : ""}`}
                        data-testid={item.testId}
                    >
                        <Icon size={18} strokeWidth={1.75} />
                    </AdminV2NavLink>
                );
            }

            return (
                <li key={item.href}>
                    <AdminV2NavLink
                        href={item.href}
                        active={active}
                        className={`${EXPANDED_CONFIG_LINK} ${
                            active
                                ? "adminv2-sidebar-config-link--active"
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
        });

        if (collapsed) {
            return <div key={group.id}>{groupItems}</div>;
        }

        return (
            <div key={group.id} data-testid={`config-mode-nav-group-${group.id}`}>
                {groupIndex > 0 ?
                    <div className="mx-2 my-2 border-t border-white/10" aria-hidden />
                :   null}
                <p className="adminv2-sidebar-section-label mb-1 px-2 text-[11px] font-semibold tracking-wide">
                    {group.label}
                </p>
                <ul className="adminv2-sidebar-config-list list-none space-y-0.5 px-1">{groupItems}</ul>
            </div>
        );
    });

    if (collapsed) {
        return (
            <nav className="flex min-h-0 flex-1 flex-col gap-1 px-1.5 pt-1" aria-label="Configuration mode">
                {homeLink}
                {configGroupLinks}
                <div className="mt-auto">{settingsHomeLink}</div>
            </nav>
        );
    }

    return (
        <nav
            className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1"
            aria-label="Configuration mode"
            data-testid="configuration-mode-sidebar-nav"
        >
            <div className="mb-2 px-1">{homeLink}</div>
            <div className="min-h-0 flex-1">{configGroupLinks}</div>
            <div className="mt-2 border-t border-white/10 px-1 pt-2">{settingsHomeLink}</div>
        </nav>
    );
}
