"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceSiteFilterProvider } from "@/contexts/WorkspaceSiteFilterContext";

function isWorkspaceAreaPath(pathname: string): boolean {
    const p = pathname.startsWith("/admin/v2") ? `/adminV2${pathname.slice("/admin/v2".length)}` : pathname;
    return p === "/adminV2/workspace" || p.startsWith("/adminV2/workspace/");
}

/** Provides workspace site-filter context only under `/adminV2/workspace/*` (not settings/workflows). */
export default function WorkspaceSiteFilterGate({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? "";
    if (!isWorkspaceAreaPath(pathname)) return <>{children}</>;
    return <WorkspaceSiteFilterProvider>{children}</WorkspaceSiteFilterProvider>;
}
