/**
 * Operator-facing icon catalog for Assignment Categories.
 * Stores canonical keys; operators never type raw keys.
 * (Export names retained as "Purpose" for internal/back-compat stability.)
 */

import type { LucideIcon } from "lucide-react";
import {
    Activity,
    Bus,
    Calendar,
    CalendarClock,
    Clock,
    DoorOpen,
    Heart,
    HeartPulse,
    Repeat,
    Sparkles,
    Sunrise,
    Sunset,
    Users,
} from "lucide-react";

export type AssignmentPurposeIconOption = {
    key: string;
    label: string;
    Icon: LucideIcon;
};

export const ASSIGNMENT_PURPOSE_ICONS: AssignmentPurposeIconOption[] = [
    { key: "calendar", label: "Calendar", Icon: Calendar },
    { key: "calendar-clock", label: "Schedule", Icon: CalendarClock },
    { key: "classroom", label: "Classroom", Icon: DoorOpen },
    { key: "clock", label: "Clock", Icon: Clock },
    { key: "sunrise", label: "Before care", Icon: Sunrise },
    { key: "sunset", label: "After care", Icon: Sunset },
    { key: "activity", label: "Activity", Icon: Activity },
    { key: "sparkles", label: "Enrichment", Icon: Sparkles },
    { key: "bus", label: "Transportation", Icon: Bus },
    { key: "heart", label: "Care", Icon: Heart },
    { key: "heart-pulse", label: "Therapy", Icon: HeartPulse },
    { key: "users", label: "Group", Icon: Users },
    { key: "repeat", label: "Recurring", Icon: Repeat },
];

export function resolveAssignmentPurposeIcon(key: string | null | undefined): AssignmentPurposeIconOption {
    const hit = ASSIGNMENT_PURPOSE_ICONS.find((o) => o.key === key);
    return hit ?? ASSIGNMENT_PURPOSE_ICONS[1]!; // calendar-clock default
}
