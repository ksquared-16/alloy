import clsx from "clsx";
import type { ReactNode } from "react";
import { OperationalPageHeader } from "@/components/operational/ui/OperationalPageHeader";
import { FormsBreadcrumbs } from "@/components/forms/workspace/FormsBreadcrumbs";
import type { FormsBreadcrumbItem } from "@/lib/forms/formsModuleNav";

type Props = {
    children: ReactNode;
    title?: string;
    subtitle?: string;
    actions?: ReactNode;
    breadcrumbs?: FormsBreadcrumbItem[];
    className?: string;
    contentClassName?: string;
};

/**
 * Page framing inside FormsWorkspaceChrome — breadcrumbs, operational header, body rhythm.
 */
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
                <OperationalPageHeader title={title} subtitle={subtitle} actions={actions} />
            :   null}
            <div className={clsx("space-y-5", contentClassName)}>{children}</div>
        </div>
    );
}
