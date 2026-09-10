/**
 * External producer ingestion — against the real database.
 *
 * Every scenario runs the actual adapter: the credential is hashed and looked
 * up, the mapping is read, authority comes from the registry, and a committed
 * event reaches `recordAttendanceEvent` and lands in `child_attendance_events`.
 * Nothing is mocked, because the failure modes worth fearing here are exactly
 * the ones a mock cannot have — a mapping resolving to another tenant's child, a
 * replay authoring a second fact, a revoked producer still being trusted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashProducerCredential } from "@/lib/childcareOperational/attendance/integration/producerAuthority";
import { ingestExternalAttendanceEvent } from "@/lib/childcareOperational/attendance/integration/ingestExternalAttendance";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import { whereaboutsAt } from "@/lib/childcareOperational/attendance/attendanceWhereabouts";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../../.env.certification.local"), "utf8");
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
const describeLive = env ? describe : describe.skip;
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const ROOM_A = "00000000-0000-4000-8000-000000000013";
const ROOM_B = "00000000-0000-4000-8000-000000000014";
/** A Riverside enrollment and its child. */
const AGREEMENT = "00000000-0000-4000-8000-000070000060";
const CHILD = "00000000-0000-4000-8000-000070000050";

const PROVIDER = "classroom_coach";
const SECRET = "cert-integration-secret-alpha";
const OTHER_SECRET = "cert-integration-secret-beta";
const READONLY_SECRET = "cert-integration-secret-gamma";
/** A real second tenant, for proving the tenancy boundary rather than assuming it. */
const OTHER_ORG = "bbbb2222-0000-4000-8000-000000000002";
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();

const evt = (over: Partial<Parameters<typeof ingestExternalAttendanceEvent>[0]["event"]> = {}) => ({
    externalEventId: `cc-evt-${run}`,
    eventKind: "check_in" as const,
    externalChildId: "CC-CHILD-1",
    externalRoomId: "CC-ROOM-A",
    physicalEventAt: `${TODAY}T08:30:00.000Z`,
    raw: { provider: "classroom_coach" },
    ...over,
});

describeLive("external producer ingestion — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let producerId = "";
    let otherProducerId = "";
    let readOnlyProducerId = "";
    const writtenFactIds: string[] = [];

    /**
     * Evidence and producers are removable; attendance facts are NOT. The ledger
     * is append-only and its trigger refuses DELETE for every role, so the facts
     * these scenarios author stay in the certification tenant forever. That is
     * why every ledger assertion below filters on this run's `source_key` rather
     * than counting rows on the agreement — a count would drift with each run and
     * turn a real regression into an unreadable off-by-N.
     */
    async function cleanup() {
        // Evidence first: it holds an ON DELETE RESTRICT reference to producers.
        await supabase.from("attendance_integration_events").delete().eq("provider_key", PROVIDER);
        await supabase.from("attendance_integration_producers").delete().in("producer_key", [
            `integration:cert:${run}`,
            `integration:cert:${run}-other`,
            `integration:cert:${run}-readonly`,
            `integration:cert:${run}-crossorg`,
        ]);
    }

    const factsFromThisRun = async () => {
        const events = await listAttendanceEvents(supabase, ORG, { enrollmentAgreementId: AGREEMENT });
        return events.filter((e) => e.source_key === `integration:cert:${run}`);
    };

    beforeAll(async () => {
        await cleanup();

        const mk = async (key: string, secret: string, sites: string[], capabilities?: string[]) => {
            const { data, error } = await supabase
                .from("attendance_integration_producers")
                .insert({
                    org_id: ORG,
                    provider_key: PROVIDER,
                    producer_key: key,
                    label: `Cert ${key}`,
                    credential_hash: hashProducerCredential(secret),
                    credential_last_four: secret.slice(-4),
                    ...(capabilities ? { capabilities } : {}),
                })
                .select("id")
                .single();
            if (error) throw new Error(`producer fixture failed: ${error.message}`);
            const id = (data as { id: string }).id;
            for (const site of sites) {
                const r = await supabase
                    .from("attendance_integration_producer_sites")
                    .insert({ org_id: ORG, producer_id: id, site_location_id: site });
                if (r.error) throw new Error(`site grant failed: ${r.error.message}`);
            }
            return id;
        };

        producerId = await mk(`integration:cert:${run}`, SECRET, [RIVERSIDE]);
        // A second producer authorized for a DIFFERENT site, for the wrong-site
        // and cross-producer-mapping cases.
        otherProducerId = await mk(`integration:cert:${run}-other`, OTHER_SECRET, [LAKESIDE]);
        // A third that is registered, credentialed and site-authorized, and still
        // may not write — capability is its own dimension.
        readOnlyProducerId = await mk(`integration:cert:${run}-readonly`, READONLY_SECRET, [RIVERSIDE], [
            "attendance.read",
        ]);

        // Mappings belong to producer one only.
        for (const m of [
            { external_entity_type: "child", external_id: "CC-CHILD-1", child_customer_member_id: CHILD },
            { external_entity_type: "location", external_id: "CC-ROOM-A", location_id: ROOM_A },
            { external_entity_type: "location", external_id: "CC-ROOM-B", location_id: ROOM_B },
        ]) {
            const r = await supabase
                .from("attendance_integration_mappings")
                .insert({ org_id: ORG, producer_id: producerId, ...m });
            if (r.error) throw new Error(`mapping fixture failed: ${r.error.message}`);
        }

        /*
         * Producers two and three get their OWN mappings, under their own
         * identifiers, so the refusals below are caused by the thing each
         * scenario is about — site, capability — and not by a missing mapping
         * that would refuse first and prove nothing.
         */
        for (const [id, prefix] of [[otherProducerId, "P2"], [readOnlyProducerId, "P3"]] as const) {
            for (const m of [
                { external_entity_type: "child", external_id: `${prefix}-CHILD-1`, child_customer_member_id: CHILD },
                { external_entity_type: "location", external_id: `${prefix}-ROOM-A`, location_id: ROOM_A },
            ]) {
                const r = await supabase
                    .from("attendance_integration_mappings")
                    .insert({ org_id: ORG, producer_id: id, ...m });
                if (r.error) throw new Error(`mapping fixture failed: ${r.error.message}`);
            }
        }
    });

    afterAll(cleanup);

    // ── E — the happy path, and a replay that does not duplicate ────────────

    it("E — a mapped, authorized event authors exactly one canonical fact", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase, presentedCredential: SECRET, providerKey: PROVIDER, event: evt(),
        });
        expect(out.disposition).toBe("applied");
        expect(out.attendanceEventId).toBeTruthy();
        writtenFactIds.push(out.attendanceEventId!);

        // It is a real fact in the real ledger, with the producer's durable
        // identity as its source — not the credential, which rotates.
        const mine = await factsFromThisRun();
        const fact = mine.find((e) => e.id === out.attendanceEventId);
        expect(fact).toBeTruthy();
        expect(fact?.source_key).toBe(`integration:cert:${run}`);
        expect(fact?.source_type).toBe("integration_api");

        // And the projection agrees: a provider check-in puts the child in the
        // room the provider named, through the same projection the kiosk uses.
        const where = whereaboutsAt(mine, `${TODAY}T09:00:00.000Z`);
        expect(where?.locationId).toBe(ROOM_A);
    });

    it("E — a replay converges on the committed fact and says so truthfully", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase, presentedCredential: SECRET, providerKey: PROVIDER, event: evt(),
        });
        expect(out.disposition).toBe("duplicate");
        expect(out.attendanceEventId).toBe(writtenFactIds[0]);

        // One inbound event is one evidence row, however many deliveries.
        const { data } = await supabase
            .from("attendance_integration_events")
            .select("id")
            .eq("provider_event_id", `cc-evt-${run}`)
            .eq("producer_id", producerId);
        expect((data ?? []).length).toBe(1);
    });

    // ── replay conflict ────────────────────────────────────────────────────

    it("same id, different meaning is a conflict — not a silent second interpretation", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            // Same external event id, materially different content.
            event: evt({ externalRoomId: "CC-ROOM-B", physicalEventAt: `${TODAY}T15:45:00.000Z` }),
        });
        expect(out.disposition).toBe("conflicted");
        expect(out.code).toBe("payload_conflict");

        // No second fact was authored.
        expect((await factsFromThisRun()).length).toBe(1);

        // And the committed outcome survives the contradiction: the fact that was
        // applied is still applied, still linked, and still correctable. Demoting
        // this row would orphan the correction scenario that follows.
        const { data } = await supabase
            .from("attendance_integration_events")
            .select("disposition, failure_code, attendance_event_id")
            .eq("provider_event_id", `cc-evt-${run}`)
            .eq("producer_id", producerId);
        expect((data ?? [])[0]).toMatchObject({
            disposition: "applied",
            failure_code: "payload_conflict",
            attendance_event_id: writtenFactIds[0],
        });
    });

    // ── F — unknown mapping, then the retry that succeeds ───────────────────

    it("F — an unmapped child creates no child and no attendance truth", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({ externalEventId: `cc-evt-${run}-unmapped`, externalChildId: "CC-CHILD-UNKNOWN" }),
        });
        expect(out.disposition).toBe("unmapped");
        expect(out.attendanceEventId).toBeFalsy();

        // Nothing was invented to make the event fit.
        const { data } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", ORG)
            .ilike("first_name", "%CC-CHILD-UNKNOWN%");
        expect((data ?? []).length).toBe(0);
    });

    it("F — establishing the mapping lets the SAME inbound event commit, without duplicating it", async () => {
        const map = await supabase.from("attendance_integration_mappings").insert({
            org_id: ORG, producer_id: producerId,
            external_entity_type: "child", external_id: "CC-CHILD-UNKNOWN",
            child_customer_member_id: CHILD,
        });
        expect(map.error).toBeNull();

        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-unmapped`,
                externalChildId: "CC-CHILD-UNKNOWN",
                eventKind: "check_out",
                physicalEventAt: `${TODAY}T16:30:00.000Z`,
            }),
        });
        expect(out.disposition).toBe("applied");
        writtenFactIds.push(out.attendanceEventId!);

        // Still ONE durable inbound event — the failed attempt did not become a
        // second delivery just because it had to be retried.
        const { data } = await supabase
            .from("attendance_integration_events")
            .select("id, disposition")
            .eq("provider_event_id", `cc-evt-${run}-unmapped`)
            .eq("producer_id", producerId);
        expect((data ?? []).length).toBe(1);
        expect((data ?? [])[0]).toMatchObject({ disposition: "applied" });
    });

    // ── G — correction ─────────────────────────────────────────────────────

    it("G — a provider correction appends lineage and leaves the original standing", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-correction`,
                eventKind: "check_in",
                physicalEventAt: `${TODAY}T08:45:00.000Z`,
                correctsExternalEventId: `cc-evt-${run}`,
                correctionMode: "correction",
            }),
        });
        expect(out.disposition).toBe("applied");
        writtenFactIds.push(out.attendanceEventId!);

        const mine = await factsFromThisRun();
        const original = mine.find((e) => e.id === writtenFactIds[0]);
        const correction = mine.find((e) => e.id === out.attendanceEventId);

        // The original is untouched — no destructive update anywhere.
        expect(original).toBeTruthy();
        expect(original?.entry_type).toBe("original");
        // And the correction points at it.
        expect(correction?.corrects_event_id).toBe(writtenFactIds[0]);
        expect(correction?.entry_type).toBe("correction");
    });

    it("G — a correction naming an original Alloy never committed is refused", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-orphan-correction`,
                correctsExternalEventId: "cc-evt-never-seen",
                correctionMode: "correction",
            }),
        });
        // A correction with nothing to correct would otherwise become an
        // original, which is how lineage quietly stops meaning anything.
        expect(out.disposition).toBe("rejected");
        expect(out.code).toBe("unknown_correction_target");
    });

    // ── H — wrong site, and cross-producer mapping ──────────────────────────

    it("H — a producer authorized elsewhere cannot author for this child's site", async () => {
        // Producer two holds LAKESIDE. The child is enrolled at RIVERSIDE, and
        // producer two has perfectly good mappings for both the child and the
        // room — so the site grant is the only thing left to refuse it, which is
        // exactly what this scenario needs to prove.
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: OTHER_SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-wrongsite`,
                externalChildId: "P2-CHILD-1",
                externalRoomId: "P2-ROOM-A",
            }),
        });
        expect(out.disposition).toBe("rejected");
        expect(out.code).toBe("site_not_authorized");
        expect(out.attendanceEventId).toBeFalsy();
    });

    it("a registered, site-authorized producer without the capability still may not write", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: READONLY_SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-nocap`,
                externalChildId: "P3-CHILD-1",
                externalRoomId: "P3-ROOM-A",
            }),
        });
        // Identity, site and mapping all resolve. Capability is a separate
        // dimension, and it is read from the registry rather than the request.
        expect(out.disposition).toBe("rejected");
        expect(out.code).toBe("capability_not_granted");
    });

    it("nothing in the payload can enlarge what the producer may do", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: READONLY_SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-selfclaim`,
                externalChildId: "P3-CHILD-1",
                externalRoomId: "P3-ROOM-A",
                // A payload asserting its own authority. There is nowhere in the
                // normalized event to PUT org, site or capability, so this can
                // only ride along in `raw` — which is evidence, never consulted.
                raw: {
                    org_id: ORG,
                    site_location_id: RIVERSIDE,
                    capabilities: ["attendance.record"],
                    producer_key: `integration:cert:${run}`,
                },
            }),
        });
        expect(out.disposition).toBe("rejected");
        expect(out.code).toBe("capability_not_granted");
    });

    // ── cross-org ──────────────────────────────────────────────────────────

    it("the database refuses a producer in one org reaching a site in another", async () => {
        const { data, error } = await supabase
            .from("attendance_integration_producers")
            .insert({
                org_id: OTHER_ORG,
                provider_key: PROVIDER,
                producer_key: `integration:cert:${run}-crossorg`,
                label: "Cert cross-org",
                credential_hash: hashProducerCredential(`cross-${run}`),
            })
            .select("id")
            .single();
        expect(error).toBeNull();
        const crossOrgProducerId = (data as { id: string }).id;

        // RIVERSIDE belongs to the other tenant. This must not be grantable, and
        // it must be the DATABASE that says so — an application check alone would
        // leave the boundary resting on nobody forgetting to call it.
        const grant = await supabase.from("attendance_integration_producer_sites").insert({
            org_id: OTHER_ORG, producer_id: crossOrgProducerId, site_location_id: RIVERSIDE,
        });
        // The message is asserted, not just the failure: a refusal that names the
        // wrong fault sends the next operator looking in the wrong place, which
        // is how the same trigger already misled once in this thread.
        expect(grant.error?.message).toContain("producer and site must share the org");

        // Nor may a mapping in one tenant name another tenant's child.
        const mapping = await supabase.from("attendance_integration_mappings").insert({
            org_id: OTHER_ORG, producer_id: crossOrgProducerId,
            external_entity_type: "child", external_id: "X-CHILD", child_customer_member_id: CHILD,
        });
        expect(mapping.error?.message).toContain("mapped entity belongs to a different org");
    });

    it("H — one producer cannot borrow another's mapping because the string matches", async () => {
        // The same external id producer one maps successfully. Producer two
        // holds no such mapping, and must not inherit it.
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: OTHER_SECRET,
            providerKey: PROVIDER,
            event: evt({ externalEventId: `cc-evt-${run}-borrow`, externalChildId: "CC-CHILD-1" }),
        });
        expect(out.disposition).toBe("unmapped");
    });

    // ── mapping lifecycle ──────────────────────────────────────────────────

    it("a disabled mapping stops resolving, and a replacement resolves cleanly", async () => {
        await supabase
            .from("attendance_integration_mappings")
            .update({ status: "disabled", disabled_at: new Date().toISOString() })
            .eq("producer_id", producerId)
            .eq("external_id", "CC-ROOM-B");

        const denied = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({ externalEventId: `cc-evt-${run}-disabled`, externalRoomId: "CC-ROOM-B" }),
        });
        expect(denied.disposition).toBe("unmapped");

        // The replacement takes the freed identifier — which is why disabling is
        // not deletion: the old row still explains the facts it authorised.
        const replaced = await supabase.from("attendance_integration_mappings").insert({
            org_id: ORG, producer_id: producerId,
            external_entity_type: "location", external_id: "CC-ROOM-B", location_id: ROOM_A,
        });
        expect(replaced.error).toBeNull();

        const ok = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({ externalEventId: `cc-evt-${run}-disabled`, externalRoomId: "CC-ROOM-B" }),
        });
        expect(ok.disposition).toBe("applied");
        if (ok.attendanceEventId) writtenFactIds.push(ok.attendanceEventId);
    });

    it("a child identifier cannot resolve through a location mapping", async () => {
        // CC-ROOM-A is mapped as a LOCATION. Presenting it as a child must not
        // resolve, whatever the string says.
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({ externalEventId: `cc-evt-${run}-kindmix`, externalChildId: "CC-ROOM-A" }),
        });
        expect(out.disposition).toBe("unmapped");
    });

    // ── I — revocation, and the credential itself ──────────────────────────

    it("a wrong secret is refused, and is recorded as unattributed rather than dropped", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: "not-the-secret",
            providerKey: PROVIDER,
            event: evt({ externalEventId: `cc-evt-${run}-badsecret` }),
        });
        expect(out.disposition).toBe("unattributed");
        expect(out.attendanceEventId).toBeFalsy();

        // And it is KEPT. An attempt to author attendance with a credential Alloy
        // does not recognise is precisely the event an operator needs to see, so
        // a refusal that also loses the record is only half a refusal.
        const { data } = await supabase
            .from("attendance_integration_events")
            .select("id, disposition, org_id, producer_id, failure_code")
            .eq("provider_key", PROVIDER)
            .eq("provider_event_id", `cc-evt-${run}-badsecret`);
        expect((data ?? []).length).toBe(1);
        expect((data ?? [])[0]).toMatchObject({
            disposition: "unattributed",
            // Unattributed means exactly that: no org, no producer, no tenancy
            // inferred from a payload that could claim anything.
            org_id: null,
            producer_id: null,
        });
    });

    // ── out-of-order delivery ──────────────────────────────────────────────

    it("delivery order does not decide the day — physical time does", async () => {
        // The check-OUT arrives first. If arrival order were allowed to matter,
        // the child would end the day still checked in.
        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-late-out`,
                eventKind: "check_out",
                externalRoomId: null,
                physicalEventAt: `${TODAY}T17:15:00.000Z`,
            }),
        });
        expect(out.disposition).toBe("applied");

        const back = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({
                externalEventId: `cc-evt-${run}-late-in`,
                eventKind: "check_in",
                externalRoomId: "CC-ROOM-A",
                physicalEventAt: `${TODAY}T17:00:00.000Z`,
            }),
        });
        expect(back.disposition).toBe("applied");

        const mine = await factsFromThisRun();
        // Between them, present. After the later one, gone. Both answers come
        // from when things HAPPENED, not from when this process heard about them.
        expect(whereaboutsAt(mine, `${TODAY}T17:05:00.000Z`)?.locationId).toBe(ROOM_A);
        expect(whereaboutsAt(mine, `${TODAY}T17:30:00.000Z`)?.locationId ?? null).toBeNull();
    });

    it("I — a revoked producer is denied, and the facts it already authored remain", async () => {
        const beforeCount = (await factsFromThisRun()).length;
        expect(beforeCount).toBeGreaterThan(0);

        await supabase
            .from("attendance_integration_producers")
            .update({ status: "revoked", revoked_at: new Date().toISOString() })
            .eq("id", producerId);

        const out = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: SECRET,
            providerKey: PROVIDER,
            event: evt({ externalEventId: `cc-evt-${run}-afterrevoke` }),
        });
        expect(out.disposition).toBe("unattributed");
        expect(out.code).toBe("producer_revoked");

        // Revocation withdraws future authority, never past provenance.
        expect((await factsFromThisRun()).length).toBe(beforeCount);
    });
});
