"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

export type WorkspaceCommandRailRegistration = {
    actions: ReactNode | null;
    telemetry: ReactNode | null;
};

type WorkspaceCommandRailRegistryContextValue = {
    registration: WorkspaceCommandRailRegistration;
    register: (next: WorkspaceCommandRailRegistration) => void;
    unregister: () => void;
};

const EMPTY_REGISTRATION: WorkspaceCommandRailRegistration = {
    actions: null,
    telemetry: null,
};

const WorkspaceCommandRailRegistryContext =
    createContext<WorkspaceCommandRailRegistryContextValue | null>(null);

export function WorkspaceCommandRailRegistryProvider({ children }: { children: ReactNode }) {
    const [registration, setRegistration] = useState<WorkspaceCommandRailRegistration>(EMPTY_REGISTRATION);

    const register = useCallback((next: WorkspaceCommandRailRegistration) => {
        setRegistration(next);
    }, []);

    const unregister = useCallback(() => {
        setRegistration(EMPTY_REGISTRATION);
    }, []);

    const value = useMemo(
        () => ({ registration, register, unregister }),
        [registration, register, unregister]
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

/** True when the shell owns the command rail (pages register slots instead of rendering a local column). */
export function usePersistentCommandRailEnabled(): boolean {
    return useWorkspaceCommandRailRegistryOptional() != null;
}
