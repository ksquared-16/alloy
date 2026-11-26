"use client";

import type { ReactNode } from "react";
import { BookOpen, Building2, Database, Workflow } from "lucide-react";
import type { ConfigurationPlatformSectionId } from "@/lib/adminV2/configurationModeNav";

function sectionHeaderIcon(sectionId: ConfigurationPlatformSectionId): ReactNode {
    const props = { size: 24, strokeWidth: 1.6, "aria-hidden": true as const };
    switch (sectionId) {
        case "organization":
            return <Building2 {...props} />;
        case "data_model":
            return <Database {...props} />;
        case "operations":
            return <Workflow {...props} />;
        case "business":
            return <BookOpen {...props} />;
    }
}

export function ConfigurationSection({
    sectionId,
    title,
    description,
    children,
    testId,
}: {
    sectionId: ConfigurationPlatformSectionId;
    title: string;
    description: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section className="config-platform-section" data-testid={testId}>
            <div className="config-platform-section__identity">
                <div className="config-platform-section__identity-icon">{sectionHeaderIcon(sectionId)}</div>
                <div className="min-w-0">
                    <h2 className="config-platform-section__title">{title}</h2>
                    <p className="config-platform-section__description">{description}</p>
                </div>
            </div>
            <div className="config-platform-section__items">{children}</div>
        </section>
    );
}
