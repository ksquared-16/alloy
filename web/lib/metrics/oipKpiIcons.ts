import type { LucideIcon } from "lucide-react";
import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    FileText,
    FileWarning,
    Flame,
    Home,
    MessageSquare,
    Phone,
    ReceiptText,
    UserPlus,
    Users,
    XCircle,
} from "lucide-react";

const ICON_BY_KEY: Record<string, LucideIcon> = {
    "alert-circle": AlertCircle,
    calendar: Calendar,
    "check-circle-2": CheckCircle2,
    "clipboard-check": ClipboardCheck,
    "clock-3": Clock3,
    "file-text": FileText,
    "file-warning": FileWarning,
    flame: Flame,
    home: Home,
    "message-square": MessageSquare,
    phone: Phone,
    "receipt-text": ReceiptText,
    "user-plus": UserPlus,
    users: Users,
    "x-circle": XCircle,
};

const METRIC_ICON: Record<string, string> = {
    "enrollment.tour_conversion_rate": "check-circle-2",
    "enrollment.time_to_schedule_tour": "clock-3",
    "forms.completion_rate": "clipboard-check",
    "forms.packet_completion_time": "file-text",
    "ops.work_overdue_count": "calendar",
    "ops.needs_attention_count": "alert-circle",
    "ops.workflow_failure_rate": "x-circle",
    "ops.readiness_gap_count": "file-warning",
    "comms.delivery_rate": "message-square",
    "comms.reply_rate": "phone",
    "comms.failed_delivery_count": "alert-circle",
};

const STRIP_ICON: Record<string, string> = {
    "oip.enrollment.tour_conversion_rate": "check-circle-2",
    "oip.enrollment.time_to_schedule_tour": "clock-3",
    "oip.forms.completion_rate": "clipboard-check",
    "oip.ops.work_overdue_count": "calendar",
    "oip.ops.needs_attention_count": "alert-circle",
};

const HEALTH_ICON: Record<string, string> = {
    business: "home",
    operational: "flame",
    enrollment: "user-plus",
};

const PROCESS_ICON: Record<string, string> = {
    lead_management: "user-plus",
    enrollment: "users",
    enrollment_pipeline: "users",
    waitlist: "clipboard-check",
    billing: "receipt-text",
};

function normalizeIconKey(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");
}

export function oipMetricIconKey(metricKey: string | null | undefined): string {
    const key = String(metricKey ?? "").trim();
    if (!key) return "home";
    return METRIC_ICON[key] ?? STRIP_ICON[key] ?? "home";
}

export function oipHealthIconKey(kind: "business" | "operational" | "enrollment"): string {
    return HEALTH_ICON[kind] ?? "home";
}

export function oipProcessIconKey(processKey: string | null | undefined): string {
    const normalized = normalizeIconKey(processKey);
    if (!normalized) return "home";
    return PROCESS_ICON[normalized] ?? "home";
}

export function resolveOipLucideIcon(name: string | null | undefined): LucideIcon | undefined {
    const key = normalizeIconKey(name);
    return key ? ICON_BY_KEY[key] : undefined;
}
