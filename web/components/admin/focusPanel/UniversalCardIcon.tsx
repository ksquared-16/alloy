"use client";

import {
    AlertCircle,
    ArrowRight,
    Baby,
    Briefcase,
    Calendar,
    CheckSquare,
    ClipboardList,
    Clock,
    FileText,
    GitBranch,
    HeartPulse,
    History,
    Home,
    MessageSquare,
    Rocket,
    ScrollText,
    ShieldCheck,
    StickyNote,
    Target,
    Users,
    Zap,
    type LucideIcon,
} from "lucide-react";

const ICON_BY_NAME: Record<string, LucideIcon> = {
    AlertCircle,
    ArrowRight,
    Baby,
    Briefcase,
    Calendar,
    CheckSquare,
    ClipboardList,
    Clock,
    FileText,
    GitBranch,
    HeartPulse,
    History,
    Home,
    MessageSquare,
    Rocket,
    ScrollText,
    ShieldCheck,
    StickyNote,
    Target,
    Users,
    Zap,
};

type Props = {
    name: string | null;
    tierClassName?: string;
};

export default function UniversalCardIcon({ name, tierClassName }: Props) {
    if (!name) return null;
    const Icon = ICON_BY_NAME[name];
    if (!Icon) return null;
    return (
        <span className={tierClassName ?? "alloy-os-ucard__icon"} aria-hidden>
            <Icon size={16} strokeWidth={1.75} />
        </span>
    );
}
