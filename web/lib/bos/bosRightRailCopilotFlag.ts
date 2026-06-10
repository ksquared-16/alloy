/** Feature flag: dock BOS in workspace Actions rail instead of bottom command bar. */
export function isBosRightRailCopilotEnabledClient(): boolean {
    return process.env.NEXT_PUBLIC_BOS_RIGHT_RAIL_COPILOT === "1";
}

/** Drawer registry actions render in the command rail instead of the drawer header menu. */
export function shouldRouteDrawerActionsToCommandRail(): boolean {
    return isBosRightRailCopilotEnabledClient();
}
