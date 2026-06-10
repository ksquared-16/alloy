"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { ADMIN_V2_NOTIFICATIONS_HREF } from "@/lib/adminV2/adminV2NavConstants";
import { normalizeToCanonicalAdminPath } from "@/lib/admin/canonicalAdminRoutes";
import { derived, neutral } from "@/styles/tokens/colors";

/** Header notifications entry — count/modal wiring deferred until notification center ships. */
export default function TopNavNotificationsLink() {
    const pathname = usePathname();
    const active = normalizeToCanonicalAdminPath(pathname) === ADMIN_V2_NOTIFICATIONS_HREF;

    return (
        <AdminV2NavLink
            href={ADMIN_V2_NOTIFICATIONS_HREF}
            title="Notifications — activity feed coming soon"
            aria-label="Notifications"
            active={active}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{
                backgroundColor: active ? derived.searchBgOnPrimary : "transparent",
                color: neutral.surface,
            }}
            data-adminv2-topnav-notifications="true"
        >
            <Bell size={18} strokeWidth={1.75} />
        </AdminV2NavLink>
    );
}
