"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { ChevronRight } from "lucide-react";
import { derived, neutral } from "@/styles/tokens/colors";

const SETTINGS_ROOT = "/adminV2/settings";

/** Normalize rewrites so `/admin/v2/settings/...` and `/adminv2/...` match route logic. */
function normalizedPathname(pathname: string): string {
    if (pathname === "/admin/v2" || pathname.startsWith("/admin/v2/")) {
        if (pathname === "/admin/v2") return "/adminV2/workspace";
        return `/adminV2${pathname.slice("/admin/v2".length)}`;
    }
    if (pathname === "/adminv2" || pathname.startsWith("/adminv2/")) {
        return `/adminV2${pathname.slice("/adminv2".length)}`;
    }
    return pathname;
}

type Crumb = { label: string; href: string | null };

function crumbsForPath(path: string): Crumb[] {
    if (!path.startsWith(SETTINGS_ROOT)) {
        return [{ label: "Settings", href: null }];
    }

    const tail = path.slice(SETTINGS_ROOT.length);
    if (tail === "" || tail === "/") {
        return [{ label: "Settings", href: null }];
    }

    const base: Crumb[] = [{ label: "Settings", href: SETTINGS_ROOT }];

    if (tail.startsWith("/documents/document-fields")) {
        base.push({ label: "Document field definitions", href: null });
        return base;
    }

    if (tail.startsWith("/option-sets")) {
        const detailMatch = /^\/option-sets\/([^/]+)\/?$/.exec(tail);
        if (detailMatch) {
            base.push({ label: "Option sets", href: `${SETTINGS_ROOT}/option-sets` });
            const raw = detailMatch[1];
            let key = raw;
            try {
                key = decodeURIComponent(raw);
            } catch {
                /* keep raw */
            }
            base.push({ label: key, href: null });
        } else {
            base.push({ label: "Option sets", href: null });
        }
        return base;
    }

    if (tail === "/statuses" || tail.startsWith("/statuses/")) {
        base.push({ label: "Statuses", href: null });
        return base;
    }

    if (tail === "/field-sections" || tail.startsWith("/field-sections/")) {
        base.push({ label: "Field grouping catalog", href: null });
        return base;
    }

    if (tail === "/departments" || tail.startsWith("/departments/")) {
        base.push({ label: "Departments", href: null });
        return base;
    }

    if (tail === "/kpis" || tail.startsWith("/kpis/")) {
        base.push({ label: "Workspace KPIs", href: null });
        return base;
    }

    if (tail === "/work-units" || tail.startsWith("/work-units/")) {
        base.push({ label: "Work units", href: null });
        return base;
    }

    if (tail === "/placement-priority" || tail.startsWith("/placement-priority")) {
        base.push({ label: "Waitlist Ranking Policy", href: null });
        return base;
    }

    if (tail === "/users-roles" || tail.startsWith("/users-roles/")) {
        base.push({ label: "Users & Roles", href: null });
        return base;
    }

    if (tail === "/user-access" || tail.startsWith("/user-access/")) {
        base.push({ label: "User access scope", href: null });
        return base;
    }

    if (tail === "/fields" || tail.startsWith("/fields")) {
        base.push({ label: "Fields", href: null });
        return base;
    }

    if (tail === "/entity-labels" || tail.startsWith("/entity-labels")) {
        base.push({ label: "Entity labels", href: null });
        return base;
    }

    if (tail === "/relationships" || tail.startsWith("/relationships/")) {
        base.push({ label: "Relationships", href: null });
        return base;
    }

    if (tail === "/lifecycle" || tail.startsWith("/lifecycle/")) {
        base.push({ label: "Lifecycle", href: null });
        return base;
    }

    const remainder = tail.replace(/^\//, "").replace(/\/$/, "") || "Page";
    return [{ label: "Settings", href: SETTINGS_ROOT }, { label: remainder, href: null }];
}

function crumbActive(href: string, path: string): boolean {
    const h = href.replace(/\/$/, "");
    const p = path.replace(/\/$/, "");
    return p === h || p.startsWith(`${h}/`);
}

export default function SettingsHierarchyBreadcrumb() {
    const pathname = usePathname();
    const path = useMemo(() => normalizedPathname(pathname), [pathname]);
    const crumbs = useMemo(() => crumbsForPath(path), [path]);

    return (
        <nav
            aria-label="Settings hierarchy"
            className="flex flex-wrap items-center gap-1 text-[13px] leading-snug"
            style={{ color: derived.textSecondary }}
        >
            {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                    <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                        {i > 0 && (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden style={{ color: neutral.textPrimary }} />
                        )}
                        {c.href && !isLast ? (
                            <AdminV2NavLink
                                href={c.href}
                                active={crumbActive(c.href, path)}
                                className="font-medium text-alloy-blue hover:underline px-0.5 -mx-0.5 rounded"
                            >
                                {c.label}
                            </AdminV2NavLink>
                        ) : (
                            <span
                                className={isLast ? "font-semibold text-alloy-midnight" : "font-medium text-alloy-midnight/75"}
                                aria-current={isLast ? "page" : undefined}
                            >
                                {c.label}
                            </span>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}
