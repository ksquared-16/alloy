"use client";

/**
 * POS command-center chrome — now the canonical workspace shell.
 *
 * Thin adapter over the shared `WorkspaceShell` (white sidebar, Bend Pine active
 * state, white canvas). No navy slab, no beige. The shell + sticky BOS rail
 * (AdminV2WorkspaceBosModalShell) are untouched and live OUTSIDE this content.
 */

import type { ReactNode } from "react";
import {
    FileText,
    FolderOpen,
    GitMerge,
    Home,
    Inbox,
    Layers,
    PackageOpen,
    Settings,
    type LucideIcon,
} from "lucide-react";
import WorkspaceShell, { type WorkspaceNavItem } from "@/components/workspace/WorkspaceShell";
import { POS_SECTIONS, type PosSection } from "./posSections";

const ICONS: Record<PosSection, LucideIcon> = {
    home: Home,
    processing: Inbox,
    review: FileText,
    linkage: GitMerge,
    forms: Layers,
    packets: PackageOpen,
    documents: FolderOpen,
    settings: Settings,
};

const GROUP_LABELS: Record<string, string> = {
    work: "Operate",
    sources: "Sources",
    config: "Configure",
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
        <WorkspaceShell items={NAV_ITEMS} active={active} onNavigate={onNavigate} groupLabels={GROUP_LABELS}>
            {children}
        </WorkspaceShell>
    );
}
