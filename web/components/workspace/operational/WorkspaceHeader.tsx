"use client";

import type { ReactNode } from "react";

import OperationalModalHeader, {
    OPERATIONAL_PRIMARY_ACTION_CLASS,
    OPERATIONAL_SECONDARY_ACTION_CLASS,
} from "@/app/adminV2/components/OperationalModalHeader";

export { OPERATIONAL_PRIMARY_ACTION_CLASS, OPERATIONAL_SECONDARY_ACTION_CLASS };

/**
 * Operational Workspace Doctrine V2 — modal header (icon + title + actions + Close).
 */
export default function WorkspaceHeader({
    icon,
    title,
    titleId,
    subtitle,
    actions,
    secondaryActions,
    onClose,
    closeLabel,
}: {
    icon: ReactNode;
    title: string;
    titleId: string;
    subtitle?: string;
    actions?: ReactNode;
    secondaryActions?: ReactNode;
    onClose: () => void;
    closeLabel?: string;
}) {
    return (
        <OperationalModalHeader
            icon={icon}
            title={title}
            titleId={titleId}
            subtitle={subtitle}
            actions={actions}
            secondaryActions={secondaryActions}
            onClose={onClose}
            closeLabel={closeLabel}
        />
    );
}
