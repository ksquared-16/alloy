"use client";

/**
 * BP V2 Slice 2 — the frame a domain-projection Work View hands its Focus Panel.
 *
 * Present ONLY when the committed answer is a projection cohort. It tells `FocusPanelSurface` that the
 * selected subject is a DURABLE record (`<grain>:<id>`) to open through the existing durable record
 * panel — never the opportunity panel — and carries the originating Business Process and Work View so
 * that context is visible on the panel. It holds no record data and fetches nothing.
 */

import { createContext, useContext, type ReactNode } from "react";

export type DomainProjectionFocusFrame = {
    businessProcessKey: string;
    workViewId: string;
    domain: "assignments" | "billing";
    projectionKey: string;
};

const Ctx = createContext<DomainProjectionFocusFrame | null>(null);

export function DomainProjectionFocusProvider({
    frame,
    children,
}: {
    frame: DomainProjectionFocusFrame | null;
    children: ReactNode;
}) {
    return <Ctx.Provider value={frame}>{children}</Ctx.Provider>;
}

export function useDomainProjectionFocusFrame(): DomainProjectionFocusFrame | null {
    return useContext(Ctx);
}
