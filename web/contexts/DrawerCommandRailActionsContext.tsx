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

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

export type DrawerCommandRailActionsRegistration = {
    actions: ResolvedActionForClient[];
    actionCount: number;
    canMutate: boolean;
    actionLoadingKey?: string | null;
    disabledReason?: string | null;
    onActionSelect: (action: ResolvedActionForClient) => void;
};

type DrawerCommandRailActionsContextValue = {
    registration: DrawerCommandRailActionsRegistration | null;
    register: (registration: DrawerCommandRailActionsRegistration) => void;
    unregister: () => void;
};

const DrawerCommandRailActionsContext = createContext<DrawerCommandRailActionsContextValue | null>(null);

export function DrawerCommandRailActionsProvider({ children }: { children: ReactNode }) {
    const [registration, setRegistration] = useState<DrawerCommandRailActionsRegistration | null>(null);

    const register = useCallback((next: DrawerCommandRailActionsRegistration) => {
        setRegistration(next);
    }, []);

    const unregister = useCallback(() => {
        setRegistration(null);
    }, []);

    const value = useMemo(
        () => ({ registration, register, unregister }),
        [registration, register, unregister]
    );

    return (
        <DrawerCommandRailActionsContext.Provider value={value}>
            {children}
        </DrawerCommandRailActionsContext.Provider>
    );
}

export function useDrawerCommandRailActionsOptional() {
    return useContext(DrawerCommandRailActionsContext);
}

export function useDrawerCommandRailActionsRegistrar(
    registration: DrawerCommandRailActionsRegistration | null
) {
    const ctx = useDrawerCommandRailActionsOptional();

    useEffect(() => {
        if (!ctx || !registration) return;
        ctx.register(registration);
        return () => ctx.unregister();
    }, [ctx, registration]);
}
