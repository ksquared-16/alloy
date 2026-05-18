/**
 * Safe V1 mutations for action_placements (Settings control plane).
 */

import type { ActionSlot, ActionSurface } from "@/lib/admin/actions/types";

export const ACTION_PLACEMENT_SURFACES: readonly ActionSurface[] = [
    "record_header",
    "record_section",
    "queue_row",
    "work_unit",
    "department",
    "workspace",
    "right_rail",
] as const;

export const ACTION_PLACEMENT_SLOTS: readonly ActionSlot[] = [
    "primary",
    "secondary",
    "overflow",
    "right_rail",
    "row_inline",
    "header",
] as const;

export const ACTION_PLACEMENT_DISPLAY_STYLES = ["button", "icon_button", "link", "menu_item"] as const;

/** Surfaces operators may move placements between in Settings V1. */
export const OPERATOR_EDITABLE_ACTION_SURFACES: readonly ActionSurface[] = ["record_header", "record_section"] as const;

export type ActionPlacementPatchInput = {
    is_active?: boolean;
    order_index?: number;
    surface?: ActionSurface;
    slot?: ActionSlot;
    section_key?: string | null;
    display_style?: string;
};

export type ActionPlacementCreateInput = {
    action_definition_id: string;
    surface: ActionSurface;
    slot: ActionSlot;
    entity_type: string | null;
    section_key?: string | null;
    order_index?: number;
    display_style?: string;
};

export class ActionPlacementValidationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

function isSurface(v: string): v is ActionSurface {
    return (ACTION_PLACEMENT_SURFACES as readonly string[]).includes(v);
}

function isSlot(v: string): v is ActionSlot {
    return (ACTION_PLACEMENT_SLOTS as readonly string[]).includes(v);
}

export function validateActionPlacementPatch(body: unknown): ActionPlacementPatchInput {
    if (!body || typeof body !== "object") {
        throw new ActionPlacementValidationError("Invalid body");
    }
    const b = body as Record<string, unknown>;
    const out: ActionPlacementPatchInput = {};

    if ("is_active" in b) {
        if (typeof b.is_active !== "boolean") throw new ActionPlacementValidationError("is_active must be a boolean");
        out.is_active = b.is_active;
    }
    if ("order_index" in b) {
        const n = Number(b.order_index);
        if (!Number.isFinite(n) || n < 0 || n > 9999) {
            throw new ActionPlacementValidationError("order_index must be between 0 and 9999");
        }
        out.order_index = Math.floor(n);
    }
    if ("surface" in b) {
        const s = String(b.surface ?? "").trim();
        if (!isSurface(s)) throw new ActionPlacementValidationError("Invalid surface");
        if (!(OPERATOR_EDITABLE_ACTION_SURFACES as readonly string[]).includes(s)) {
            throw new ActionPlacementValidationError(
                "Only record drawer surfaces (record header, record section) can be changed in Settings"
            );
        }
        out.surface = s;
    }
    if ("slot" in b) {
        const s = String(b.slot ?? "").trim();
        if (!isSlot(s)) throw new ActionPlacementValidationError("Invalid slot");
        out.slot = s;
    }
    if ("section_key" in b) {
        if (b.section_key === null || b.section_key === "") {
            out.section_key = null;
        } else {
            const sk = String(b.section_key).trim();
            if (!/^[a-z0-9_]{1,128}$/.test(sk)) {
                throw new ActionPlacementValidationError("Invalid section_key");
            }
            out.section_key = sk;
        }
    }
    if ("display_style" in b) {
        const ds = String(b.display_style ?? "").trim();
        if (!(ACTION_PLACEMENT_DISPLAY_STYLES as readonly string[]).includes(ds)) {
            throw new ActionPlacementValidationError("Invalid display_style");
        }
        out.display_style = ds;
    }

    if (!Object.keys(out).length) {
        throw new ActionPlacementValidationError("No supported fields to update");
    }
    return out;
}

export function validateActionPlacementCreate(body: unknown): ActionPlacementCreateInput {
    if (!body || typeof body !== "object") {
        throw new ActionPlacementValidationError("Invalid body");
    }
    const b = body as Record<string, unknown>;
    const action_definition_id = String(b.action_definition_id ?? "").trim();
    if (!action_definition_id) throw new ActionPlacementValidationError("action_definition_id is required");

    const surface = String(b.surface ?? "").trim();
    if (!isSurface(surface) || !(OPERATOR_EDITABLE_ACTION_SURFACES as readonly string[]).includes(surface)) {
        throw new ActionPlacementValidationError("surface must be record_header or record_section");
    }

    const slot = String(b.slot ?? "").trim();
    if (!isSlot(slot)) throw new ActionPlacementValidationError("Invalid slot");

    const entity_type =
        b.entity_type === null || b.entity_type === undefined || b.entity_type === ""
            ? null
            : String(b.entity_type).trim().toLowerCase();

    if (surface === "record_section") {
        const sk = b.section_key === null || b.section_key === undefined ? "" : String(b.section_key).trim();
        if (!sk) throw new ActionPlacementValidationError("section_key is required for record_section placements");
        if (!/^[a-z0-9_]{1,128}$/.test(sk)) {
            throw new ActionPlacementValidationError("Invalid section_key");
        }
    }

    let section_key: string | null = null;
    if (b.section_key != null && b.section_key !== "") {
        section_key = String(b.section_key).trim();
        if (!/^[a-z0-9_]{1,128}$/.test(section_key)) {
            throw new ActionPlacementValidationError("Invalid section_key");
        }
    }

    const order_index =
        b.order_index === undefined ? 100 : Math.floor(Number(b.order_index));
    if (!Number.isFinite(order_index) || order_index < 0 || order_index > 9999) {
        throw new ActionPlacementValidationError("order_index must be between 0 and 9999");
    }

    const display_style = b.display_style === undefined ? "button" : String(b.display_style).trim();
    if (!(ACTION_PLACEMENT_DISPLAY_STYLES as readonly string[]).includes(display_style)) {
        throw new ActionPlacementValidationError("Invalid display_style");
    }

    return {
        action_definition_id,
        surface,
        slot,
        entity_type,
        section_key,
        order_index,
        display_style,
    };
}

/** Whether Settings may PATCH this placement row. */
export function actionPlacementEditableInSettings(orgId: string, placementOrgId: string | null): boolean {
    return placementOrgId != null && placementOrgId === orgId;
}

export function actionPlacementLockedReason(placementOrgId: string | null): string {
    if (placementOrgId == null) return "Platform-managed placement";
    return "Managed elsewhere";
}
