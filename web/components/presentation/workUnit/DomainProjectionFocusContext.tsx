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
    selectedSource?: { kind: string; id: string; reason: string | null; siteLocationId?: string | null } | null;
    /** BP V2 S4 — operator-facing names, for the record's "why is this open" line. */
    processLabel?: string | null;
    workViewLabel?: string | null;
};

/**
 * The durable record context a projection's row should open on, when the domain has one. Assignments
 * rows open on the record's Assignment context (`schedule` — the existing Scheduling card, "Assignments");
 * other domains open on the record's default context.
 */
export function preferredDurableContextKey(domain: DomainProjectionFocusFrame["domain"]): string | null {
    return domain === "assignments" ? "schedule" : null;
}

/**
 * BP V2 S4 — HOW a projection's record opens in the existing durable record surface.
 *
 * A domain with an operational context opens in the surface's existing `contextual` presentation —
 * "choose one thing, see that thing": the operational card (Scheduling, for Assignments) is the primary
 * object, the record's own views stay one click away, and the full card grid is not rendered underneath.
 * That is the presentation Operations and Create Assignment already land on; nothing new is composed.
 * A domain without one keeps the full record (`full`), exactly as Slice 2 opened it.
 *
 * BP V2 S6 — Billing keeps the full household record and asks the existing Financials card to LEAD it
 * (`leadCard`), started on the row's verified source. A household has no record contexts, so the
 * contextual presentation would render nothing for it; the lead card is the household equivalent.
 */
export function durableRecordEntryFor(frame: DomainProjectionFocusFrame): {
    presentation: "full" | "contextual";
    contextKey: string | null;
    contextSiteId: string | null;
    focusSource: { kind: string; id: string; reason: string | null } | null;
    origin: { label: string; reason: string | null } | null;
    leadCard: "financials" | null;
} {
    const contextKey = preferredDurableContextKey(frame.domain);
    const source = frame.selectedSource ?? null;
    const label = [frame.processLabel, frame.workViewLabel].map((v) => (v ?? "").trim()).filter(Boolean).join(" · ");
    return {
        presentation: contextKey ? "contextual" : "full",
        contextKey,
        contextSiteId: contextKey ? source?.siteLocationId ?? null : null,
        focusSource: source ? { kind: source.kind, id: source.id, reason: source.reason } : null,
        origin: label ? { label, reason: source?.reason ?? null } : null,
        leadCard: frame.domain === "billing" ? "financials" : null,
    };
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
