/**
 * Layout editor — registry constraints (Phase 5.9).
 * Defines allowed primitives; operators compose blocks freely within these bounds.
 */

import {
    LAYOUT_EDITOR_BLOCK_EDIT_MODES,
    LAYOUT_EDITOR_BLOCK_TYPES,
    LAYOUT_EDITOR_BLOCK_VISIBILITY_RULES,
    LAYOUT_EDITOR_DATA_CONTEXTS,
} from "@/lib/layout/layoutEditorBlockConfig";
import { LAYOUT_EDITOR_CONTACT_ROLES } from "@/lib/layout/layoutEditorContactRoles";
import {
    LAYOUT_EDITOR_DISPLAY_TYPES,
    LAYOUT_LINK_BEHAVIORS,
    LAYOUT_TYPOGRAPHY_INTENTS,
} from "@/lib/layout/layoutEditorDisplayConfig";
import { LAYOUT_ADORNMENT_ICONS } from "@/lib/layout/layoutV2";

export const LAYOUT_EDITOR_REGISTRY_CONSTRAINTS = {
    blockTypes: LAYOUT_EDITOR_BLOCK_TYPES,
    dataContexts: LAYOUT_EDITOR_DATA_CONTEXTS,
    contactRoles: LAYOUT_EDITOR_CONTACT_ROLES,
    editModes: LAYOUT_EDITOR_BLOCK_EDIT_MODES,
    visibilityRules: LAYOUT_EDITOR_BLOCK_VISIBILITY_RULES,
    displayTypes: LAYOUT_EDITOR_DISPLAY_TYPES,
    linkBehaviors: LAYOUT_LINK_BEHAVIORS,
    typographyIntents: LAYOUT_TYPOGRAPHY_INTENTS,
    icons: LAYOUT_ADORNMENT_ICONS,
} as const;

export function isAllowedLayoutEditorBlockType(v: string): boolean {
    return (LAYOUT_EDITOR_BLOCK_TYPES as readonly string[]).includes(v);
}

export function isAllowedLayoutEditorDisplayType(v: string): boolean {
    return (LAYOUT_EDITOR_DISPLAY_TYPES as readonly string[]).includes(v);
}

export function isAllowedLayoutEditorLinkBehavior(v: string): boolean {
    return (LAYOUT_LINK_BEHAVIORS as readonly string[]).includes(v);
}
