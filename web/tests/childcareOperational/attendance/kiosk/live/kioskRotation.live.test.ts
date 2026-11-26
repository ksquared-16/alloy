/**
 * Scenarios L and N2, against the real certification database and the real
 * server — the two properties a browser cannot reach.
 *
 * Rotation and mid-interaction revocation both need a secret to CHANGE between
 * two requests. Playwright cannot rotate a credential, and a unit test with a
 * stubbed client would prove only that the stub returned what it was told. So
 * these drive the deployed kiosk routes over HTTP while mutating the credential
 * through the same production rotation functions the admin path will use.
 *
 * Skips — loudly, not silently — when the certification stack is not up.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import {
    revokeKioskPersonCode,
    rotateKioskDeviceCredential,
    rotateKioskPersonCode,
} from "@/lib/childcareOperational/attendance/kiosk/kioskCredentialRotation";
import { hashKioskCredential } from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAuthority";
import { hashKioskPersonCode } from "@/lib/childcareOperational/attendance/kiosk/kioskSessionGateway";
import { recordAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const APP = process.env.CERT_APP_URL ?? "http://localhost:3011";
const describeLive = env ? describe : describe.skip;
if (env) {
    /*
     * The attendance writer and its event emitter build their OWN clients from
     * the environment rather than taking this suite's. Reading the certification
     * file into a local variable is therefore not enough — it has to be
     * published, or arranging a fact through the production writer fails inside
     * the emitter with no client to emit through.
     */
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE_DEVICE = "00000000-0000-4000-8000-000070000010";
const RIVERSIDE_SECRET = "cert-kiosk-riverside-secret";
const RIVERSIDE_PRODUCER = "kiosk:cert:riverside-front-desk";
const PRIYA = "00000000-0000-4000-8000-000070000021";
const PRIYA_CODE = "10000002";
const IVY = "00000000-0000-4000-8000-000070000052";
const ROOM_A = "00000000-0000-4000-8000-000000000013";

async function identify(credential: string, code: string) {
    return fetch(`${APP}/api/public/kiosk/identify`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-alloy-kiosk-credential": credential },
        body: JSON.stringify({ operation: "check_in", code }),
    });
}

describeLive("kiosk credential rotation and revocation — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const FIXTURE_CODE_ROW = "00000000-0000-4000-8000-000070000041";

    /**
     * Put the fixture back, whatever the tests did.
     *
     * NOT by re-inserting the original code: `uq_person_kiosk_code_hash` is
     * unconditional, so the revoked row still owns that digest and a retired code
     * can never be reissued. That is deliberate and load-bearing — resolution
     * does `maybeSingle()` on the hash, and two rows sharing one would make
     * identification ambiguous rather than merely untidy.
     *
     * So the rotation-created rows are removed and the fixture's own row is
     * reactivated, which is the only restore that respects that index.
     */
    afterAll(async () => {
        if (!supabase) return;
        await supabase
            .from("attendance_kiosk_devices")
            .update({ credential_hash: hashKioskCredential(RIVERSIDE_SECRET), credential_last_four: RIVERSIDE_SECRET.slice(-4) })
            .eq("id", RIVERSIDE_DEVICE);
        await supabase
            .from("person_kiosk_codes")
            .delete()
            .eq("org_id", ORG)
            .eq("person_id", PRIYA)
            .neq("id", FIXTURE_CODE_ROW);
        await supabase
            .from("person_kiosk_codes")
            .update({ status: "active", revoked_at: null, code_hash: hashKioskPersonCode(PRIYA_CODE) })
            .eq("id", FIXTURE_CODE_ROW);
    });

    /**
     * A fact this device authored BEFORE the rotation.
     *
     * Arranged here rather than assumed. Step 6 below asks whether rotating a
     * secret orphans the provenance of earlier facts, and that question needs an
     * earlier fact to exist — depending on one another suite happened to leave
     * behind made this scenario silently order-dependent, and it began failing
     * the moment a shared certification stack was cleaned between runs. A test
     * that needs a precondition should create it.
     */
    async function ensureEarlierKioskFact(): Promise<void> {
        const { data: existing } = await supabase
            .from("child_attendance_events")
            .select("id")
            .eq("org_id", ORG)
            .eq("source_key", RIVERSIDE_PRODUCER)
            .limit(1);
        if ((existing ?? []).length > 0) return;

        const { data: agreement } = await supabase
            .from("child_enrollment_agreements")
            .select("id")
            .eq("org_id", ORG)
            .eq("customer_member_id", IVY)
            .limit(1)
            .maybeSingle();
        const agreementId = (agreement as { id: string } | null)?.id;
        if (!agreementId) throw new Error("kiosk fixture: Ivy has no enrolment to attach a prior fact to");

        const today = new Date().toISOString().slice(0, 10);
        await recordAttendanceEvent(supabase, {
            orgId: ORG,
            enrollmentAgreementId: agreementId,
            eventKind: "check_in",
            eventAt: `${today}T07:30:00.000Z`,
            serviceDate: today,
            roomLocationId: ROOM_A,
            idempotencyKey: `cert-kiosk-prior-fact-${today}`,
            actor: {
                actorType: "system",
                actorLabel: "Riverside front desk",
                sourceType: "kiosk",
                sourceKey: RIVERSIDE_PRODUCER,
            },
        } as Parameters<typeof recordAttendanceEvent>[1]);
    }

    it("L-device — rotation replaces the secret rather than adding one", async () => {
        await ensureEarlierKioskFact();

        // 1. the old credential works
        expect((await identify(RIVERSIDE_SECRET, PRIYA_CODE)).status, "the fixture credential should work first").toBe(200);

        // 2. rotate through the production function
        const rotated = await rotateKioskDeviceCredential(supabase, { orgId: ORG, deviceId: RIVERSIDE_DEVICE });
        expect(rotated.ok).toBe(true);
        const fresh = rotated.ok ? rotated.secret : "";

        // 3. the OLD credential must now fail. This is the assertion that
        //    distinguishes rotation from "add another valid secret".
        expect((await identify(RIVERSIDE_SECRET, PRIYA_CODE)).status, "the rotated-away credential still worked").toBe(401);

        // 4. the new one works
        expect((await identify(fresh, PRIYA_CODE)).status).toBe(200);

        // 5. the producer identity is STABLE — rotating a secret must not orphan
        //    the provenance of facts already authored under this device.
        const { data } = await supabase
            .from("attendance_kiosk_devices")
            .select("producer_key, rotated_at")
            .eq("id", RIVERSIDE_DEVICE)
            .maybeSingle();
        expect((data as { producer_key: string } | null)?.producer_key).toBe(RIVERSIDE_PRODUCER);
        expect((data as { rotated_at: string | null } | null)?.rotated_at).toBeTruthy();

        // 6. and historical facts still name that producer.
        const { data: facts } = await supabase
            .from("child_attendance_events")
            .select("source_key")
            .eq("org_id", ORG)
            .eq("source_key", RIVERSIDE_PRODUCER)
            .limit(1);
        expect((facts ?? []).length, "earlier kiosk facts lost their producer identity").toBeGreaterThan(0);

        // restore for the remaining tests
        await supabase
            .from("attendance_kiosk_devices")
            .update({ credential_hash: hashKioskCredential(RIVERSIDE_SECRET) })
            .eq("id", RIVERSIDE_DEVICE);
    });

    it("L-person — a rotated code replaces the old one, which stops working", async () => {
        expect((await identify(RIVERSIDE_SECRET, PRIYA_CODE)).status).toBe(200);

        const rotated = await rotateKioskPersonCode(supabase, { orgId: ORG, personId: PRIYA });
        expect(rotated.ok).toBe(true);
        const fresh = rotated.ok ? rotated.secret : "";

        // The old code resolves to nobody now, so the answer is an empty set —
        // the same shape a wrong code gets, which is deliberate.
        const stale = await identify(RIVERSIDE_SECRET, PRIYA_CODE);
        expect(stale.status).toBe(200);
        expect(((await stale.json()) as { children: unknown[] }).children).toEqual([]);

        const live = await identify(RIVERSIDE_SECRET, fresh);
        expect(((await live.json()) as { children: unknown[] }).children.length).toBeGreaterThan(0);

        // And only ONE code is active for this adult — the partial unique index
        // makes "rotation added a second valid secret" unrepresentable.
        const { data } = await supabase
            .from("person_kiosk_codes")
            .select("id")
            .eq("org_id", ORG)
            .eq("person_id", PRIYA)
            .eq("status", "active");
        expect((data ?? []).length).toBe(1);
    });

    it("N2 — a code revoked between identify and capture fails on capture", async () => {
        /*
         * The property that makes a sessionless kiosk safe: authority is not
         * carried between the two calls, it is re-resolved. Nothing the browser
         * holds can outlive the revocation.
         */
        const current = await rotateKioskPersonCode(supabase, { orgId: ORG, personId: PRIYA });
        const code = current.ok ? current.secret : "";

        const identified = await identify(RIVERSIDE_SECRET, code);
        expect(((await identified.json()) as { children: unknown[] }).children.length).toBeGreaterThan(0);

        const { count: before } = await supabase
            .from("child_attendance_events")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("customer_member_id", IVY);

        await revokeKioskPersonCode(supabase, { orgId: ORG, personId: PRIYA });

        const res = await fetch(`${APP}/api/public/kiosk/attendance`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-alloy-kiosk-credential": RIVERSIDE_SECRET },
            body: JSON.stringify({
                operation: "check_in",
                code,
                child_ids: [IVY],
                operation_token: `live-n2-${Date.now()}`,
            }),
        });
        const json = (await res.json()) as { results: { recorded: boolean }[] };
        expect(json.results[0]?.recorded, "a revoked code still authored a fact").toBe(false);

        const { count: after } = await supabase
            .from("child_attendance_events")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("customer_member_id", IVY);
        expect(after ?? 0).toBe(before ?? 0);
    });
});
