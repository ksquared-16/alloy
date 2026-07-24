"use client";

import {
    AlertCircle,
    ArrowRight,
    Baby,
    Briefcase,
    Calendar,
    CalendarDays,
    CheckSquare,
    ClipboardList,
    Clock,
    CreditCard,
    FileText,
    Flag,
    GitBranch,
    HeartPulse,
    History,
    Home,
    LayoutGrid,
    MessageSquare,
    Receipt,
    Rocket,
    ScrollText,
    ShieldCheck,
    StickyNote,
    Target,
    Users,
    Zap,
    type LucideIcon,
} from "lucide-react";

/** Lucide names referenced by `SYSTEM5_CARD_ICON` / Universal Card headers. */
export const UNIVERSAL_CARD_ICON_BY_NAME: Record<string, LucideIcon> = {
    AlertCircle,
    ArrowRight,
    Baby,
    Briefcase,
    Calendar,
    CalendarDays,
    CheckSquare,
    ClipboardList,
    Clock,
    CreditCard,
    FileText,
    Flag,
    GitBranch,
    HeartPulse,
    History,
    Home,
    LayoutGrid,
    MessageSquare,
    Receipt,
    Rocket,
    ScrollText,
    ShieldCheck,
    StickyNote,
    Target,
    Users,
    Zap,
};

const FALLBACK_ICON = LayoutGrid;

type Props = {
    name: string | null;
    tierClassName?: string;
};

/**
 * Shared Focus Panel header icon — always renders so every card has the same
 * header chrome (size/color owned by `.alloy-os-ucard__icon`).
 */
export default function UniversalCardIcon({ name, tierClassName }: Props) {
    const Icon =
        (name?.trim() ? UNIVERSAL_CARD_ICON_BY_NAME[name.trim()] : null) ?? FALLBACK_ICON;
    return (
        <span className={tierClassName ?? "alloy-os-ucard__icon"} aria-hidden data-ucard-icon={name ?? "fallback"}>
            <Icon size={16} strokeWidth={1.75} />
        </span>
    );
}
