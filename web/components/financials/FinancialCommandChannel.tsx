"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import type { FinancialTransactionCommandKind } from "@/lib/financials/commands/financialTransactionCommands";

/**
 * ── HOW A LEDGER ASKS FOR A COMMAND IT DOES NOT OWN ────────────────────────────────────────────
 *
 * Financials → Accounts renders the account card and the ledger as SIBLINGS. The card owns the
 * command shell — Add, the adjustment entry, the reverse confirmation, the notices, the refresh —
 * and the ledger owns the rows. An operator clicking Reverse on a row expects the command the card
 * already hosts, on the surface they are already looking at.
 *
 * The alternative was to give the workspace its own Reverse, its own Post and its own eligibility.
 * That is the second command surface this pass exists to prevent: two writers, two rules, and
 * eventually two different answers about the same charge.
 *
 * So the ledger REQUESTS and the card PERFORMS. Because they are siblings rather than nested, the
 * channel is a REGISTRATION: the composing host provides it, the card registers what it can do, the
 * ledger asks. The channel itself carries no state, executes nothing, and decides no eligibility —
 * it is a wire, and deliberately the least interesting file in this repair.
 *
 * A host that provides no channel simply offers no row commands, which is the honest behaviour for
 * a surface with nowhere to put them.
 */
export type FinancialCommandRequest = {
    kind: FinancialTransactionCommandKind;
    chargeId: string;
    label: string;
};

export type FinancialCommandHandler = (request: FinancialCommandRequest) => void;

type Channel = {
    /** The command host registers here; the last host to mount wins, and unregisters on unmount. */
    register: (handler: FinancialCommandHandler | null) => void;
    /** A ledger row asks. Silently ignored when no host has registered — never a thrown error. */
    request: FinancialCommandHandler;
    /** Whether anything is listening, so a row can decline to offer what nobody can perform. */
    hasHost: () => boolean;
};

const FinancialCommandContext = createContext<Channel | null>(null);

export function FinancialCommandHost({ children }: { children: ReactNode }) {
    const handlerRef = useRef<FinancialCommandHandler | null>(null);
    const value = useMemo<Channel>(
        () => ({
            register: (handler) => {
                handlerRef.current = handler;
            },
            request: (r) => handlerRef.current?.(r),
            hasHost: () => handlerRef.current != null,
        }),
        [],
    );
    return <FinancialCommandContext.Provider value={value}>{children}</FinancialCommandContext.Provider>;
}

/** The surface that owns the command shell says so, and says what it can perform. */
export function useRegisterFinancialCommandHost(handler: FinancialCommandHandler | null): void {
    const channel = useContext(FinancialCommandContext);
    const stable = useCallback<FinancialCommandHandler>((r) => handler?.(r), [handler]);
    useEffect(() => {
        if (!channel) return;
        channel.register(handler ? stable : null);
        return () => channel.register(null);
    }, [channel, handler, stable]);
}

/** Null where no host is hosting commands — the caller then offers none. */
export function useFinancialCommandChannel(): Channel | null {
    return useContext(FinancialCommandContext);
}
