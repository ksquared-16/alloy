"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useSyncExternalStore,
    type ReactNode,
} from "react";

export type WorkspaceCommandRailRegistration = {
    actions: ReactNode | null;
    telemetry: ReactNode | null;
};

type WorkspaceCommandRailRegistryContextValue = {
    register: (next: WorkspaceCommandRailRegistration) => void;
    unregister: () => void;
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => WorkspaceCommandRailRegistration;
};

const EMPTY_REGISTRATION: WorkspaceCommandRailRegistration = {
    actions: null,
    telemetry: null,
};

const WorkspaceCommandRailRegistryContext =
    createContext<WorkspaceCommandRailRegistryContextValue | null>(null);

export function WorkspaceCommandRailRegistryProvider({ children }: { children: ReactNode }) {
    const registrationRef = useRef<WorkspaceCommandRailRegistration>(EMPTY_REGISTRATION);
    const listenersRef = useRef<Set<() => void>>(new Set());

    const subscribe = useCallback((listener: () => void) => {
        listenersRef.current.add(listener);
        return () => {
            listenersRef.current.delete(listener);
        };
    }, []);

    const getSnapshot = useCallback(() => registrationRef.current, []);

    const notify = useCallback(() => {
        for (const listener of listenersRef.current) {
            listener();
        }
    }, []);

    const register = useCallback(
        (next: WorkspaceCommandRailRegistration) => {
            if (
                registrationRef.current.actions === next.actions &&
                registrationRef.current.telemetry === next.telemetry
            ) {
                return;
            }
            registrationRef.current = next;
            notify();
        },
        [notify]
    );

    /** No-op — last registered rail content stays visible until the next page registers (stale-while-revalidate). */
    const unregister = useCallback(() => {
        /* intentional no-op: avoid empty Actions/Telemetry flash during route transitions */
    }, []);

    const value = useMemo(
        () => ({ register, unregister, subscribe, getSnapshot }),
        [register, unregister, subscribe, getSnapshot]
    );

    return (
        <WorkspaceCommandRailRegistryContext.Provider value={value}>
            {children}
        </WorkspaceCommandRailRegistryContext.Provider>
    );
}

export function useWorkspaceCommandRailRegistryOptional() {
    return useContext(WorkspaceCommandRailRegistryContext);
}

export function useWorkspaceCommandRailRegistration(): WorkspaceCommandRailRegistration {
    const ctx = useWorkspaceCommandRailRegistryOptional();
    return useSyncExternalStore(
        ctx?.subscribe ?? (() => () => {}),
        ctx?.getSnapshot ?? (() => EMPTY_REGISTRATION),
        () => EMPTY_REGISTRATION
    );
}

/** True when the shell owns the command rail (pages register slots instead of rendering a local column). */
export function usePersistentCommandRailEnabled(): boolean {
    return useWorkspaceCommandRailRegistryOptional() != null;
}
