"use client";

/**
 * Layout V2 — adornment icon rendered with the Alloy icon system (lucide-react),
 * matching staging chrome instead of emoji placeholders.
 *
 * Proof/builder visual only. The builder's <select> options still use the emoji
 * glyph (ADORNMENT_ICON_GLYPH) because lucide components can't render inside an
 * <option>; everywhere the icon is shown visually, this component is used.
 */

import { Baby, Calendar, CheckSquare, FileText, Home, Mail, MapPin, MessageSquare, Phone, Target, User } from "lucide-react";
import type { LayoutAdornmentIcon } from "@/lib/layout/layoutV2";

const ICON_MAP: Record<LayoutAdornmentIcon, typeof User> = {
    person: User,
    child: Baby,
    opportunity: Target,
    calendar: Calendar,
    task: CheckSquare,
    message: MessageSquare,
    document: FileText,
    home: Home,
    phone: Phone,
    mail: Mail,
    location: MapPin,
};

export default function AdornmentIcon({
    icon,
    className = "h-3.5 w-3.5",
}: {
    icon: LayoutAdornmentIcon;
    className?: string;
}) {
    const Cmp = ICON_MAP[icon] ?? User;
    return <Cmp className={className} aria-hidden />;
}
