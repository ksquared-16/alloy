"use client";

import type { ReactNode } from "react";

import ProcessingLandingActionCard, {
    type LandingActionTier,
} from "@/app/adminV2/pos/ProcessingLandingActionCard";

export type { LandingActionTier as WorkspaceCardTier };

/**
 * Operational Workspace Doctrine V2 — overview action tile (primary / secondary / tertiary).
 */
export default function WorkspaceCard({
    icon,
    title,
    description,
    cta,
    onClick,
    tier = "secondary",
    disabled = false,
    testId,
    dragHandlers,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    cta: string;
    onClick?: () => void;
    tier?: LandingActionTier;
    disabled?: boolean;
    testId?: string;
    dragHandlers?: {
        onDragOver: (e: React.DragEvent) => void;
        onDragLeave: () => void;
        onDrop: (e: React.DragEvent) => void;
        dragActive?: boolean;
    };
}) {
    return (
        <ProcessingLandingActionCard
            icon={icon}
            title={title}
            description={description}
            cta={cta}
            onClick={onClick}
            tier={tier}
            disabled={disabled}
            testId={testId}
            dragHandlers={dragHandlers}
        />
    );
}
