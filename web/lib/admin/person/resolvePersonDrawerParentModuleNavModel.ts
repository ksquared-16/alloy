export type PersonDrawerParentModuleNavItem = {
    key: string;
    label: string;
    actionable: boolean;
};

const MODULE_KEYS = ["documents", "communications", "activity"] as const;

/** Parent operational module shortcuts — stay inside person drawer. */
export function resolvePersonDrawerParentModuleNavModel(): PersonDrawerParentModuleNavItem[] {
    return MODULE_KEYS.map((key) => ({
        key,
        label: key === "activity" ? "Activity" : key === "communications" ? "Communications" : "Documents",
        actionable: true,
    }));
}
