"use client";

import type { ReactNode } from "react";

import OpportunityDrawerOpenCoordinator from "@/components/admin/OpportunityDrawerOpenCoordinator";
import ContextualRecordOpenListener from "@/components/adminV2/ContextualRecordOpenListener";
import AlloyOsRuntimeSplitController from "@/app/adminV2/components/AlloyOsRuntimeSplitController";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";

/**
 * Shell-level drawer scope — must wrap both route `children` and the persistent command rail.
 * Registered rail slots render outside nested workspace/settings layouts; drawer context lives here.
 * {@link AdminEntityDrawer} stays in route providers that mount {@link EntityLabelsProvider}.
 */
export function AdminV2ShellDrawerScope({ children }: { children: ReactNode }) {
    return (
        <AdminDrawerProvider>
            {children}
            <AlloyOsRuntimeSplitController />
            <OpportunityDrawerOpenCoordinator />
            <ContextualRecordOpenListener />
        </AdminDrawerProvider>
    );
}
