"use client";

import { useDrawerCommandRailActionsRegistrar } from "@/contexts/DrawerCommandRailActionsContext";
import type { DrawerCommandRailActionsRegistration } from "@/contexts/DrawerCommandRailActionsContext";

/** Registers active drawer actions for the workspace command rail (no UI). */
export function DrawerCommandRailActionsRegistrar({
    registration,
}: {
    registration: DrawerCommandRailActionsRegistration | null;
}) {
    useDrawerCommandRailActionsRegistrar(registration);
    return null;
}
