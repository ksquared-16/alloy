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
    /**
     * BP V2 S3 — the selected row's authoritative source (the assignment / agreement / charge that put the
     * record in this view). Context only: the record that opens is the subject, never this.
     */
    selectedSource?: { kind: string; id: string; reason: string | null } | null;
};

/**
 * The durable record context a projection's row should open on, when the domain has one. Assignments
 * rows open on the record's Assignment context (`schedule` — the existing Scheduling card, "Assignments");
 * other domains open on the record's default context.
 */
export function preferredDurableContextKey(domain: DomainProjectionFocusFrame["domain"]): string | null {
    return domain === "assignments" ? "schedule" : null;
}

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
