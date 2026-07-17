"use client";

/**
 * THE OPERATIONAL SUBJECT — one owner: committed Focus.
 *
 * Governing: the Product Office findings (Record of Attention) + alloy-runtime-kernel.md §K3.
 * "Operational Subject is the Runtime expression of Record of Attention."
 *
 * WHY THIS EXISTS. The inline Focus Panel used to read its subject from `AdminDrawerContext`, which
 * made the drawer a SECOND owner of Record of Attention. Certification proved it: D1 resolved the
 * subject (U-P4), K3 committed it, the queue rendered it — and the panel still showed "Select a
 * record to begin", because it was asking a different owner. Bridging the two with
 * `useEffect(openDrawer(...))` produced 4418 duplicate requests: two owners synchronising is a loop,
 * not a fix. So the second owner is deleted rather than reconciled.
 *
 * The drawer keeps PRESENTATION (open/close chrome, render slots, scroll). It no longer decides WHO
 * the operator is working on. That answer comes from the committed snapshot and nowhere else.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type OperationalSubject = {
    /** Record of Attention — the committed subject, from the frozen snapshot. Null = none committed. */
    subjectId: string | null;
    /** Record of Truth entity type for the committed subject. */
    entityType: "opportunity" | null;
    /**
     * The FIRST-SIGHT operational truth, straight from the committed D1 snapshot.
     *
     * The Focus Panel used to derive Situation/Decision/Action from its record VM — a FETCH — so it
     * rendered "named but unresolved" chrome after Operational Commit and gated the terminal on a
     * Settlement request. D1 already carries all of this (U-P5/U-O4/U-O5). The panel reads it here.
     * Null only when nothing is committed (empty/error terminals).
     */
    situation: {
        stageKey: string;
        stageLabel: string;
        /** Why this stage exists — the Situation half of Situation → Decision → Action. */
        purpose: string | null;
        workTemplateLabel: string;
        required: boolean;
    } | null;
    /** Decision context — the lens the operator entered from, and their scope within it. */
    decision: {
        workViewId: string;
        workViewLabel: string;
        scopeState: "in_scope" | "no_active_view" | "out_of_scope";
    } | null;
    /** U-O5 — capability, not decoration. */
    action: { actionRef: string; label: string } | null;
};

const EMPTY: OperationalSubject = {
    subjectId: null, entityType: null, situation: null, decision: null, action: null,
};
const Ctx = createContext<OperationalSubject>(EMPTY);

/** Fed from the committed model — never from the drawer, never resolved locally. */
export function OperationalSubjectProvider({
    subjectId,
    situation,
    decision,
    action,
    children,
}: {
    subjectId: string | null;
    situation?: OperationalSubject["situation"];
    decision?: OperationalSubject["decision"];
    action?: OperationalSubject["action"];
    children: ReactNode;
}) {
    const value = useMemo<OperationalSubject>(
        () => ({
            subjectId,
            entityType: subjectId ? "opportunity" : null,
            situation: situation ?? null,
            decision: decision ?? null,
            action: action ?? null,
        }),
        [subjectId, situation, decision, action],
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * OPERATIONAL resolution — the D4 meaning. True when the committed snapshot has given the panel a
 * subject, its current business state, and a truthful action. Deliberately independent of any
 * Settlement fetch: Detail/History arriving later must never make the operator's panel "unresolved".
 */
export function isOperationallyResolved(s: OperationalSubject): boolean {
    return s.subjectId != null && s.situation != null && s.action != null;
}

/** The one read for "who is the operator working on". */
export function useOperationalSubject(): OperationalSubject {
    return useContext(Ctx);
}
