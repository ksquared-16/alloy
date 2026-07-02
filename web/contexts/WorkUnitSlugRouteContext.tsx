"use client";

import { createContext, useContext, type ReactNode } from "react";

export type WorkUnitSlugRouteValue = {
    routeSlug: string;
    departmentId: string;
    departmentName: string | null;
    workUnitId: string;
    workUnitKey: string;
    workUnitName: string;
    initialQueueKey: string | null;
    /** Configured Work View to select initially when the route slug is a work-view slug. */
    initialWorkViewId: string | null;
    routeRecordId: string | null;
};

const WorkUnitSlugRouteContext = createContext<WorkUnitSlugRouteValue | null>(null);

export function WorkUnitSlugRouteProvider({
    value,
    children,
}: {
    value: WorkUnitSlugRouteValue;
    children: ReactNode;
}) {
    return (
        <WorkUnitSlugRouteContext.Provider value={value}>{children}</WorkUnitSlugRouteContext.Provider>
    );
}

export function useWorkUnitSlugRouteOptional(): WorkUnitSlugRouteValue | null {
    return useContext(WorkUnitSlugRouteContext);
}
