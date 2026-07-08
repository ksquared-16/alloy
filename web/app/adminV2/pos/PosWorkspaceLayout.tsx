"use client";

/**
 * Digital Mailroom chrome — product architecture only.
 * Overview, Work, and Studio are the operator-facing spine; Builder opens from Studio.
 */

import type { ReactNode } from "react";
import { Home, Inbox, Layers, type LucideIcon } from "lucide-react";
import WorkspaceShell, { type WorkspaceNavItem } from "@/components/workspace/WorkspaceShell";
import { POS_SECTIONS, type PosSection } from "./posSections";

const ICONS: Record<PosSection, LucideIcon> = {
    overview: Home,
    processing: Inbox,
    forms: Layers,
    packets: Layers,
    review: Inbox,
    linkage: Inbox,
    settings: Layers,
};

const NAV_ITEMS: ReadonlyArray<WorkspaceNavItem<PosSection>> = POS_SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    icon: ICONS[s.key],
    group: s.group,
}));

export default function PosWorkspaceLayout({
    active,
    onNavigate,
    children,
}: {
    active: PosSection;
    onNavigate: (section: PosSection) => void;
    children: ReactNode;
}) {
    return (
        <WorkspaceShell items={NAV_ITEMS} active={active} onNavigate={onNavigate}>
            {children}
        </WorkspaceShell>
    );
}
