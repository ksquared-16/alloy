"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    FORMS_MODULE_NAV_ITEMS,
    resolveFormsModuleNavKey,
} from "@/lib/forms/formsModuleNav";

type Props = {
    className?: string;
};

/**
 * Intake operations module navigation — lightweight rail, not bootstrap tabs.
 */
export function FormsModuleNav({ className }: Props) {
    const pathname = usePathname() ?? "";
    const activeKey = resolveFormsModuleNavKey(pathname);

    return (
        <nav
            className={clsx(
                "flex flex-wrap gap-1 rounded-xl bg-alloy-stone/35 p-1 ring-1 ring-alloy-midnight/[0.07]",
                className
            )}
            aria-label="Intake operations"
            data-testid="forms-module-nav"
        >
            {FORMS_MODULE_NAV_ITEMS.map((item) => {
                const active = activeKey === item.key;
                return (
                    <Link
                        key={item.key}
                        href={item.href}
                        title={item.description}
                        className={clsx(
                            "rounded-lg px-3 py-2 text-sm transition-colors",
                            active ?
                                "bg-white font-medium text-alloy-midnight shadow-[0_1px_2px_rgba(49,57,77,0.06)] ring-1 ring-alloy-midnight/[0.06]"
                            :   "text-alloy-midnight/65 hover:bg-white/50 hover:text-alloy-midnight"
                        )}
                        data-active={active ? "true" : "false"}
                        data-nav-key={item.key}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
