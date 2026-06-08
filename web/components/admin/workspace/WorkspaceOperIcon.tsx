"use client";

import type { LucideIcon } from "lucide-react";
import {
    AlertCircle,
    Calendar,
    CalendarX,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    FileText,
    FileWarning,
    Flame,
    Home,
    Phone,
    ReceiptText,
    UserPlus,
    Users,
    XCircle,
} from "lucide-react";

const WORKSPACE_OPER_ICONS: Record<string, LucideIcon> = {
    "alert-circle": AlertCircle,
    calendar: Calendar,
    "calendar-x": CalendarX,
    "check-circle-2": CheckCircle2,
    "clipboard-check": ClipboardCheck,
    "clock-3": Clock3,
    "file-text": FileText,
    "file-warning": FileWarning,
    flame: Flame,
    home: Home,
    phone: Phone,
    "receipt-text": ReceiptText,
    "user-plus": UserPlus,
    users: Users,
    "x-circle": XCircle,
};

export function normalizeWorkspaceOperIconKey(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");
}

type Props = {
    name: string | null | undefined;
    className?: string;
};

/** Config-driven Lucide icon for operational workspace rows (registry lookup only). */
export function WorkspaceOperIcon({ name, className }: Props) {
    const key = normalizeWorkspaceOperIconKey(name);
    const Icon = key ? WORKSPACE_OPER_ICONS[key] : undefined;
    if (!Icon) return null;
    return <Icon className={className} aria-hidden />;
}
