/**
 * Turning a presented device secret into a trusted producer — or into nothing.
 *
 * ── THE GATE THIS FEEDS HAS BEEN DENYING EVERYTHING, CORRECTLY ──
 *
 * Thread 2A wrote `assertNonHumanCaptureAllowed` over a `NonHumanProducerAuthority`
 * and left it deliberately unreachable: no channel could mint one, so a kiosk or
 * integration could not quietly ride a human session's grants. This module is the
 * first minter. It does not widen that gate by one inch — it supplies the input
 * the gate was always designed to receive, and every failure path here returns
 * nothing rather than something weaker.
 *
 * ── THE DEVICE IS NOT THE PERSON, AND NOT A USER ──
 *
 * A resolved device carries no role, no session and no user identity. It carries
 * one site and an explicit capability list. The adult standing at the tablet is
 * resolved separately and lands in a different column on the fact. A design that
 * let the device answer "who collected this child" would be a tablet signing for
 * a person.
 *
 * ── WHY THE LOOKUP IS THE DEFENCE ──
 *
 * The secret is hashed and used as an equality selector on a unique index. No
 * comparison happens in this process, so there is no per-byte early exit to time
 * — the same shape `web/lib/public/forms/tokenHash.ts` documents for form and
 * tour links, and the reason `timingSafeEqualHex` is correctly NOT called here.
 * The org is READ FROM THE ROW, never accepted from the caller: a kiosk request
 * cannot name the tenant it wants to be.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    ATTENDANCE_RECORD_PERMISSION_KEY,
    type NonHumanProducerAuthority,
} from "@/lib/childcareOperational/attendance/attendancePermissions";

/** A device the server has positively identified. */
export type TrustedKioskDevice = {
    id: string;
    orgId: string;
    /** The one site this device may operate for. */
    siteLocationId: string;
    /** Durable producer identity; becomes `source_key` on every fact it authors. */
    producerKey: string;
    label: string;
    capabilities: string[];
};

/**
 * Why a device was refused. Deliberately coarse on the wire: a caller learns that
 * it is not trusted, never which of these it was, because distinguishing "unknown
 * credential" from "revoked device" tells a probe whether a secret was ever real.
 */
export type KioskDeviceRefusal =
    | "missing_credential"
    | "unknown_credential"
    | "revoked"
    | "lookup_failed";

export type KioskDeviceResolution =
    | { ok: true; device: TrustedKioskDevice }
    | { ok: false; code: KioskDeviceRefusal };

/** SHA-256 hex of the presented secret; matches `attendance_kiosk_devices.credential_hash`. */
export function hashKioskCredential(plaintext: string): string {
    return createHash("sha256").update(String(plaintext).trim(), "utf8").digest("hex");
}

type DeviceRow = {
    id: string;
    org_id: string;
    site_location_id: string;
    producer_key: string;
    label: string;
    capabilities: string[] | null;
    status: string;
};

const DEVICE_COLUMNS = "id, org_id, site_location_id, producer_key, label, capabilities, status";

/**
 * Resolve a presented secret to a trusted device.
 *
 * A read ERROR is not "no such device": it is refused as `lookup_failed` rather
 * than folded into `unknown_credential`, because a broken lookup that reads as a
 * bad credential is how an outage becomes a silent authorization change.
 */
export async function resolveKioskDevice(
    supabase: SupabaseClient,
    presentedCredential: string | null | undefined,
): Promise<KioskDeviceResolution> {
    const secret = (presentedCredential ?? "").trim();
    if (!secret) return { ok: false, code: "missing_credential" };

    const { data, error } = await supabase
        .from("attendance_kiosk_devices")
        .select(DEVICE_COLUMNS)
        .eq("credential_hash", hashKioskCredential(secret))
        .maybeSingle();

    if (error) return { ok: false, code: "lookup_failed" };
    if (!data) return { ok: false, code: "unknown_credential" };

    const row = data as unknown as DeviceRow;
    // Revocation is checked HERE, on the row, not by remembering to filter the
    // query. A filter that is forgotten in one caller silently re-admits every
    // revoked tablet; a check on the resolved row cannot be forgotten by a caller
    // that never sees an unresolved row.
    if (row.status !== "active") return { ok: false, code: "revoked" };

    return {
        ok: true,
        device: {
            id: row.id,
            orgId: row.org_id,
            siteLocationId: row.site_location_id,
            producerKey: row.producer_key,
            label: row.label,
            capabilities: [...(row.capabilities ?? [])],
        },
    };
}

/**
 * The authority Thread 2A's gate consumes.
 *
 * Site scope is exactly one site — the device's own — so a manipulated request
 * naming another site is refused by the same primitive that scopes an operator,
 * without this module having to think about it.
 */
export function kioskProducerAuthority(device: TrustedKioskDevice): NonHumanProducerAuthority {
    return {
        producerKey: device.producerKey,
        allowedSiteLocationIds: [device.siteLocationId],
        grantedPermissionKeys: [...device.capabilities],
    };
}

/** Does this device hold the capability to author attendance at all? */
export function kioskMayRecordAttendance(device: TrustedKioskDevice): boolean {
    return device.capabilities.includes(ATTENDANCE_RECORD_PERMISSION_KEY);
}
