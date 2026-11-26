/**
 * What every kiosk request must establish before it may do anything.
 *
 * Both public kiosk routes begin here, and they begin identically on purpose: a
 * second entry point that resolved trust slightly differently would become the
 * way in. The order is the security model, top to bottom:
 *
 *   1. the DEVICE is trusted        — else nothing else is even attempted
 *   2. the device may record here   — Thread 2A's non-human gate, its own site
 *   3. the caller is within budget  — bounded guessing, keyed on the device
 *   4. the PERSON is identified     — a code, resolving to an identity and no more
 *   5. the CHILDREN are decided     — per child, site-scoped, by the pure policy
 *
 * Nothing in a request body can move steps 1–3. The org and the site are read off
 * the device row, so a manipulated payload cannot name a tenant, a site, or a
 * capability.
 */

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertNonHumanCaptureAllowed } from "@/lib/childcareOperational/attendance/attendancePermissions";
import {
    kioskProducerAuthority,
    resolveKioskDevice,
    type TrustedKioskDevice,
} from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAuthority";
import {
    clearKioskIdentifyBudget,
    takeKioskRateLimit,
    type KioskRateLimitKind,
} from "@/lib/childcareOperational/attendance/kiosk/kioskRateLimit";
import {
    resolveKioskSession,
    type KioskSessionResolution,
} from "@/lib/childcareOperational/attendance/kiosk/kioskSessionGateway";
import type { KioskOperation } from "@/lib/childcareOperational/attendance/kiosk/kioskChildEligibility";

/** The header a kiosk presents its credential in. Never a query string: URLs get logged. */
export const KIOSK_CREDENTIAL_HEADER = "x-alloy-kiosk-credential";

/**
 * The one thing a kiosk is ever told when it is not trusted, and the one thing an
 * adult is ever told when identification fails. Deliberately identical across
 * unknown credential, revoked device, wrong code and unknown person: a caller who
 * can tell these apart can map the estate.
 */
export const KIOSK_GENERIC_DENIAL = "Please see a member of staff.";

export type KioskDeviceContext =
    | { ok: true; device: TrustedKioskDevice }
    | { ok: false; status: number; retryAfter?: number };

/** Steps 1–3. Returns a device, or a status and nothing else. */
export async function resolveKioskRequestDevice(
    request: NextRequest,
    supabase: SupabaseClient,
    kind: KioskRateLimitKind,
): Promise<KioskDeviceContext> {
    const presented = request.headers.get(KIOSK_CREDENTIAL_HEADER);
    const resolved = await resolveKioskDevice(supabase, presented);
    if (!resolved.ok) {
        // 401 for every refusal, including a failed lookup. Distinguishing
        // "unknown" from "revoked" tells a probe whether a secret was ever real.
        return { ok: false, status: 401 };
    }

    const device = resolved.device;

    // The device's capability and site scope, decided by Thread 2A's primitive
    // rather than by anything written here.
    const permitted = await assertNonHumanCaptureAllowed({
        authority: kioskProducerAuthority(device),
        siteLocationId: device.siteLocationId,
    });
    if (!permitted.ok) return { ok: false, status: 403 };

    const retryAfter = takeKioskRateLimit(request, kind, device.producerKey);
    if (retryAfter != null) return { ok: false, status: 429, retryAfter };

    return { ok: true, device };
}

/** Step 4–5, always re-run server-side. There is no session to trust between calls. */
export async function resolveKioskInteraction(params: {
    request: NextRequest;
    supabase: SupabaseClient;
    device: TrustedKioskDevice;
    code: string;
    operation: KioskOperation;
    serviceDate: string;
}): Promise<KioskSessionResolution> {
    const session = await resolveKioskSession({
        supabase: params.supabase,
        device: params.device,
        code: params.code,
        operation: params.operation,
        onDate: params.serviceDate,
    });
    // A correct code should not leave a family throttled by the morning's typos.
    if (session.personId) clearKioskIdentifyBudget(params.request, params.device.producerKey);
    return session;
}
