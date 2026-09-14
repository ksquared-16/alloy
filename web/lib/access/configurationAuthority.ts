import { NextResponse } from "next/server";

/**
 * OPTION SETS, LAYOUTS AND FIELD DEFINITIONS — capability authority, split by sensitivity.
 *
 * Seventeen handlers asked `ctx.role !== "admin"` while THREE capabilities describing the same
 * domains — `option_sets.manage`, `layouts.manage`, `fields.manage` — were already live, already
 * granted to admin AND ops, and already enforced through Config Layout Assist. So the product gave
 * two different answers about the same configuration: the assisted path asked what you can do, the
 * direct route asked what you are called. An operator could change a layout through one and be
 * refused by the other.
 *
 * ── WHY NOT SIMPLY ENFORCE THE THREE EXISTING KEYS EVERYWHERE ──
 *
 * Because the assisted path cannot do most of this. Its thirteen operation kinds contain NO delete
 * of any kind, and no layout version lifecycle at all: `layouts.manage` there governs putting a
 * field on a layout and reordering a section. So for seven routes, converging is genuine
 * compatibility alignment — a manage-key holder can already cause that exact effect. For the rest
 * it would be a silent authority expansion dressed as a cleanup.
 *
 * ── THE SPLIT ──
 *
 * `option_sets.manage`   creating and editing option sets and their items. Creation is included:
 *                        it starts no lifecycle and no version state machine.
 * `option_sets.delete`   removing a set or an item. Not implied by manage.
 * `layouts.manage`       editing a draft layout's document — the assisted-parity operation.
 * `layouts.lifecycle`    creating, duplicating, publishing and rolling back a layout. A version
 *                        state machine is not "editing inside a layout", and hiding it inside
 *                        manage would let an operator publish by being granted edit.
 * `fields.manage`        creating an org field, ordinary metadata updates, placement. The PATCH
 *                        cannot change `field_type` — ALLOWED_PATCH_KEYS excludes it — so there is
 *                        no schema authority hiding in here.
 * `fields.delete`        removing a field definition. Not implied by manage.
 *
 * Nothing implies anything else. A role that needs both holds both.
 *
 * ── TWO ROUTES THIS MODULE DELIBERATELY DOES NOT OWN ──
 *
 * `entity-layouts/[id]` DELETE is a MODEL_CONTRACT_DEFECT: the file's own header says published
 * rows are immutable and to publish a new version instead, yet the handler deletes published rows
 * and busts the `fps:` config read when it does. Giving that a capability would make a contradiction
 * look sanctioned. It keeps its role gate — no more reachable than before — pending the model owner.
 *
 * `field-definitions/ensure-platform-field` installs `is_system: true` rows that the org can then
 * never remove (DELETE refuses them) nor re-identify (PATCH freezes their identity). Whether that
 * one-way platform authority may be delegated to an arbitrary custom role is a product decision with
 * no doctrine behind it today, so it also keeps its role gate rather than being guessed into a key.
 */
export const OPTION_SETS_MANAGE = "option_sets.manage" as const;
export const OPTION_SETS_DELETE = "option_sets.delete" as const;
export const LAYOUTS_MANAGE = "layouts.manage" as const;
export const LAYOUTS_LIFECYCLE = "layouts.lifecycle" as const;
export const FIELDS_MANAGE = "fields.manage" as const;
export const FIELDS_DELETE = "fields.delete" as const;

export type ConfigurationCapability =
    | typeof OPTION_SETS_MANAGE
    | typeof OPTION_SETS_DELETE
    | typeof LAYOUTS_MANAGE
    | typeof LAYOUTS_LIFECYCLE
    | typeof FIELDS_MANAGE
    | typeof FIELDS_DELETE;

/** True when the caller's effective capabilities carry this configuration authority. */
export function hasConfigurationCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: ConfigurationCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * The refusal for a configuration mutation the caller has no capability for.
 *
 * Returns `null` when authorized, so a handler reads as
 * `const denied = requireConfigurationCapability(ctx, FIELDS_DELETE); if (denied) return denied;`
 */
export function requireConfigurationCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: ConfigurationCapability,
): NextResponse | null {
    if (hasConfigurationCapability(ctx, capability)) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
