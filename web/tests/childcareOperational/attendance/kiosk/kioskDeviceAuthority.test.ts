/**
 * The first thing that ever mints a NonHumanProducerAuthority.
 *
 * Thread 2A's gate has denied every non-human producer since it was written,
 * because nothing could mint one. That was the correct default and it is the
 * reason these tests are written from the refusals inward: the value of this
 * module is measured by what it declines to hand the gate.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    hashKioskCredential,
    kioskMayRecordAttendance,
    kioskProducerAuthority,
    resolveKioskDevice,
    type TrustedKioskDevice,
} from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAuthority";
import { assertNonHumanCaptureAllowed } from "@/lib/childcareOperational/attendance/attendancePermissions";

const SITE = "site-1";
const OTHER_SITE = "site-2";

function row(over: Record<string, unknown> = {}) {
    return {
        id: "dev-1",
        org_id: "org-1",
        site_location_id: SITE,
        producer_key: "kiosk:riverside:front-desk",
        label: "Front desk tablet",
        capabilities: ["attendance.record"],
        status: "active",
        ...over,
    };
}

/** Records the filter the resolver actually selected on. */
function supa(result: { data: unknown; error: unknown }) {
    const calls: Record<string, unknown> = {};
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: unknown) => {
        calls[col] = val;
        return api;
    };
    api.maybeSingle = async () => result;
    return { client: { from: vi.fn(() => api) } as unknown as SupabaseClient, calls };
}

const device: TrustedKioskDevice = {
    id: "dev-1",
    orgId: "org-1",
    siteLocationId: SITE,
    producerKey: "kiosk:riverside:front-desk",
    label: "Front desk tablet",
    capabilities: ["attendance.record"],
};

describe("a secret is never compared in this process", () => {
    it("selects by the hash of the presented secret, not by a producer key", () => {
        // The lookup shape IS the defence: an indexed equality on a digest, with
        // no per-byte comparison to time. Selecting by producer_key and then
        // comparing would reintroduce exactly that.
        const { client, calls } = supa({ data: row(), error: null });
        return resolveKioskDevice(client, "s3cret").then(() => {
            expect(Object.keys(calls)).toEqual(["credential_hash"]);
            expect(calls.credential_hash).toBe(hashKioskCredential("s3cret"));
        });
    });

    it("hashes stably and ignores surrounding whitespace", () => {
        expect(hashKioskCredential(" s3cret ")).toBe(hashKioskCredential("s3cret"));
        expect(hashKioskCredential("s3cret")).toHaveLength(64);
        expect(hashKioskCredential("s3cret")).not.toBe(hashKioskCredential("s3crey"));
    });
});

describe("every refusal hands the gate nothing", () => {
    it("refuses an empty credential without touching storage", async () => {
        const { client } = supa({ data: null, error: null });
        expect(await resolveKioskDevice(client, "   ")).toEqual({ ok: false, code: "missing_credential" });
        expect(client.from).not.toHaveBeenCalled();
    });

    it("refuses an unknown credential", async () => {
        const { client } = supa({ data: null, error: null });
        expect(await resolveKioskDevice(client, "nope")).toEqual({ ok: false, code: "unknown_credential" });
    });

    it("refuses a revoked device even though its secret still matches", async () => {
        const { client } = supa({ data: row({ status: "revoked" }), error: null });
        expect(await resolveKioskDevice(client, "s3cret")).toEqual({ ok: false, code: "revoked" });
    });

    it("refuses when the lookup itself failed, and says so distinctly", async () => {
        // A broken read that reads as a bad credential is how an outage becomes a
        // silent authorization change.
        const { client } = supa({ data: null, error: { message: "boom" } });
        expect(await resolveKioskDevice(client, "s3cret")).toEqual({ ok: false, code: "lookup_failed" });
    });

    it("resolves a live device to its own org and site, read from the row", async () => {
        // The org is never accepted from the caller: a kiosk request cannot name
        // the tenant it wants to be.
        const { client } = supa({ data: row(), error: null });
        const res = await resolveKioskDevice(client, "s3cret");
        expect(res).toMatchObject({ ok: true, device: { orgId: "org-1", siteLocationId: SITE } });
    });
});

describe("the authority it mints is exactly one site wide", () => {
    it("scopes the producer to the device's own site", () => {
        expect(kioskProducerAuthority(device)).toEqual({
            producerKey: "kiosk:riverside:front-desk",
            allowedSiteLocationIds: [SITE],
            grantedPermissionKeys: ["attendance.record"],
        });
    });

    it("passes Thread 2A's gate for its own site", async () => {
        const verdict = await assertNonHumanCaptureAllowed({
            authority: kioskProducerAuthority(device),
            siteLocationId: SITE,
        });
        expect(verdict.ok).toBe(true);
    });

    it("is refused by that same gate for any other site", async () => {
        // Scenario E, decided by the shared primitive rather than by kiosk code.
        const verdict = await assertNonHumanCaptureAllowed({
            authority: kioskProducerAuthority(device),
            siteLocationId: OTHER_SITE,
        });
        expect(verdict).toMatchObject({ ok: false, code: "producer_site_out_of_scope" });
    });

    it("is refused when the device holds no attendance capability", async () => {
        const capless = { ...device, capabilities: ["attendance.read"] };
        expect(kioskMayRecordAttendance(capless)).toBe(false);
        const verdict = await assertNonHumanCaptureAllowed({
            authority: kioskProducerAuthority(capless),
            siteLocationId: SITE,
        });
        expect(verdict).toMatchObject({ ok: false, code: "producer_permission_denied" });
    });

    it("is refused when no authority exists at all", async () => {
        const verdict = await assertNonHumanCaptureAllowed({ authority: null, siteLocationId: SITE });
        expect(verdict).toMatchObject({ ok: false, code: "producer_unregistered" });
    });
});
