/** @deprecated Use `@/lib/admin/drawer/drawerOperatingSaveCoordinator` — re-exported for person drawer call sites. */
export type PersonDrawerEditSection = import("@/lib/admin/drawer/drawerOperatingSaveCoordinator").DrawerOperatingEditSection;

export {
    registerDrawerOperatingEditSection as registerPersonDrawerEditSection,
    drawerOperatingIsDirty as personDrawerOperatingIsDirty,
    drawerOperatingSaveAll as personDrawerOperatingSaveAll,
    drawerOperatingRevertAll as personDrawerOperatingRevertAll,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
