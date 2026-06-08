import {
    ADMINV2_COMMAND_SURFACE_Z,
    ADMINV2_DRAWER_ACTION_MODAL_Z,
} from "@/components/admin/Drawer";

/** Registry action modals — above drawer panel (70) and BOS command surface (90). */
export const ADMINV2_DRAWER_ACTION_MODAL_LAYER_Z = ADMINV2_COMMAND_SURFACE_Z + 5;

/** Legacy constant re-export for callers that already import from Drawer. */
export { ADMINV2_DRAWER_ACTION_MODAL_Z };
