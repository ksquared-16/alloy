"use client";

import type { ReactNode } from "react";
import EntityDrawerSection from "@/components/admin/entity/EntityDrawerSection";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

type Props = {
    config: EntityDrawerSectionConfig;
    children: ReactNode;
    headerRight?: ReactNode;
    defaultExpanded?: boolean;
    className?: string;
};

/** Premium left-accent section card — shared drawer section surface. */
export default function RecordDrawerSectionCard({
    config,
    children,
    headerRight,
    defaultExpanded,
    className,
}: Props) {
    return (
        <EntityDrawerSection
            config={config}
            surface="premium"
            headerRight={headerRight}
            defaultExpanded={defaultExpanded}
            className={className}
        >
            {children}
        </EntityDrawerSection>
    );
}
