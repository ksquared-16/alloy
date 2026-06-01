"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { OperationalPageHeader } from "@/components/operational/ui/OperationalPageHeader";
import { FormsBreadcrumbs } from "@/components/forms/workspace/FormsBreadcrumbs";
import type { FormsBreadcrumbItem } from "@/lib/forms/formsModuleNav";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    children: ReactNode;
    title?: string;
    subtitle?: string;
    actions?: ReactNode;
    breadcrumbs?: FormsBreadcrumbItem[];
    className?: string;
    contentClassName?: string;
};

function FormsLocationContextNote() {
    const pathname = usePathname();
    const siteFilter = useWorkspaceSiteFilter();
    if (!pathname?.startsWith("/adminV2/forms")) return null;

    const bootstrap = siteFilter?.displayBootstrap ?? siteFilter?.bootstrap ?? null;
    const selectedId = siteFilter?.selectedSiteId ?? null;
    const selectedLabel =
        selectedId && bootstrap?.sites ? bootstrap.sites.find((s) => s.id === selectedId)?.label : null;

    return (
        <p className={clsx("mt-1", opMetadata)} data-testid="forms-location-context-note">
            {selectedLabel ?
                <>Working in context of · {selectedLabel}</>
            :   <>Org-wide forms — use the location filter in the header to focus on one campus</>}
        </p>
    );
}

/** Page framing inside FormsWorkspaceChrome — breadcrumbs, operational header, body rhythm. */
export function FormsWorkspaceShell({
    children,
    title,
    subtitle,
    actions,
    breadcrumbs,
    className,
    contentClassName,
}: Props) {
    return (
        <div className={clsx("min-w-0", className)} data-testid="forms-workspace-shell">
            {breadcrumbs && breadcrumbs.length > 0 ?
                <FormsBreadcrumbs items={breadcrumbs} />
            :   null}
            {title ?
                <>
                    <OperationalPageHeader title={title} subtitle={subtitle} actions={actions} />
                    <FormsLocationContextNote />
                </>
            :   null}
            <div className={clsx("space-y-5", contentClassName)}>{children}</div>
        </div>
    );
}
