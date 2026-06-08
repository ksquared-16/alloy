"use client";

import type { ReactNode } from "react";
import { AdminVerticalProvider } from "@/contexts/AdminVerticalContext";

/**
 * Relationship vocabulary editors use useAdminVertical() for the Vertical column.
 * Scope this provider to this route only — other Settings pages do not need it.
 */
export default function AdminV2SettingsRelationshipsLayout({ children }: { children: ReactNode }) {
    return <AdminVerticalProvider>{children}</AdminVerticalProvider>;
}
