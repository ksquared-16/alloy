"use client";

import { createContext, useContext, type ReactNode } from "react";
import { UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

const AdminOrgOperationalTimezoneContext = createContext<string>(UTC_FALLBACK_IANA);

export function AdminOrgOperationalTimezoneProvider({
    iana,
    children,
}: {
    iana: string;
    children: ReactNode;
}) {
    return (
        <AdminOrgOperationalTimezoneContext.Provider value={iana.trim() || UTC_FALLBACK_IANA}>
            {children}
        </AdminOrgOperationalTimezoneContext.Provider>
    );
}

/** Org business/operational calendar IANA (for schedule defaults, booking-aligned admin forms). */
export function useAdminOrgOperationalTimezone(): string {
    return useContext(AdminOrgOperationalTimezoneContext);
}
