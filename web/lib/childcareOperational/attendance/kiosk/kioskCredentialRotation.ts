/**
 * Rotating and revoking kiosk secrets, so that rotation actually invalidates.
 *
 * ── THE FAILURE THIS IS SHAPED AGAINST ──
 *
 * The easy implementation of "rotate" is to insert a new secret and leave the old
 * row alone, which quietly turns rotation into "add another valid secret" — the
 * one outcome the Director named. Both paths here therefore make the old secret
 * unresolvable as part of the same act, not as a follow-up somebody could forget:
 *
 *   device — the credential hash is REPLACED ON THE ROW. The producer identity is
 *            a separate column and does not change, so facts already authored keep
 *            their provenance while the old secret stops resolving immediately.
 *   person — the old row is revoked and a new one inserted. The partial unique
 *            index `(org_id, person_id) WHERE status = 'active'` makes a second
 *            live code for one adult impossible at the database level, so a
 *            caller that forgot to revoke gets an error rather than two valid
 *            codes.
 *
 * There is NO bounded overlap window, deliberately. An overlap is a real
 * mechanism with a real reason — a fleet that cannot be reconfigured at once —
 * and none of that exists yet. Adding an unused overlap now would mean shipping
 * the exact "two valid secrets" state that rotation is supposed to end.
 */

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hashKioskCredential } from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAuthority";
import { hashKioskPersonCode } from "@/lib/childcareOperational/attendance/kiosk/kioskSessionGateway";

/** Unambiguous alphabet: no O/0, I/1, S/5 — these are read aloud and typed on glass. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY2346789";

/** A person's kiosk code. Short enough to type on a tablet, long enough to resist a bounded guesser. */
export function generateKioskPersonCode(length = 8): string {
    const bytes = randomBytes(length);
    let out = "";
    for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return out;
}

/** A device credential. Never read aloud, so it is long and opaque. */
export function generateKioskDeviceCredential(): string {
    return randomBytes(32).toString("base64url");
}

export type RotationOutcome<T> = { ok: true; secret: string; record: T } | { ok: false; code: string };

/**
 * Replace a device's credential in place.
 *
 * The write is conditioned on the device being ACTIVE: rotating a revoked device
 * would resurrect it, which is a different act and not one this function may
 * perform by accident.
 */
export async function rotateKioskDeviceCredential(
    supabase: SupabaseClient,
    params: { orgId: string; deviceId: string },
): Promise<RotationOutcome<{ deviceId: string }>> {
    const secret = generateKioskDeviceCredential();
    const { data, error } = await supabase
        .from("attendance_kiosk_devices")
        .update({
            credential_hash: hashKioskCredential(secret),
            credential_last_four: secret.slice(-4),
            rotated_at: new Date().toISOString(),
        })
        .eq("org_id", params.orgId)
        .eq("id", params.deviceId)
        .eq("status", "active")
        .select("id")
        .maybeSingle();

    if (error) return { ok: false, code: "rotation_failed" };
    if (!data) return { ok: false, code: "device_not_active" };
    return { ok: true, secret, record: { deviceId: (data as { id: string }).id } };
}

/** Revoke a device. Its credential stops resolving because resolution refuses a non-active row. */
export async function revokeKioskDevice(
    supabase: SupabaseClient,
    params: { orgId: string; deviceId: string; revokedBy?: string | null },
): Promise<{ ok: boolean }> {
    const { error } = await supabase
        .from("attendance_kiosk_devices")
        .update({
            status: "revoked",
            revoked_at: new Date().toISOString(),
            revoked_by: params.revokedBy ?? null,
        })
        .eq("org_id", params.orgId)
        .eq("id", params.deviceId);
    return { ok: !error };
}

/**
 * Issue a person a kiosk code, revoking any code they already hold.
 *
 * Revoke-then-insert, in that order. The database's partial unique index is the
 * backstop: if the revoke silently failed, the insert collides rather than
 * leaving the adult with two working codes.
 */
export async function rotateKioskPersonCode(
    supabase: SupabaseClient,
    params: { orgId: string; personId: string; issuedBy?: string | null },
): Promise<RotationOutcome<{ personId: string }>> {
    const now = new Date().toISOString();

    const { error: revokeError } = await supabase
        .from("person_kiosk_codes")
        .update({ status: "revoked", revoked_at: now })
        .eq("org_id", params.orgId)
        .eq("person_id", params.personId)
        .eq("status", "active");
    if (revokeError) return { ok: false, code: "revoke_failed" };

    const secret = generateKioskPersonCode();
    const { error: insertError } = await supabase.from("person_kiosk_codes").insert({
        org_id: params.orgId,
        person_id: params.personId,
        code_hash: hashKioskPersonCode(secret),
        status: "active",
        issued_at: now,
        issued_by: params.issuedBy ?? null,
        rotated_at: now,
    });
    if (insertError) return { ok: false, code: "issue_failed" };

    return { ok: true, secret, record: { personId: params.personId } };
}

/** Revoke a person's code without issuing a replacement. */
export async function revokeKioskPersonCode(
    supabase: SupabaseClient,
    params: { orgId: string; personId: string },
): Promise<{ ok: boolean }> {
    const { error } = await supabase
        .from("person_kiosk_codes")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("org_id", params.orgId)
        .eq("person_id", params.personId)
        .eq("status", "active");
    return { ok: !error };
}
