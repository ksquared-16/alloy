"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import {
    createBosCommandSession,
    loadPersistedBosCommandSession,
    reduceBosCommandSession,
    syncPersistedBosCommandSession,
    type BosCommandInvocation,
    type BosCommandSession,
    type BosCommandSessionAction,
} from "@/lib/bos/commandSession";
import { useBosPresentationControllerOptional } from "@/contexts/BosPresentationControllerContext";

export const BOS_START_COMMAND_SESSION_EVENT = "alloy-bos:start-command-session";
/** Header Close / launcher collapse — discard any active command so operators are not stuck. */
export const BOS_CLOSE_REQUEST_EVENT = "alloy-bos:close-request";

export type BosStartCommandSessionDetail = {
    invocation: BosCommandInvocation;
};

type BosCommandSessionContextValue = {
    session: BosCommandSession | null;
    startSession: (invocation: BosCommandInvocation) => BosCommandSession;
    dispatch: (action: BosCommandSessionAction) => void;
    discardSession: () => void;
    focusExistingOrStart: (invocation: BosCommandInvocation) => BosCommandSession;
};

const BosCommandSessionContext = createContext<BosCommandSessionContextValue | null>(null);

export function BosCommandSessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<BosCommandSession | null>(null);
    const bosPresentation = useBosPresentationControllerOptional();

    useEffect(() => {
        const restored = loadPersistedBosCommandSession();
        if (restored) setSession(restored);
    }, []);

    useEffect(() => {
        if (!session) return;
        // Debounce persistence so Create Lead Form keystrokes don't sync sessionStorage on
        // every draft reduce (main-thread contention with Work Unit settlement).
        const handle = window.setTimeout(() => {
            syncPersistedBosCommandSession(session);
        }, 250);
        return () => window.clearTimeout(handle);
    }, [session]);

    const ensureBosOpen = useCallback(() => {
        const effective = bosPresentation?.derivation.effective;
        if (!bosPresentation) return;
        if (effective === "closed") {
            bosPresentation.openFloating();
        }
    }, [bosPresentation]);

    const startSession = useCallback(
        (invocation: BosCommandInvocation) => {
            const next = createBosCommandSession({ invocation });
            setSession(next);
            ensureBosOpen();
            return next;
        },
        [ensureBosOpen]
    );

    const focusExistingOrStart = useCallback(
        (invocation: BosCommandInvocation) => {
            if (
                session &&
                session.invocation.actionKey === invocation.actionKey &&
                session.phase !== "completed" &&
                session.phase !== "discarded"
            ) {
                ensureBosOpen();
                return session;
            }
            return startSession(invocation);
        },
        [ensureBosOpen, session, startSession]
    );

    const dispatch = useCallback((action: BosCommandSessionAction) => {
        setSession((prev) => {
            if (!prev) return prev;
            const next = reduceBosCommandSession(prev, action);
            if (next.phase === "discarded" || next.phase === "completed") {
                syncPersistedBosCommandSession(next);
            }
            return next;
        });
    }, []);

    const discardSession = useCallback(() => {
        setSession((prev) => {
            if (!prev) return null;
            const next = reduceBosCommandSession(prev, { type: "DISCARD" });
            syncPersistedBosCommandSession(next);
            return null;
        });
    }, []);

    useEffect(() => {
        const onStart = (event: Event) => {
            const detail = (event as CustomEvent<BosStartCommandSessionDetail>).detail;
            if (!detail?.invocation?.actionKey) return;
            focusExistingOrStart(detail.invocation);
        };
        const onCloseRequest = () => {
            setSession((prev) => {
                if (!prev) return null;
                const caseId =
                    prev.phase === "processing_review" || prev.phase === "executing"
                        ? prev.processingCaseId
                        : null;
                if (caseId) {
                    void fetch(`/api/admin/processing/cases/${caseId}/archive`, {
                        method: "POST",
                        credentials: "same-origin",
                    }).catch(() => {
                        /* best-effort — discard still clears the stuck session */
                    });
                }
                const next = reduceBosCommandSession(prev, { type: "DISCARD" });
                syncPersistedBosCommandSession(next);
                return null;
            });
        };
        window.addEventListener(BOS_START_COMMAND_SESSION_EVENT, onStart as EventListener);
        window.addEventListener(BOS_CLOSE_REQUEST_EVENT, onCloseRequest);
        return () => {
            window.removeEventListener(BOS_START_COMMAND_SESSION_EVENT, onStart as EventListener);
            window.removeEventListener(BOS_CLOSE_REQUEST_EVENT, onCloseRequest);
        };
    }, [focusExistingOrStart]);

    const value = useMemo(
        () => ({
            session,
            startSession,
            dispatch,
            discardSession,
            focusExistingOrStart,
        }),
        [session, startSession, dispatch, discardSession, focusExistingOrStart]
    );

    return (
        <BosCommandSessionContext.Provider value={value}>{children}</BosCommandSessionContext.Provider>
    );
}

export function useBosCommandSessionOptional(): BosCommandSessionContextValue | null {
    return useContext(BosCommandSessionContext);
}

export function useBosCommandSession(): BosCommandSessionContextValue {
    const ctx = useContext(BosCommandSessionContext);
    if (!ctx) {
        throw new Error("useBosCommandSession requires BosCommandSessionProvider");
    }
    return ctx;
}

export function dispatchStartBosCommandSession(invocation: BosCommandInvocation): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent<BosStartCommandSessionDetail>(BOS_START_COMMAND_SESSION_EVENT, {
            detail: { invocation },
        })
    );
}

export function dispatchBosCloseRequest(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(BOS_CLOSE_REQUEST_EVENT));
}
