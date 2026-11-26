/**
 * Staff calendar invitations and `tour_comms.ics` — against the REAL certification database (`alloy-cert`).
 *
 * The booking service, the orchestrator (Tours eligibility from the booking re-read), the canonical enqueue
 * (typed staff recipient resolved and authorized by Communications) and the eligibility gate are all real.
 * Configuration lives on this suite's own campus (`locations.metadata.tour_comms`), so Northwind's
 * organization settings are untouched. What is proven is canonical enqueue (`queued` rows with their .ics);
 * no provider runs here, so external delivery is not.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cancelTourBooking, confirmTourBooking, createTourBooking, rescheduleTourBooking } from "@/lib/tours/bookings/tourBookingService";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { orchestrateTourBookingConfirmed } from "@/lib/tours/comms/tourCommsOrchestrator";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
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

const ORG = "00000000-0000-4000-8000-000000000001"; // Northwind
const RUN = `stfcal-${Date.now().toString(36)}`;
const TZ = "America/Los_Angeles";
// Monday 2027-03-15 is PDT (UTC-7): 09:00 local = 16:00Z, 11:00 = 18:00Z, 13:00 = 20:00Z.
const DAY = "2027-03-15";
const PENDING_SLOT = { start: `${DAY}T16:00:00.000Z`, end: `${DAY}T17:00:00.000Z` };
const SLOT = { start: `${DAY}T18:00:00.000Z`, end: `${DAY}T19:00:00.000Z` };
const LATER = { start: `${DAY}T20:00:00.000Z`, end: `${DAY}T21:00:00.000Z` };
const AUDITOR = "c0000000-0000-4000-8000-00000000d051"; // cert.axaudit — a member without tours.book

type Json = Record<string, unknown>;
type Msg = { id: string; status: string; audience: string; category: string; to_address: string | null; error: string | null; metadata: Json; body: string | null };

describeLive("staff calendar invitations and tour_comms.ics — live certification database", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null) as unknown as SupabaseClient;
    const ok = async <T,>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> => {
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data;
    };
    let site = "";
    let otherSite = "";
    const staff = { inScope: "", inScopeEmail: `qa+${RUN}-staff@example.invalid`, otherSite: "" };
    const personIds: string[] = [];
    const opportunityIds: string[] = [];
    const authUserIds: string[] = [];

    async function setCampusConfig(tourComms: Json) {
        await ok(db.from("locations").update({ metadata: { timezone: TZ, tour_comms: tourComms } }).eq("id", site));
    }
    async function staffMember(email: string, siteId: string): Promise<string> {
        const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
        if (error || !data.user) throw new Error(error?.message ?? "createUser");
        const id = data.user.id;
        authUserIds.push(id);
        await ok(db.from("user_access_profiles").insert({ user_id: id, org_id: ORG, department_scope: "all", site_scope: "restricted" }));
        await ok(db.from("user_roles").insert({ user_id: id, org_id: ORG, role: "mcert_tour_booker" }));
        await ok(db.from("user_site_access").insert({ user_id: id, org_id: ORG, location_id: siteId }));
        return id;
    }
    async function family(n: string): Promise<{ personId: string; opportunityId: string }> {
        const person = (await ok(db.from("persons").insert({ org_id: ORG, first_name: "Zz", last_name: `${RUN}-${n}`, email: `qa+${RUN}-${n}@example.invalid`, phone: `+1555${String(Date.now()).slice(-7)}` }).select("id").single())) as { id: string };
        const opp = (await ok(db.from("opportunities").insert({ org_id: ORG, name: `ZZ ${RUN} ${n}`, location_id: site, primary_person_id: person.id, status_key: "open", stage_key: "lead" }).select("id").single())) as { id: string };
        personIds.push(person.id);
        opportunityIds.push(opp.id);
        return { personId: person.id, opportunityId: opp.id };
    }
    async function book(n: string, slot: { start: string; end: string }, approvalRequired: boolean): Promise<TourBookingRow> {
        const fam = await family(n);
        return createTourBooking(db, {
            orgId: ORG,
            opportunityId: fam.opportunityId,
            locationId: site,
            startAt: new Date(slot.start),
            endAt: new Date(slot.end),
            timezone: TZ,
            source: "public_link",
            requestedByUserId: null,
            primaryPersonId: fam.personId,
            approvalRequired,
            deferConfirmationComms: true,
        });
    }
    async function staffMessages(bookingId: string): Promise<Msg[]> {
        return (await ok(
            db.from("communication_messages").select("id, status, audience, category, to_address, error, metadata, body")
                .eq("org_id", ORG).filter("metadata->>tour_booking_id", "eq", bookingId).filter("metadata->>tour_event_key", "eq", "tour_internal_calendar")
                .order("created_at")
        )) as Msg[];
    }
    async function familyEmails(bookingId: string): Promise<Msg[]> {
        return ((await ok(
            db.from("communication_messages").select("id, status, audience, category, to_address, error, metadata, body")
                .eq("org_id", ORG).eq("channel", "email").filter("metadata->>tour_booking_id", "eq", bookingId)
        )) as Msg[]).filter((m) => m.metadata.tour_event_key !== "tour_internal_calendar");
    }
    async function lastOutcome(bookingId: string): Promise<Json> {
        const row = (await ok(db.from("tour_bookings").select("metadata").eq("id", bookingId).single())) as { metadata: Json };
        return (row.metadata.internal_calendar_last ?? {}) as Json;
    }
    // RFC 5545 folds lines at 75 octets (CRLF + space); unfold before reading properties.
    const ics = (m: Msg) => Buffer.from(String((m.metadata.calendar_invite as Json).content_base64), "base64").toString("utf8").replace(/\r\n[ \t]/g, "");

    beforeAll(async () => {
        site = ((await ok(db.from("locations").insert({ org_id: ORG, label: `ZZ ${RUN} campus`, location_type: "site", metadata: { timezone: TZ } }).select("id").single())) as { id: string }).id;
        otherSite = ((await ok(db.from("locations").insert({ org_id: ORG, label: `ZZ ${RUN} other campus`, location_type: "site", metadata: { timezone: TZ } }).select("id").single())) as { id: string }).id;
        const rule = { org_id: ORG, location_id: site, day_of_week: 1, timezone: TZ, slot_duration_minutes: 60, buffer_minutes: 0, is_active: true, metadata: { cert_run: RUN } };
        await ok(db.from("tour_availability_rules").insert([
            { ...rule, start_time: "09:00", end_time: "10:00", max_bookings_per_slot: 3, approval_required: true },
            { ...rule, start_time: "11:00", end_time: "12:00", max_bookings_per_slot: 5, approval_required: false },
            { ...rule, start_time: "13:00", end_time: "14:00", max_bookings_per_slot: 5, approval_required: false },
        ]));
        staff.inScope = await staffMember(staff.inScopeEmail, site);
        staff.otherSite = await staffMember(`qa+${RUN}-elsewhere@example.invalid`, otherSite);
    });

    afterAll(async () => {
        if (!env) return;
        for (const loc of [site, otherSite].filter(Boolean)) {
            const { data: threads } = await db.from("communication_threads").select("id").eq("location_id", loc);
            const ids = (threads ?? []).map((t) => (t as { id: string }).id);
            if (ids.length) {
                await db.from("communication_messages").delete().in("thread_id", ids);
                await db.from("communication_threads").delete().in("id", ids);
            }
        }
        if (opportunityIds.length) {
            await db.from("communication_scheduled_sends").delete().eq("org_id", ORG).in("entity_id", opportunityIds);
            await db.from("tour_bookings").delete().eq("org_id", ORG).in("opportunity_id", opportunityIds);
            await db.from("opportunities").delete().in("id", opportunityIds);
        }
        if (personIds.length) await db.from("persons").delete().in("id", personIds);
        for (const id of authUserIds) {
            await db.from("user_site_access").delete().eq("user_id", id);
            await db.from("user_roles").delete().eq("user_id", id);
            await db.from("user_access_profiles").delete().eq("user_id", id);
            await db.auth.admin.deleteUser(id);
        }
        await db.from("tour_availability_rules").delete().in("location_id", [site, otherSite].filter(Boolean));
        await db.from("locations").delete().in("id", [site, otherSite].filter(Boolean));
    });

    let confirmed: TourBookingRow;

    it("a confirmed tour: one invitation to the authorized staff member — external transactional email, .ics with the tour's time and zone; the family gets its Add to calendar link", async () => {
        await setCampusConfig({ internal_recipients: { enabled: true, user_ids: [staff.inScope] } });
        confirmed = await book("confirmed", SLOT, false);
        expect(confirmed.status_key).toBe("confirmed");
        await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: confirmed, actorUserId: null });

        const msgs = await staffMessages(confirmed.id);
        expect(msgs).toHaveLength(1);
        expect(msgs[0]).toMatchObject({ status: "queued", audience: "external", category: "transactional", to_address: staff.inScopeEmail });
        expect(msgs[0]!.metadata).toMatchObject({ internal_calendar_action: "request", staff_recipient: { user_id: staff.inScope, verified: true } });
        const cal = ics(msgs[0]!);
        expect(cal).toContain("METHOD:REQUEST");
        expect(cal).toContain("DTSTART:20270315T180000Z");
        expect(cal).toContain("DTEND:20270315T190000Z");
        expect(cal).toContain(`X-ALLOY-BOOKING-TIMEZONE:${TZ}`);
        expect(cal).toContain(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${staff.inScopeEmail}`);
        expect(await lastOutcome(confirmed.id)).toMatchObject({ action: "request", outcome: "queued" });

        // tour_comms.ics enabled (default): the family's confirmation carries the calendar link.
        const fam = await familyEmails(confirmed.id);
        expect(fam.length).toBeGreaterThanOrEqual(1);
        expect(fam.some((m) => /Add to calendar/.test(m.body ?? "") && /calendar\.google\.com\/calendar\/render\?[^\s]*20270315T180000Z/.test(m.body ?? ""))).toBe(true);
    });

    it("a replayed confirmation queues no second invitation", async () => {
        await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: confirmed, actorUserId: null });
        expect((await staffMessages(confirmed.id)).filter((m) => m.status !== "blocked")).toHaveLength(1);
        expect(await lastOutcome(confirmed.id)).toMatchObject({ action: "request", outcome: "duplicate", duplicates: [staff.inScope] });
    });

    it("a reschedule sends an update for the new time", async () => {
        const moved = await rescheduleTourBooking(db, ORG, confirmed.id, { startAt: new Date(LATER.start), endAt: new Date(LATER.end) });
        expect(moved.start_at).toContain("2027-03-15T20:00:00");
        const msgs = (await staffMessages(confirmed.id)).filter((m) => m.status === "queued");
        const update = msgs.find((m) => m.metadata.internal_calendar_action === "update");
        expect(update, JSON.stringify(msgs.map((m) => m.metadata.internal_calendar_action))).toBeTruthy();
        expect(ics(update!)).toContain("DTSTART:20270315T200000Z");
        confirmed = moved;
    });

    it("a cancelled confirmed tour sends a CANCEL to the invited staff — and nothing new is offered", async () => {
        await cancelTourBooking(db, ORG, confirmed.id, { canceledBy: "staff", cancelReason: "family_canceled" });
        const cancels = (await staffMessages(confirmed.id)).filter((m) => m.metadata.internal_calendar_action === "cancel");
        expect(cancels).toHaveLength(1);
        expect(cancels[0]!.status).toBe("queued");
        expect(ics(cancels[0]!)).toContain("METHOD:CANCEL");
    });

    it("a pending tour (awaiting approval) produces no invitation; cancelling it sends nothing either", async () => {
        const pending = await book("pending", PENDING_SLOT, true);
        expect(pending.status_key).toBe("pending_approval");
        const res = await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: pending, actorUserId: null });
        expect(res.skippedReasons.join(" ")).toMatch(/ineligible:booking_confirmation/);
        expect(await staffMessages(pending.id)).toEqual([]);
        await cancelTourBooking(db, ORG, pending.id, { canceledBy: "staff", cancelReason: "family_canceled" });
        expect(await staffMessages(pending.id)).toEqual([]);
    });

    it("no staff recipients configured: nothing sent, and the non-send is recorded on the booking", async () => {
        await setCampusConfig({ internal_recipients: { enabled: true, user_ids: [] } });
        const b = await book("nostaff", SLOT, false);
        await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: b, actorUserId: null });
        expect(await staffMessages(b.id)).toEqual([]);
        expect(await lastOutcome(b.id)).toMatchObject({ action: "request", outcome: "no_internal_recipients" });
    });

    it("unauthorized recipients — outside the tour's location, without tours.book, not a member — are refused and recorded, never sent", async () => {
        const stranger = "00000000-0000-4000-8000-00000000beef";
        await setCampusConfig({ internal_recipients: { enabled: true, user_ids: [staff.otherSite, AUDITOR, stranger] } });
        const b = await book("unauth", SLOT, false);
        await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: b, actorUserId: null });
        const msgs = await staffMessages(b.id);
        expect(msgs).toHaveLength(3);
        expect(msgs.every((m) => m.status === "blocked" && m.error === "policy:RECIPIENT_UNRESOLVED" && m.to_address === null)).toBe(true);
        const reasons = Object.fromEntries(msgs.map((m) => [String((m.metadata.staff_recipient as Json).user_id), String((m.metadata.staff_recipient as Json).reason)]));
        expect(reasons).toEqual({ [staff.otherSite]: "outside_location_scope", [AUDITOR]: "lacks_capability", [stranger]: "not_a_member" });
        expect(await lastOutcome(b.id)).toMatchObject({ outcome: "no_authorized_recipient" });
    });

    it("tour_comms.ics disabled: the family's messages carry no calendar link (no dangling label); staff invitations are not governed by it", async () => {
        await setCampusConfig({ internal_recipients: { enabled: true, user_ids: [staff.inScope] }, ics: { include_in_confirmation_email: false } });
        const b = await book("icsoff", SLOT, false);
        await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: b, actorUserId: null });
        const fam = ((await ok(db.from("communication_messages").select("channel, body, metadata").eq("org_id", ORG).filter("metadata->>tour_booking_id", "eq", b.id))) as Array<{ channel: string; body: string | null; metadata: Json }>).filter((m) => m.metadata.tour_event_key !== "tour_internal_calendar");
        expect(fam.length).toBeGreaterThanOrEqual(1);
        for (const m of fam) {
            expect(m.body ?? "").not.toMatch(/Add to calendar|calendar\.google\.com|Details:\s*$/m);
        }
        expect((await staffMessages(b.id)).filter((m) => m.status === "queued")).toHaveLength(1);
    });

    it("confirming a pending tour through the service invites staff once it is approved", async () => {
        await setCampusConfig({ internal_recipients: { enabled: true, user_ids: [staff.inScope] } });
        const p = await book("approve", PENDING_SLOT, true);
        expect(await staffMessages(p.id)).toEqual([]);
        await confirmTourBooking(db, ORG, p.id, { actorUserId: null });
        const msgs = (await staffMessages(p.id)).filter((m) => m.status === "queued");
        expect(msgs).toHaveLength(1);
        expect(ics(msgs[0]!)).toContain("DTSTART:20270315T160000Z");
    });
});
