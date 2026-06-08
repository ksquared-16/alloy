"use client";

import type { ReactNode } from "react";
import { AdminViewerTimezoneProvider, type AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";

export default function ViewerTimezoneClientProvider({
    value,
    children,
}: {
    value: AdminViewerTimezoneValue;
    children: ReactNode;
}) {
    return <AdminViewerTimezoneProvider value={value}>{children}</AdminViewerTimezoneProvider>;
}
