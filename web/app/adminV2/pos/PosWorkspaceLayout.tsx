"use client";

/**
 * Processing command-center chrome.
 *
 * Thin adapter over the shared `WorkspaceShell`. Processing has two modes — Work
 * (runtime processing) and Studio (design-time setup) — surfaced as a segmented
 * control at the top of the nav. The visible section list is filtered to the active
 * mode; switching modes lands on that mode's first section. The shell + sticky BOS
 * rail (AdminV2WorkspaceBosModalShell) are untouched and live OUTSIDE this content.
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
import AlloyModeSwitch from "@/components/workspace/AlloyModeSwitch";
import { POS_SECTIONS, type PosSection } from "./posSections";

const ICONS: Record<PosSection, LucideIcon> = {
    home: Home,
    processing: Inbox,
    review: FileText,
    linkage: GitMerge,
    documents: FolderOpen,
    forms: Layers,
    packets: PackageOpen,
    settings: Settings,
};

type PosMode = "work" | "studio";

const NAV_ITEMS: ReadonlyArray<WorkspaceNavItem<PosSection>> = POS_SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    icon: ICONS[s.key],
    group: s.group,
}));

/** Mode that owns a section (the section's group IS its mode). */
function modeOf(section: PosSection): PosMode {
    return POS_SECTIONS.find((s) => s.key === section)?.group === "studio" ? "studio" : "work";
}

/** First section to land on when entering a mode. */
function defaultSectionFor(mode: PosMode): PosSection {
    return mode === "work" ? "home" : (POS_SECTIONS.find((s) => s.group === mode)?.key ?? "documents");
}

const MODES: ReadonlyArray<{ key: PosMode; label: string }> = [
    { key: "work", label: "Work" },
    { key: "studio", label: "Studio" },
];

export default function PosWorkspaceLayout({
    active,
    onNavigate,
    children,
}: {
    active: PosSection;
    onNavigate: (section: PosSection) => void;
    children: ReactNode;
}) {
    const mode = modeOf(active);
    const items = NAV_ITEMS.filter((i) => modeOf(i.key) === mode);

    // Shared Work/Studio selector (Focus Panel pill style). The product title
    // ("Processing") lives once in the modal title bar — not repeated here.
    const navHeader = (
        <AlloyModeSwitch
            modes={MODES}
            active={mode}
            onChange={(m) => onNavigate(defaultSectionFor(m))}
            ariaLabel="Processing mode"
            fill
            className="px-0.5"
        />
    );

    return (
        <WorkspaceShell items={items} active={active} onNavigate={onNavigate} navHeader={navHeader}>
            {children}
        </WorkspaceShell>
    );
}
