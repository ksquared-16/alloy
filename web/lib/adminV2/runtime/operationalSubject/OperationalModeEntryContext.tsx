"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import {
    OPERATIONAL_MODE_ENTRY_MESSAGES,
    type OperationalModeEntryPhase,
} from "@/lib/adminV2/runtime/operationalSubject/operationalModeEntryMessages";

export const ALLOY_OS_OPERATIONAL_MODE_PREPARING_ATTR = "data-alloy-os-operational-mode-preparing";
export const ALLOY_OS_OPERATIONAL_MODE_EMPTY_ATTR = "data-alloy-os-operational-mode-empty";

type OperationalModeEntryState = {
    phase: OperationalModeEntryPhase;
    message: string;
};

type OperationalModeEntryContextValue = OperationalModeEntryState & {
    setOperationalModeEntry: (next: OperationalModeEntryState) => void;
};

const OperationalModeEntryContext = createContext<OperationalModeEntryContextValue | null>(null);

export function OperationalModeEntryProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<OperationalModeEntryState>(() => ({
        phase: "preparing",
        message: OPERATIONAL_MODE_ENTRY_MESSAGES.preparingSurface,
    }));

    const setOperationalModeEntry = useCallback((next: OperationalModeEntryState) => {
        setState((prev) =>
            prev.phase === next.phase && prev.message === next.message ? prev : next,
        );
    }, []);

    const value = useMemo(
        (): OperationalModeEntryContextValue => ({
            phase: state.phase,
            message: state.message,
            setOperationalModeEntry,
        }),
        [setOperationalModeEntry, state.phase, state.message],
    );

    return (
        <OperationalModeEntryContext.Provider value={value}>{children}</OperationalModeEntryContext.Provider>
    );
}

export function useOperationalModeEntryOptional(): OperationalModeEntryContextValue | null {
    return useContext(OperationalModeEntryContext);
}

export function useOperationalModeEntry(): OperationalModeEntryContextValue {
    const ctx = useContext(OperationalModeEntryContext);
    if (!ctx) {
        throw new Error("useOperationalModeEntry requires OperationalModeEntryProvider");
    }
    return ctx;
}
