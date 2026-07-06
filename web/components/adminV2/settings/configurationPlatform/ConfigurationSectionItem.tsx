"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function ConfigurationSectionItem({
    href,
    title,
    description,
    icon,
    testId,
}: {
    href: string;
    title: string;
    description: string;
    icon: ReactNode;
    testId?: string;
}) {
    return (
        <Link href={href} className="config-platform-row group" data-testid={testId}>
            <div className="config-platform-row__icon">{icon}</div>
            <div className="config-platform-row__copy min-w-0 flex-1">
                <p className="config-platform-row__title truncate">{title}</p>
                <p className="config-platform-row__description truncate">{description}</p>
            </div>
            <ChevronRight
                size={15}
                strokeWidth={1.75}
                className="config-platform-row__chevron shrink-0"
                aria-hidden
            />
        </Link>
    );
}
