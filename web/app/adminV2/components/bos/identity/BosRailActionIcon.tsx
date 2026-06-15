"use client";

import {
    FileStack,
    FileText,
    Lightbulb,
    MessageSquare,
    Phone,
    Search,
    type LucideIcon,
} from "lucide-react";

import { BOS_IDENTITY } from "@/lib/bos/bosIdentityTokens";
import type { BosRailActionIconKey } from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";

const ICON_BY_KEY: Record<BosRailActionIconKey, LucideIcon> = {
    summarize: FileText,
    missing: Search,
    draft: MessageSquare,
    documents: FileStack,
    outreach: Phone,
    insight: Lightbulb,
};

type Props = {
    icon: BosRailActionIconKey;
    className?: string;
};

/**
 * Operational action icon for BOS rail recommendation rows.
 * Bend Pine stroke — not the Alloy mark (logo stays in header only).
 */
export function BosRailActionIcon({ icon, className = "" }: Props) {
    const Icon = ICON_BY_KEY[icon];

    return (
        <Icon
            className={`h-4 w-4 shrink-0 ${className}`.trim()}
            stroke={BOS_IDENTITY.bendPine}
            strokeWidth={1.75}
            aria-hidden
            data-bos-rail-action-icon={icon}
        />
    );
}
