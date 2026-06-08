"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserDisplayTimezoneSource } from "@/lib/admin/timezoneContract";
import { UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

export type AdminViewerTimezoneValue = {
    /** Resolved IANA timezone for admin timestamp display (user → org → UTC). */
    iana: string;
    source: UserDisplayTimezoneSource;
};

const AdminViewerTimezoneContext = createContext<AdminViewerTimezoneValue>({
    iana: UTC_FALLBACK_IANA,
    source: "utc_fallback",
});

export function AdminViewerTimezoneProvider({
    value,
    children,
}: {
    value: AdminViewerTimezoneValue;
    children: ReactNode;
}) {
    return <AdminViewerTimezoneContext.Provider value={value}>{children}</AdminViewerTimezoneContext.Provider>;
}

/** IANA timezone string for formatDateTimeForUserDisplay / formatDateForUserDisplay. */
export function useAdminViewerTimezone(): string {
    return useContext(AdminViewerTimezoneContext).iana;
}

export function useAdminViewerTimezoneMeta(): AdminViewerTimezoneValue {
    return useContext(AdminViewerTimezoneContext);
}
