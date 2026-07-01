import clsx from "clsx";
import Link from "next/link";
import type { FormsBreadcrumbItem } from "@/lib/forms/formsModuleNav";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    items: FormsBreadcrumbItem[];
    className?: string;
};

export function FormsBreadcrumbs({ items, className }: Props) {
    if (items.length === 0) return null;

    return (
        <nav
            className={clsx("mb-4 flex flex-wrap items-center gap-1.5", opMetadata, className)}
            aria-label="Breadcrumb"
            data-testid="forms-breadcrumbs"
        >
            {items.map((item, i) => {
                const isLast = i === items.length - 1;
                return (
                    <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1.5">
                        {i > 0 ?
                            <span className="text-alloy-midnight/35" aria-hidden>
                                /
                            </span>
                        :   null}
                        {item.href && !isLast ?
                            <Link href={item.href} className="font-medium text-alloy-blue hover:underline">
                                {item.label}
                            </Link>
                        :   <span className={isLast ? "text-alloy-midnight/75" : undefined}>{item.label}</span>}
                    </span>
                );
            })}
        </nav>
    );
}
