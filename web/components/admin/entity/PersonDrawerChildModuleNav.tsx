"use client";

import type { PersonDrawerChildModuleNavItem } from "@/lib/admin/person/resolvePersonDrawerChildModuleNavModel";

function chipClass(item: PersonDrawerChildModuleNavItem, interactive: boolean): string {
    const base =
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors";
    if (item.phase === "future") {
        return `${base} border-alloy-stone/20 bg-white text-alloy-midnight/35`;
    }
    if (interactive) {
        return `${base} border-alloy-blue/35 bg-alloy-blue/[0.1] text-alloy-midnight/85 shadow-sm hover:border-alloy-blue/50 hover:bg-alloy-blue/[0.14] cursor-pointer`;
    }
    return `${base} border-alloy-stone/25 bg-white text-alloy-midnight/55`;
}

/** Child operational module shortcuts — not enrollment pipeline stages. */
export default function PersonDrawerChildModuleNav({
    items,
    onModuleClick,
}: {
    items: PersonDrawerChildModuleNavItem[];
    onModuleClick: (key: string) => void;
}) {
    if (!items.length) return null;

    return (
        <nav
            className="flex flex-wrap items-center gap-1.5"
            aria-label="Child modules"
            data-testid="person-child-module-nav"
            data-person-drawer-child-module-nav="true"
        >
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">
                Modules
            </span>
            {items.map((item) => {
                const interactive = item.actionable && item.phase !== "future";
                const Tag = interactive ? "button" : "span";
                return (
                    <Tag
                        key={item.key}
                        {...(interactive
                            ? { type: "button" as const, onClick: () => onModuleClick(item.key) }
                            : {})}
                        className={chipClass(item, interactive)}
                        data-child-module={item.key}
                        data-child-module-phase={item.phase}
                    >
                        {item.label}
                        {item.phase === "future" ? (
                            <span className="ml-1 text-[9px] font-medium text-alloy-midnight/35">Soon</span>
                        ) : null}
                    </Tag>
                );
            })}
        </nav>
    );
}
