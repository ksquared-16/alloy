"use client";

import type { PersonDrawerParentModuleNavItem } from "@/lib/admin/person/resolvePersonDrawerParentModuleNavModel";

function chipClass(interactive: boolean): string {
    const base =
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors";
    if (interactive) {
        return `${base} border-alloy-blue/35 bg-alloy-blue/[0.1] text-alloy-midnight/85 shadow-sm hover:border-alloy-blue/50 hover:bg-alloy-blue/[0.14] cursor-pointer`;
    }
    return `${base} border-alloy-stone/25 bg-white text-alloy-midnight/55`;
}

/** Parent operational module shortcuts — separate from person status. */
export default function PersonDrawerParentModuleNav({
    items,
    onModuleClick,
}: {
    items: PersonDrawerParentModuleNavItem[];
    onModuleClick: (key: string) => void;
}) {
    if (!items.length) return null;

    return (
        <nav
            className="flex flex-wrap items-center gap-1.5"
            aria-label="Parent modules"
            data-testid="person-parent-module-nav"
            data-person-drawer-parent-module-nav="true"
        >
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">
                Modules
            </span>
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    onClick={() => onModuleClick(item.key)}
                    className={chipClass(item.actionable)}
                    data-parent-module={item.key}
                >
                    {item.label}
                </button>
            ))}
        </nav>
    );
}
