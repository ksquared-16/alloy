/** Feature flag: dock BOS in workspace Actions rail instead of bottom command bar. */
export function isBosRightRailCopilotEnabledClient(): boolean {
    return process.env.NEXT_PUBLIC_BOS_RIGHT_RAIL_COPILOT === "1";
}
