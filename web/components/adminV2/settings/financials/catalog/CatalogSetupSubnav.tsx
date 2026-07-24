"use client";

import Link from "next/link";
import { organizationFinancialsChapterHref } from "@/lib/commercial/commercialChapterRoutes";

export type CatalogSetupSection = "items" | "categories";

const SETUP_TABS: { key: CatalogSetupSection; label: string }[] = [
    { key: "items", label: "Items" },
    { key: "categories", label: "Categories" },
];

export function normalizeCatalogSetupSection(value: string | null | undefined): CatalogSetupSection {
    return value?.trim().toLowerCase() === "categories" ? "categories" : "items";
}

export function CatalogSetupSubnav({
    active,
    itemId,
}: {
    active: CatalogSetupSection;
    itemId?: string | null;
}) {
    return (
        <nav
            className="mb-3 flex flex-wrap gap-1 border-b border-alloy-stone/20"
            aria-label="Catalog setup sections"
            data-testid="catalog-setup-subnav"
        >
            {SETUP_TABS.map((item) => {
                const selected = item.key === active;
                const href = organizationFinancialsChapterHref("catalog", {
                    setup: item.key === "items" ? null : item.key,
                    itemId: item.key === "items" ? itemId : null,
                });
                return (
                    <Link
                        key={item.key}
                        href={href}
                        scroll={false}
                        className={`px-3 py-1.5 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 rounded-sm ${
                            selected
                                ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"
                        }`}
                        data-testid={`catalog-setup-${item.key}`}
                        aria-current={selected ? "page" : undefined}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
