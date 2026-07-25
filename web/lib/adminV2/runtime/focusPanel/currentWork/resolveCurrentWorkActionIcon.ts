/**
 * Resolve Lucide icons for What's Next action buttons.
 * Prefers action-registry icon metadata, then handler/actionRef, then action.icon.
 */

import {
    Calendar,
    CheckCircle2,
    MessageSquare,
    Send,
    type LucideIcon,
} from "lucide-react";

import { actionRegistryEntryForKey } from "@/lib/admin/actions/actionDefinitionRegistry";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const ICON_BY_LUCIDE_NAME: Record<string, LucideIcon> = {
    MessageSquare,
    Calendar,
    Send,
    CheckCircle2,
    CheckSquare: CheckCircle2,
    MessageCircle: MessageSquare,
};

const ICON_BY_HANDLER: Record<string, LucideIcon> = {
    quick_message: MessageSquare,
    schedule_tour: Calendar,
    reschedule_tour: Calendar,
    send_form: Send,
    send_enrollment_packet: Send,
    record_outcome: CheckCircle2,
    complete_stage_work: CheckCircle2,
    complete_outcome: CheckCircle2,
};

function lucideFromName(name: string | null | undefined): LucideIcon | null {
    if (!name?.trim()) return null;
    const trimmed = name.trim();
    return ICON_BY_LUCIDE_NAME[trimmed] ?? ICON_BY_LUCIDE_NAME[trimmed.replace(/\s+/g, "")] ?? null;
}

/**
 * Resolve the icon for a What's Next action button.
 * Never invents a decorative icon for unknown actions — returns null (label-only).
 */
export function resolveCurrentWorkActionIcon(action: Pick<
    CurrentWorkActionVM,
    "key" | "label" | "icon" | "handlerKey" | "actionRef"
>): LucideIcon | null {
    const handler = (action.handlerKey ?? action.actionRef ?? action.key).trim().toLowerCase();
    if (handler) {
        const registry = actionRegistryEntryForKey(handler);
        const fromRegistry = lucideFromName(registry?.icon ?? null);
        if (fromRegistry) return fromRegistry;

        const fromHandler = ICON_BY_HANDLER[handler];
        if (fromHandler) return fromHandler;
    }

    const fromActionIcon = lucideFromName(action.icon);
    if (fromActionIcon) return fromActionIcon;

    // Synthetic outcome CTA often uses a stable key/label without a registry entry.
    const label = action.label.trim().toLowerCase();
    if (label.includes("record outcome") || label.includes("record what happened")) {
        return CheckCircle2;
    }
    if (label === "message" || label.startsWith("message ")) return MessageSquare;
    if (label.includes("schedule tour")) return Calendar;
    if (label.includes("send form")) return Send;

    return null;
}
