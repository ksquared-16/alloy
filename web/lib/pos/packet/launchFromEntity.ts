/**
 * POS Packet — launch-from-record context parsing.
 *
 * A parent packet prefills "known info" only when its public link is minted with a
 * `launch_from_entity` (an opportunity / customer / person / customer_member). This pure
 * helper validates the operator's record selection before it is sent to the packet
 * create/mint path, which sets `source_entity_*` + `prefill_enabled` and drives server
 * prefill (`mintPacketPublicLinkForAdmin` → public submissions prefill).
 *
 * Pure: no I/O. Org membership of the record is checked server-side (`assertEntityInOrg`)
 * during minting; this only validates shape (type + uuid).
 */

export const LAUNCH_ENTITY_TYPES = ["opportunity", "customer", "person", "customer_member"] as const;
export type LaunchEntityType = (typeof LAUNCH_ENTITY_TYPES)[number];

export interface LaunchFromEntity {
    entity_type: LaunchEntityType;
    entity_id: string;
    prefill_enabled?: boolean;
}

export interface LaunchFromEntityInput {
    entityType?: string | null;
    entityId?: string | null;
    prefillEnabled?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLaunchEntityType(v: unknown): v is LaunchEntityType {
    return typeof v === "string" && (LAUNCH_ENTITY_TYPES as readonly string[]).includes(v);
}

/**
 * Validate an operator's launch-from-record selection.
 *
 * - Both fields empty → `{ ok: true, value: null }` (no launch context; packet is filled
 *   fresh by the parent).
 * - Otherwise both are required and validated (type in the allowed set, id is a uuid).
 */
export function parseLaunchFromEntityInput(
    input: LaunchFromEntityInput
): { ok: true; value: LaunchFromEntity | null } | { ok: false; error: string } {
    const type = (input.entityType ?? "").trim();
    const id = (input.entityId ?? "").trim();

    if (!type && !id) return { ok: true, value: null };

    if (!type) return { ok: false, error: "Choose a record type to launch from." };
    if (!isLaunchEntityType(type)) {
        return { ok: false, error: "Record type must be opportunity, customer, person, or child (customer_member)." };
    }
    if (!id) return { ok: false, error: "Enter the record id to launch from." };
    if (!UUID_RE.test(id)) return { ok: false, error: "Record id must be a valid id (UUID)." };

    return {
        ok: true,
        value: {
            entity_type: type,
            entity_id: id,
            ...(input.prefillEnabled === false ? { prefill_enabled: false } : {}),
        },
    };
}

/** Parse a raw request body's `launch_from_entity` (API-side). Returns null when absent. */
export function parseLaunchFromEntityBody(
    raw: unknown
): { ok: true; value: LaunchFromEntity | null } | { ok: false; error: string } {
    if (raw === undefined || raw === null) return { ok: true, value: null };
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "launch_from_entity must be an object" };
    }
    const lf = raw as Record<string, unknown>;
    return parseLaunchFromEntityInput({
        entityType: typeof lf.entity_type === "string" ? lf.entity_type : "",
        entityId: typeof lf.entity_id === "string" ? lf.entity_id : "",
        prefillEnabled: typeof lf.prefill_enabled === "boolean" ? lf.prefill_enabled : undefined,
    });
}
