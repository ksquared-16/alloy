/**
 * S7 — Public tour booking, lead intake and approval integration, against the REAL certification
 * database (`alloy-cert`; `web/.env.certification.local`).
 *
 * The family's journey through the real route handlers — public slots, draft, submit — and the
 * administrator's Approve through the real approve route (only the admin session is stubbed; the
 * commit, booking writer, S1 capacity trigger, S5/S6 calendar and canonical communications are
 * real). Northwind (the synthetic cert tenant, which has intake routing and tour communications)
 * gets a throwaway campus; a second throwaway organization proves tenant isolation.
 *
 * Residue: calendar entries are append-only and are withdrawn (inert). Leads, people and
 * households committed by Approve remain in Northwind as synthetic `ZZ s7-*` records, as the
 * Processing certification suites' records do. Bookings, rules, links, forms and the throwaway
 * org's rows are removed.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { resetTourPublicRateLimitForTests } from "@/lib/tours/public/tourPublicRateLimit";
import { formatParentTimeOnly } from "@/lib/tours/public/tourParentView";
import { createTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { materializeRequestedTourForCase } from "@/lib/tours/publicCalendar/materializeRequestedTour";
import { readRequestedTour } from "@/lib/tours/publicCalendar/requestedTour";
import {
    buildRequestedTourOperatorView,
    listRequestedTourAttentionForOpportunity,
} from "@/lib/tours/publicCalendar/requestedTourOperatorView";
import { buildPublicFormResolvePayload } from "@/lib/public/forms/buildPublicFormResolvePayload";
import { readIntakeMarketingConsent, INTAKE_MARKETING_CONSENT_LANGUAGE } from "@/lib/communications/preferences/intakeMarketingConsentRecord";
import { commitIntakeMarketingConsentForCase } from "@/lib/pos/processingCase/commitIntakeMarketingConsentForCase";
import { persistCommunicationPreference } from "@/lib/communications/v2/persistCommunicationPreference";
import { loadPersonPreferencesView } from "@/lib/communications/v2/personCommunicationPreferences";
import { presentIntakeMarketingConsent } from "@/lib/communications/preferences/intakeMarketingConsentPresentation";
import { describePreferenceEvent, describePreferenceProvenance } from "@/components/admin/communications/PersonCommunicationPreferencesPanel";
import { executeLegacyCommunicationsSendAdapter } from "@/lib/communications/executeLegacyCommunicationsSendAdapter";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { enqueueCanonicalCommunicationMirror } from "@/lib/communications/mirrorQueuedMessage";
import { sendTourInternalCalendarInvite } from "@/lib/tours/comms/tourInternalCalendarInvite";
import { DEFAULT_TOUR_COMMS_CONFIG } from "@/lib/tours/comms/tourCommsConfig";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { deliverQueuedEmailHtml } from "@/lib/communications/deliverQueuedEmailHtml";
import { processDueCommunicationScheduledSends } from "@/lib/communications/communicationScheduledSendsService";
import { issueUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/communications/preferences/unsubscribeToken";
import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import { commitCalendarAct, prepareCalendarAct, type CalendarAuthoringAction } from "@/lib/operatingCalendar/operatingCalendarAuthoring";
import { mergeRoutingDefaultsIntoMetadata, resolveOrgIntakeRoutingDefaults } from "@/lib/forms/intake/resolveOrgIntakeRoutingDefaults";
import { OPERATING_CALENDAR_PURPOSE, type OperatingCalendarEntryDraft } from "@/lib/operatingCalendar/operatingCalendarVocabulary";

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

const ORG = "00000000-0000-4000-8000-000000000001"; // Northwind, the synthetic cert tenant
const NEW_LEADS_WU = "00000000-0000-4000-8000-000000000030";
const ACTOR = "00000000-0000-4000-8000-0000000007a7";
const RUN = `s7-${Date.now().toString(36)}`;
const TZ = "America/Los_Angeles";
// Tue 2033-03-01 / Wed 03-02 / Thu 03-03, all PST (UTC-8): 09:00 local = 17:00Z.
const WEEK = { from: "2033-03-01T08:00:00.000Z", to: "2033-03-04T08:00:00.000Z" };
const at = (date: string, hhmm: string) =>
    new Date(`${date}T${String(Number(hhmm.slice(0, 2)) + 8).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`).toISOString();
const plus30 = (iso: string) => new Date(Date.parse(iso) + 30 * 60_000).toISOString();

// The administrator session is the only stub: everything Approve does after authorization is real.
const { adminCtx } = vi.hoisted(() => ({
    adminCtx: {
        ok: true as const,
        orgId: "00000000-0000-4000-8000-000000000001",
        role: "admin",
        permissionKeys: ["processing.operate"],
        userId: "00000000-0000-4000-8000-0000000007a7",
    },
}));
vi.mock("@/lib/admin/getAdminContext", async (orig) => ({
    ...(await orig<typeof import("@/lib/admin/getAdminContext")>()),
    getAdminContextCached: vi.fn(async () => adminCtx),
    getAdminContext: vi.fn(async () => adminCtx),
}));

import { GET as slotsGet } from "@/app/api/public/tours/[token]/slots/route";
import { POST as draftPost } from "@/app/api/public/forms/[token]/submissions/route";
import { POST as submitPost } from "@/app/api/public/forms/[token]/submissions/[submissionId]/submit/route";
import { POST as approvePost } from "@/app/api/admin/processing/cases/[caseId]/approve/route";
import { GET as unsubscribeGet, POST as unsubscribePost } from "@/app/api/communications/unsubscribe/route";

const SCHEMA = {
    schema_version: 1,
    title: "Tour inquiry",
    sections: [{ id: "s1", field_ids: ["guardian_full_name", "guardian_email", "child_first_name", "child_last_name", "child_dob"] }],
    fields: [
        { id: "guardian_full_name", type: "text", label: "Your name", required: true },
        { id: "guardian_email", type: "text", label: "Email", required: true },
        { id: "child_first_name", type: "text", label: "Child first name", required: true },
        { id: "child_last_name", type: "text", label: "Child last name", required: true },
        { id: "child_dob", type: "date", label: "Child date of birth" },
    ],
};

type Json = Record<string, unknown>;

describeLive("S7 public tour booking, intake and approval — live certification database", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null) as unknown as SupabaseClient;

    let site = "";
    let formId = "";
    let verticalId = "";
    let otherOrg = "";
    let otherSite = "";
    const tokens = { calendar: "", unpublished: "", restricted: "", other: "", plain: "" };
    const latestCalendarActs = new Map<string, string>();
    const linkIds: string[] = [];
    const caseIds: string[] = [];
    const access = { permissionKeys: ["settings.manage"], dim: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] } } as never;

    async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
        const { data, error } = await p;
        if (error) throw new Error(error.message);
        return data;
    }
    const idOf = (row: unknown) => (row as { id: string }).id;

    async function calendarAct(action: CalendarAuthoringAction, opts: { draft?: Partial<OperatingCalendarEntryDraft>; entryId?: string }) {
        const draft = opts.draft
            ? ({ scope: "location", locationId: site, name: "Entry", designation: "closure", effect: "closed", fromDate: "2033-03-02", toDate: "2033-03-02", startTime: null, endTime: null, reasonKey: null, note: null, ...opts.draft } as OperatingCalendarEntryDraft)
            : null;
        const prepared = await prepareCalendarAct({ supabase: db, orgId: ORG, actorUserId: ACTOR, access, action, draft, entryId: opts.entryId ?? null, idempotencyKey: `${RUN}:${Math.random().toString(36).slice(2)}` });
        if (prepared.status !== "prepared") throw new Error(`${prepared.code}: ${prepared.message}`);
        const r = await commitCalendarAct(prepared, { orgId: ORG, actorUserId: ACTOR }, createSupabaseAuthoringGateway(db as never, OPERATING_CALENDAR_PURPOSE));
        if (r.status !== "authored") throw new Error(`authoring ${r.status}`);
        latestCalendarActs.set(r.act.lineageRootId ?? r.act.id, r.act.id);
        return r.act.lineageRootId ?? r.act.id;
    }

    async function mintLink(orgId: string, locationId: string, form: string, extra: Json = {}, columns: Json = {}): Promise<string> {
        const token = randomBytes(24).toString("base64url");
        // A link minted in Studio carries the organization's intake routing (Enrollment's
        // default_department_id) underneath its own settings — Approve places the lead from it.
        const routing = await resolveOrgIntakeRoutingDefaults(db, orgId, "enrollment_lead");
        const row = await ok(
            db
                .from("form_public_links")
                .insert({
                    org_id: orgId,
                    form_definition_id: form,
                    token_hash: hashFormLinkToken(token),
                    token_prefix: token.slice(0, 12),
                    is_active: true,
                    metadata: mergeRoutingDefaultsIntoMetadata(
                        {
                            lead_capture: true,
                            default_vertical_id: verticalId,
                            default_location_id: locationId,
                            distribution_context: "location_specific",
                            cert_run: RUN,
                            ...extra,
                        },
                        routing
                    ),
                    ...columns,
                })
                .select("id")
                .single()
        );
        linkIds.push(idOf(row));
        return token;
    }

    async function publishForm(orgId: string): Promise<string> {
        const form = idOf(await ok(db.from("form_definitions").insert({ org_id: orgId, key: `zz-${RUN}-${randomUUID().slice(0, 6)}`, name: `ZZ ${RUN} tour inquiry`, kind: "center" }).select("id").single()));
        await ok(db.from("form_definition_versions").insert({ org_id: orgId, form_definition_id: form, version_number: 1, status: "published", published_at: new Date().toISOString(), schema_json: SCHEMA }));
        return form;
    }

    const req = (url: string, init?: { method?: string; body?: Json; origin?: string }) =>
        new NextRequest(url, {
            method: init?.method ?? "GET",
            headers: { "content-type": "application/json", "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(init?.origin ? { origin: init.origin } : {}) },
            ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
        });

    async function slots(token: string, origin?: string) {
        const res = await slotsGet(req(`http://localhost/api/public/tours/x/slots?from=${WEEK.from}&to=${WEEK.to}`, { origin }), { params: Promise.resolve({ token }) });
        return { status: res.status, json: (await res.json()) as Json };
    }
    const local = (iso: string) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
            .format(new Date(iso))
            .replace(", ", " ");
    async function offeredLocal(token: string) {
        const r = await slots(token);
        return ((r.json.slots ?? []) as Array<{ start_at: string }>).map((s) => local(s.start_at));
    }

    /** The family's two steps through the real routes. Returns the submit response and the case. */
    async function familySubmits(
        n: string,
        tour: { start_at: string; end_at: string } | null,
        token = tokens.calendar,
        opts: { consent?: unknown; email?: string } = {}
    ) {
        const email = opts.email ?? `qa+${RUN}-${n}@example.invalid`;
        const draftRes = await draftPost(req("http://localhost/api/public/forms/x/submissions", { method: "POST", body: { payload: { values: {} } } }), { params: Promise.resolve({ token }) });
        const draft = (await draftRes.json()) as { ok: boolean; data?: { id: string } };
        if (!draft.ok || !draft.data) throw new Error(`draft failed ${draftRes.status} ${JSON.stringify(draft)}`);
        const values = { guardian_full_name: `Zz Parent${n} ${RUN}`, guardian_email: email, child_first_name: `Zz Kid${n}`, child_last_name: RUN, child_dob: "2030-05-01" };
        const submitRes = await submitPost(
            req(`http://localhost/api/public/forms/x/submissions/${draft.data.id}/submit`, { method: "POST", body: { payload: { values }, ...(tour ? { requested_tour: tour } : {}), ...(opts.consent !== undefined ? { marketing_consent: opts.consent } : {}) } }),
            { params: Promise.resolve({ token, submissionId: draft.data.id }) }
        );
        const submit = (await submitRes.json()) as Json;
        const { data: sub } = await db.from("form_submissions").select("status, payload").eq("id", draft.data.id).maybeSingle();
        const caseId = ((sub as { payload?: { meta?: { processing_case_id?: string } } } | null)?.payload?.meta?.processing_case_id ?? null) as string | null;
        if (caseId) caseIds.push(caseId);
        return { status: submitRes.status, submit, submissionId: draft.data.id, submissionStatus: (sub as { status?: string } | null)?.status ?? null, caseId, email };
    }

    async function approve(caseId: string) {
        const res = await approvePost(req(`http://localhost/api/admin/processing/cases/${caseId}/approve`, { method: "POST" }), { params: Promise.resolve({ caseId }) });
        return { status: res.status, json: (await res.json()) as { data?: Json; error?: string } };
    }
    async function caseMeta(caseId: string) {
        return ((await ok(db.from("processing_cases").select("status, metadata").eq("id", caseId).single())) as { status: string; metadata: Json });
    }
    async function bookingsForCase(caseId: string) {
        return (await ok(db.from("tour_bookings").select("id, status_key, opportunity_id, start_at, source, form_submission_id").eq("org_id", ORG).eq("metadata->>processing_case_id", caseId))) as Array<Json>;
    }
    async function confirmationsFor(bookingId: string) {
        return ((await ok(db.from("communication_messages").select("id, status, error, metadata").eq("org_id", ORG).eq("direction", "outbound").filter("metadata->>tour_booking_id", "eq", bookingId))) as Array<{ id: string; status: string; error: string | null; metadata: Json }>).filter((m) => m.metadata?.event_key === "tour_confirmation");
    }
    async function personsWithEmail(email: string) {
        return (await ok(db.from("persons").select("id").eq("org_id", ORG).ilike("email", email))) as Array<{ id: string }>;
    }

    beforeAll(async () => {
        resetTourPublicRateLimitForTests();
        verticalId = idOf(await ok(db.from("verticals").select("id").limit(1).single()));
        site = idOf(await ok(db.from("locations").insert({ org_id: ORG, label: `ZZ ${RUN} campus`, location_type: "site", metadata: { timezone: TZ } }).select("id").single()));
        // Tue: one window, capacity 1. Wed: two windows, capacity 2. Thu: tour approval required.
        const rule = (day: number, start: string, end: string, cap: number, approval = false) => ({
            org_id: ORG, location_id: site, day_of_week: day, start_time: start, end_time: end, timezone: TZ,
            slot_duration_minutes: 30, buffer_minutes: 0, max_bookings_per_slot: cap, approval_required: approval, is_active: true,
            metadata: { cert_run: RUN },
        });
        await ok(db.from("tour_availability_rules").insert([rule(2, "09:00", "11:00", 1), rule(3, "09:00", "10:00", 2), rule(3, "14:00", "15:00", 2), rule(4, "09:00", "10:00", 1, true)]));
        formId = await publishForm(ORG);
        tokens.calendar = await mintLink(ORG, site, formId, { default_work_unit_id: NEW_LEADS_WU, tour_calendar_v1: { enabled: true } });
        tokens.unpublished = await mintLink(ORG, site, formId, { default_work_unit_id: NEW_LEADS_WU });
        tokens.plain = await mintLink(ORG, site, formId, { default_work_unit_id: NEW_LEADS_WU });
        tokens.restricted = await mintLink(ORG, site, formId, { default_work_unit_id: NEW_LEADS_WU, tour_calendar_v1: { enabled: true } }, { allowed_embed_origins: ["https://school.example"] });

        otherOrg = idOf(await ok(db.from("orgs").insert({ name: `ZZ ${RUN} other`, slug: `zz-${RUN}-other` }).select("id").single()));
        otherSite = idOf(await ok(db.from("locations").insert({ org_id: otherOrg, label: `ZZ ${RUN} other campus`, location_type: "site", metadata: { timezone: TZ } }).select("id").single()));
        await ok(db.from("tour_availability_rules").insert({ ...rule(2, "15:00", "16:00", 1), org_id: otherOrg, location_id: otherSite }));
        tokens.other = await mintLink(otherOrg, otherSite, await publishForm(otherOrg), { tour_calendar_v1: { enabled: true } });
    }, 120_000);

    afterAll(async () => {
        for (const id of latestCalendarActs.values()) await calendarAct("withdraw", { entryId: id }).catch(() => undefined);
        await db.from("communication_scheduled_sends").delete().eq("org_id", ORG).eq("source", "tour_scheduling").filter("metadata->>tour_location_id", "eq", site);
        await db.from("communication_scheduled_sends").delete().eq("org_id", ORG).filter("metadata->>cert_run", "eq", RUN);
        await db.from("tour_bookings").delete().in("location_id", [site, otherSite].filter(Boolean));
        await db.from("tour_availability_rules").delete().in("location_id", [site, otherSite].filter(Boolean));
        if (linkIds.length) await db.from("form_public_links").update({ is_active: false }).in("id", linkIds);
        if (otherOrg) {
            await db.from("form_public_links").delete().eq("org_id", otherOrg);
            await db.from("form_definitions").delete().eq("org_id", otherOrg);
            await db.from("locations").delete().eq("org_id", otherOrg);
            await db.from("orgs").delete().eq("id", otherOrg);
        }
    }, 120_000);

    it("1 · the public calendar shows the weekly schedule — every window, 12-hour labels, the school's zone, nothing internal", async () => {
        const r = await slots(tokens.calendar);
        expect(r.status).toBe(200);
        expect(r.json.timezone).toBe(TZ);
        const list = r.json.slots as Array<Json>;
        expect(list.map((s) => local(String(s.start_at)))).toEqual([
            "2033-03-01 09:00", "2033-03-01 09:30", "2033-03-01 10:00", "2033-03-01 10:30",
            "2033-03-02 09:00", "2033-03-02 09:30", "2033-03-02 14:00", "2033-03-02 14:30",
            "2033-03-03 09:00", "2033-03-03 09:30",
        ]);
        // Only an interval and its zone reach the browser — no rule, capacity, org, location or booking.
        for (const s of list) expect(Object.keys(s).sort()).toEqual(["end_at", "start_at", "timezone"]);
        expect(formatParentTimeOnly(String(list[6]!.start_at), TZ)).toBe("2:00 PM");
    });

    it("2 · a closure suppresses that day's times; 3 · modified hours constrain them", async () => {
        const closure = await calendarAct("create", { draft: { name: "Staff day", fromDate: "2033-03-02", toDate: "2033-03-02" } });
        const modified = await calendarAct("create", {
            draft: { name: "Late start", designation: "modified_hours", effect: "modified_hours", startTime: "09:30", endTime: "10:30", fromDate: "2033-03-01", toDate: "2033-03-01" },
        });
        const offered = await offeredLocal(tokens.calendar);
        expect(offered.filter((s) => s.startsWith("2033-03-02"))).toEqual([]);
        expect(offered.filter((s) => s.startsWith("2033-03-01"))).toEqual(["2033-03-01 09:30", "2033-03-01 10:00"]);
        // A submitted request for a closed time is refused before anything is written.
        const refused = await familySubmits("closed", { start_at: at("2033-03-02", "09:00"), end_at: plus30(at("2033-03-02", "09:00")) });
        expect(refused.status).toBe(409);
        expect(refused.submit.code).toBe("TOUR_SLOT_UNAVAILABLE");
        expect(refused.submissionStatus).toBe("draft");
        expect(refused.caseId).toBeNull();
        await calendarAct("withdraw", { entryId: latestCalendarActs.get(closure)! });
        await calendarAct("withdraw", { entryId: latestCalendarActs.get(modified)! });
        latestCalendarActs.clear();
        expect((await offeredLocal(tokens.calendar)).length).toBe(10);
    });

    it("15 · an unknown, unpublished, cross-tenant or disallowed-origin token fails safely and identically", async () => {
        const unknown = await slots(randomBytes(24).toString("base64url"));
        const unpublished = await slots(tokens.unpublished);
        expect(unknown.status).toBe(404);
        expect(unpublished.status).toBe(404);
        expect(unpublished.json).toEqual(unknown.json); // a probe cannot tell them apart
        // The other tenant's token sees only its own campus.
        const other = await slots(tokens.other);
        expect(other.status).toBe(200);
        expect((other.json.slots as Array<{ start_at: string }>).map((s) => local(s.start_at))).toEqual(["2033-03-01 15:00", "2033-03-01 15:30"]);
        // Embedding allowlist: the school's own site may frame it; another may not.
        expect((await slots(tokens.restricted, "https://school.example")).status).toBe(200);
        const evil = await slots(tokens.restricted, "https://evil.example");
        expect(evil.status).toBe(403);
        expect(JSON.stringify(evil.json)).not.toMatch(/ZZ|campus|org_id|location/i);
        // An inactive link stops publishing at once.
        await ok(db.from("form_public_links").update({ is_active: false }).eq("token_hash", hashFormLinkToken(tokens.unpublished)));
        expect((await slots(tokens.unpublished)).status).toBe(410);
    });

    let familyA: Awaited<ReturnType<typeof familySubmits>>;

    it("4 · 5 · 6 · 7 · a family selects a time and submits: a pending request on the case, no lead, no booking, no message", async () => {
        const start = at("2033-03-01", "10:00");
        // A request body cannot choose the org or the location: extra keys are ignored.
        familyA = await familySubmits("a", { start_at: start, end_at: plus30(start), location_id: otherSite, org_id: otherOrg } as never);
        expect(familyA.status).toBe(200);
        expect(familyA.submit.data).toMatchObject({ tour_request: { state: "pending_acceptance" } });
        expect(familyA.caseId).toBeTruthy();
        const { status, metadata } = await caseMeta(familyA.caseId!);
        expect(status).toBe("needs_resolution");
        const tour = readRequestedTour(metadata)!;
        expect(tour).toMatchObject({ state: "pending_acceptance", location_id: site, start_at: start, timezone: TZ, submission_key: `form_submission:${familyA.submissionId}` });
        expect(tour.provenance).toMatchObject({ source: "public_tour_calendar", form_submission_id: familyA.submissionId });
        // No Opportunity, no person, no booking and no message before acceptance.
        expect(await personsWithEmail(familyA.email)).toEqual([]);
        expect(await bookingsForCase(familyA.caseId!)).toEqual([]);
        const { data: msgs } = await db.from("communication_messages").select("id").eq("org_id", ORG).ilike("to_address", familyA.email);
        expect(msgs ?? []).toEqual([]);
        const { data: sends } = await db.from("communication_scheduled_sends").select("id").eq("org_id", ORG).filter("metadata->>tour_location_id", "eq", site);
        expect(sends ?? []).toEqual([]);
        // The operator sees a pending request, still open, and that nothing was sent.
        const view = (await buildRequestedTourOperatorView(db, { orgId: ORG, caseId: familyA.caseId! }))!;
        expect(view).toMatchObject({ state: "pending_acceptance", acceptance: "pending", stillAvailable: true, booking: null });
        expect(view.headline).toMatch(/pending acceptance/i);
    });

    it("8 · 9 · 10 · Approve commits the lead, books the requested time once, and sends one confirmation", async () => {
        const r = await approve(familyA.caseId!);
        expect(r.status, JSON.stringify(r.json)).toBe(200);
        expect(r.json.data).toMatchObject({ status: "completed", tourRequest: { kind: "booked", bookingStatus: "confirmed", replay: false } });
        const opportunityId = (r.json.data!.operationalResult as { recordId: string }).recordId;
        const bookings = await bookingsForCase(familyA.caseId!);
        expect(bookings).toHaveLength(1);
        expect(bookings[0]).toMatchObject({ status_key: "confirmed", opportunity_id: opportunityId, start_at: expect.stringContaining("2033-03-01T18:00:00"), source: "form_submission", form_submission_id: familyA.submissionId });
        const confirmations = await confirmationsFor(String(bookings[0]!.id));
        expect(confirmations.length).toBeGreaterThanOrEqual(1);
        expect(new Set(confirmations.map((m) => m.metadata?.channel ?? m.metadata?.idempotency_key)).size).toBe(confirmations.length);
        const tour = readRequestedTour((await caseMeta(familyA.caseId!)).metadata)!;
        expect(tour).toMatchObject({ state: "booked", booking_id: bookings[0]!.id, booking_status: "confirmed", opportunity_id: opportunityId });
        // Exactly one confirmation per channel, and it was queued for delivery — not refused.
        expect(tour.comms?.status, JSON.stringify({ comms: tour.comms, confirmations })).toBe("sent");
        expect(confirmations.filter((m) => m.status !== "blocked").length).toBeGreaterThanOrEqual(1);
        // The family's calendar invitation: the confirmation email carries an Add to calendar link for this tour.
        const email = (await ok(db.from("communication_messages").select("body").in("id", confirmations.map((m) => m.id)).eq("channel", "email"))) as Array<{ body: string | null }>;
        expect(email, JSON.stringify(confirmations)).toHaveLength(1);
        expect(email[0]!.body ?? "").toMatch(/Add to calendar:?\s*https:\/\/calendar\.google\.com\/calendar\/render\?[^\s]*20330301T180000Z/);
        // 16 · intake and approval imply no marketing consent.
        const people = await personsWithEmail(familyA.email);
        expect(people).toHaveLength(1);
        const { data: prefs } = await db.from("communication_preferences").select("category, state").eq("org_id", ORG).eq("person_id", people[0]!.id);
        expect((prefs ?? []).filter((p) => String((p as Json).category).includes("marketing") && (p as Json).state === "opted_in")).toEqual([]);
    });

    it("C3·T · FINDING — a configured staff calendar invite is refused at enqueue (internal audience on email: INTERNAL_TO_PROVIDER)", async () => {
        const [booking] = (await ok(db.from("tour_bookings").select("*").eq("org_id", ORG).eq("metadata->>processing_case_id", familyA.caseId!))) as TourBookingRow[];
        expect(booking).toBeTruthy();
        const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 50 });
        const staff = (users?.users ?? []).find((u) => Boolean(u.email));
        expect(staff, "a staff auth user with an email exists on the cert stack").toBeTruthy();
        const config = { ...DEFAULT_TOUR_COMMS_CONFIG, internal_recipients: { enabled: true, user_ids: [staff!.id] } };
        const res = await sendTourInternalCalendarInvite({ supabase: db, orgId: ORG, booking: booking!, config, action: "request", actorUserId: ACTOR });
        // The recipient resolves and the .ics is built, but the canonical gate refuses an internal-audience email.
        expect(res).toMatchObject({ skippedReason: "enqueue_failed" });
        const rows = (await ok(db.from("communication_messages").select("status, audience, error, metadata").eq("org_id", ORG).filter("metadata->>tour_booking_id", "eq", booking!.id).filter("metadata->>tour_event_key", "eq", "tour_internal_calendar"))) as Array<{ status: string; audience: string; error: string | null; metadata: Json }>;
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.every((r) => r.status === "blocked" && r.error === "policy:INTERNAL_TO_PROVIDER")).toBe(true);
    });

    it("11 · repeating Approve or racing the handoff never books or confirms twice", async () => {
        const bookingId = String((await bookingsForCase(familyA.caseId!))[0]!.id);
        const before = (await confirmationsFor(bookingId)).length;
        const again = await approve(familyA.caseId!);
        expect(again.json.data).toMatchObject({ alreadyDone: true, tourRequest: { kind: "booked", bookingId, replay: true } });
        const opp = String(readRequestedTour((await caseMeta(familyA.caseId!)).metadata)!.opportunity_id);
        const raced = await Promise.all([1, 2, 3].map(() => materializeRequestedTourForCase(db, { orgId: ORG, caseId: familyA.caseId!, opportunityId: opp, actorUserId: ACTOR })));
        for (const o of raced) expect(o).toMatchObject({ kind: "booked", bookingId });
        expect(await bookingsForCase(familyA.caseId!)).toHaveLength(1);
        expect((await confirmationsFor(bookingId)).length).toBe(before);
        // Negative control: the database refuses a second active tour for the Opportunity outright.
        const { error } = await db.from("tour_bookings").insert({
            org_id: ORG, opportunity_id: opp, location_id: site, start_at: at("2033-03-02", "14:00"), end_at: plus30(at("2033-03-02", "14:00")),
            timezone: TZ, status_key: "confirmed", source: "admin", metadata: { slot_capacity: 2 },
        });
        expect(error?.message ?? "").toMatch(/ux_tour_bookings_one_active_non_terminal_per_opportunity|duplicate key/);
    });

    it("12 · a time that fills before Approve keeps the lead, records why, and offers current alternatives — nothing sent", async () => {
        const start = at("2033-03-01", "09:00");
        const fam = await familySubmits("b", { start_at: start, end_at: plus30(start) });
        expect(fam.status).toBe(200);
        // Another family takes the last seat at that time through the canonical writer.
        const person = idOf(await ok(db.from("persons").insert({ org_id: ORG, first_name: "Zz", last_name: `${RUN}-holder`, email: `qa+${RUN}-holder@example.invalid` }).select("id").single()));
        const holderOpp = idOf(await ok(db.from("opportunities").insert({ org_id: ORG, name: `ZZ ${RUN} holder`, location_id: site, primary_person_id: person, status_key: "open", stage_key: "lead" }).select("id").single()));
        await createTourBooking(db, { orgId: ORG, opportunityId: holderOpp, locationId: site, startAt: new Date(start), endAt: new Date(plus30(start)), timezone: TZ, source: "admin", requestedByUserId: null, primaryPersonId: person, approvalRequired: false, deferConfirmationComms: true });
        const pendingView = (await buildRequestedTourOperatorView(db, { orgId: ORG, caseId: fam.caseId! }))!;
        expect(pendingView.stillAvailable).toBe(false);

        const r = await approve(fam.caseId!);
        expect(r.json.data).toMatchObject({ status: "completed", tourRequest: { kind: "needs_rescheduling", reason: "slot_unavailable" } });
        const opp = (r.json.data!.operationalResult as { recordId: string }).recordId;
        expect(opp).toBeTruthy(); // the lead approval stands
        expect(await bookingsForCase(fam.caseId!)).toEqual([]);
        const tour = readRequestedTour((await caseMeta(fam.caseId!)).metadata)!;
        expect(tour).toMatchObject({ state: "needs_rescheduling", reason: "slot_unavailable", start_at: start }); // original time retained
        const view = (await buildRequestedTourOperatorView(db, { orgId: ORG, caseId: fam.caseId!, now: new Date("2033-02-27T12:00:00Z") }))!;
        expect(view.headline).toMatch(/needs rescheduling/i);
        expect(view.alternatives.length).toBeGreaterThan(0);
        expect(view.alternatives.map((a) => a.start_at)).not.toContain(start);
        // The enrollment side sees it on the lead until a tour is scheduled.
        const attention = await listRequestedTourAttentionForOpportunity(db, { orgId: ORG, opportunityId: opp, hasActiveBooking: false });
        expect(attention).toHaveLength(1);
        expect(attention[0]!.requestedLabel).toMatch(/9:00 AM/);
        const { data: msgs } = await db.from("communication_messages").select("id").eq("org_id", ORG).ilike("to_address", fam.email);
        expect(msgs ?? []).toEqual([]);
        // Re-approving does not silently pick another time.
        const again = await approve(fam.caseId!);
        expect(again.json.data).toMatchObject({ tourRequest: { kind: "needs_rescheduling", replay: true } });
        expect(await bookingsForCase(fam.caseId!)).toEqual([]);
    });

    it("13 · two families approved at once for the last seat: exactly one is booked, the other routes to rescheduling", async () => {
        const start = at("2033-03-01", "10:30");
        const famC = await familySubmits("c", { start_at: start, end_at: plus30(start) });
        const famD = await familySubmits("d", { start_at: start, end_at: plus30(start) });
        expect([famC.status, famD.status]).toEqual([200, 200]);
        const [rc, rd] = await Promise.all([approve(famC.caseId!), approve(famD.caseId!)]);
        const kinds = [rc.json.data?.tourRequest, rd.json.data?.tourRequest].map((t) => (t as Json | undefined)?.kind).sort();
        expect(kinds).toEqual(["booked", "needs_rescheduling"]);
        const { data: atSlot } = await db.from("tour_bookings").select("id").eq("location_id", site).eq("start_at", start).in("status_key", ["pending_approval", "confirmed", "rescheduled"]);
        expect(atSlot ?? []).toHaveLength(1);
    });

    it("a tour rule that requires approval books pending_approval and stays silent until staff approve the tour", async () => {
        const start = at("2033-03-03", "09:00");
        const fam = await familySubmits("e", { start_at: start, end_at: plus30(start) });
        const r = await approve(fam.caseId!);
        expect(r.json.data).toMatchObject({ tourRequest: { kind: "booked", bookingStatus: "pending_approval" } });
        const [b] = await bookingsForCase(fam.caseId!);
        expect(await confirmationsFor(String(b!.id))).toEqual([]);
        expect(readRequestedTour((await caseMeta(fam.caseId!)).metadata)!.comms).toMatchObject({ status: "not_applicable" });
        // C3·12 · a tour staff have not approved produces nothing at all: no confirmation, reminder or calendar invite.
        const anyMsg = (await ok(db.from("communication_messages").select("id").eq("org_id", ORG).filter("metadata->>tour_booking_id", "eq", String(b!.id)))) as Array<Json>;
        expect(anyMsg).toEqual([]);
        const anySend = (await ok(db.from("communication_scheduled_sends").select("id").eq("org_id", ORG).filter("metadata->>tour_booking_id", "eq", String(b!.id)))) as Array<Json>;
        expect(anySend).toEqual([]);
    });

    it("14 · 17 · an existing family with a prior opt-out: identity is resolved, never merged by email, and the opt-out holds", async () => {
        // A household already in the school's records, who opted out of email notices.
        const email = `qa+${RUN}-existing@example.invalid`;
        const existing = idOf(await ok(db.from("persons").insert({ org_id: ORG, first_name: "Zz", last_name: `Parentx ${RUN}`, email }).select("id").single()));
        for (const category of ["email_operational", "email_transactional", "sms_operational", "sms_transactional"]) {
            await ok(db.from("communication_preferences").upsert({ org_id: ORG, person_id: existing, category, state: "opted_out", source: "recipient_unsubscribe" }, { onConflict: "org_id,person_id,category" }));
        }
        const start = at("2033-03-02", "09:30");
        const draftRes = await draftPost(req("http://localhost/api/public/forms/x/submissions", { method: "POST", body: { payload: { values: {} } } }), { params: Promise.resolve({ token: tokens.calendar }) });
        const draftId = ((await draftRes.json()) as { data: { id: string } }).data.id;
        const submitRes = await submitPost(
            req(`http://localhost/api/public/forms/x/submissions/${draftId}/submit`, {
                method: "POST",
                body: { payload: { values: { guardian_full_name: `Zz Parentx ${RUN}`, guardian_email: email, child_first_name: "Zz Kidx", child_last_name: RUN } }, requested_tour: { start_at: start, end_at: plus30(start) } },
            }),
            { params: Promise.resolve({ token: tokens.calendar, submissionId: draftId }) }
        );
        expect(submitRes.status).toBe(200);
        const { data: sub } = await db.from("form_submissions").select("payload").eq("id", draftId).single();
        const caseId = String(((sub as { payload: { meta: { processing_case_id: string } } }).payload.meta.processing_case_id));
        caseIds.push(caseId);
        // Intake created nobody: the match is a candidate for the operator, not a merge.
        expect(await personsWithEmail(email)).toHaveLength(1);
        const first = await approve(caseId);
        if (first.status !== 200 || !first.json.data?.tourRequest) {
            // Governed review path: a plausible existing match is not auto-committed and nothing is booked.
            expect(first.status).toBeGreaterThanOrEqual(400);
            expect(await bookingsForCase(caseId)).toEqual([]);
            expect((await caseMeta(caseId)).status).not.toBe("completed");
            return;
        }
        // Linked to the existing person (no duplicate identity) and booked.
        expect(await personsWithEmail(email)).toHaveLength(1);
        const [b] = await bookingsForCase(caseId);
        expect(b).toBeTruthy();
        /*
         * I1 (C1 integrated): the confirmation of a tour the family asked for is TRANSACTIONAL, and canonical
         * eligibility (policy 2026-07-31.1) does not let a preference opt-out suppress a transactional
         * notice — only channel suppression (bounce / complaint / STOP hold) does. S1 recorded this switch as
         * C-D0's decision; C1 made it. Pre-C1 the send fell back to `operational` and was blocked here.
         * What still holds: the confirmation is exactly the classified tour notice, nothing marketing is
         * sent, and the opt-outs themselves are untouched by the intake or the link.
         */
        const { data: conf } = await db.from("communication_messages").select("status, error, category, metadata").eq("org_id", ORG).filter("metadata->>tour_booking_id", "eq", String(b!.id));
        const confirmations = ((conf ?? []) as Array<{ status: string; error: string | null; category: string; metadata: Json }>).filter((m) => m.metadata?.event_key === "tour_confirmation");
        expect(confirmations.length).toBeGreaterThanOrEqual(1);
        for (const m of confirmations) {
            expect(m.category).toBe("transactional");
            expect(m.error ?? "").not.toMatch(/OPTED_OUT/);
        }
        const recorded = readRequestedTour((await caseMeta(caseId)).metadata)!.comms;
        expect(recorded?.status, JSON.stringify({ recorded, confirmations })).toBe("sent");
        const { data: marketing } = await db.from("communication_messages").select("id").eq("org_id", ORG).ilike("to_address", email).eq("category", "marketing");
        expect(marketing ?? []).toEqual([]);
        const { data: prefsAfter } = await db.from("communication_preferences").select("category, state").eq("org_id", ORG).eq("person_id", existing);
        expect(((prefsAfter ?? []) as Array<{ category: string; state: string }>).filter((p) => p.state !== "opted_out")).toEqual([]);
    });
    /*
     * I1 — OPTIONAL MARKETING CONSENT (S7 × C1). The answer is evidence on the case; Approve commits it
     * for the resolved person through Communications' one preference authority, once.
     */
    async function marketingPrefs(personId: string) {
        const rows = (await ok(db.from("communication_preferences").select("category, state, source").eq("org_id", ORG).eq("person_id", personId))) as Array<{ category: string; state: string; source: string | null }>;
        return Object.fromEntries(rows.filter((r) => r.category.includes("marketing")).map((r) => [r.category, r.state]));
    }
    async function marketingEvents(personId: string) {
        return (await ok(db.from("communication_preference_events").select("category, from_state, to_state, source, method").eq("org_id", ORG).eq("person_id", personId).order("occurred_at", { ascending: true }))) as Array<Json>;
    }
    async function marketingMessagesTo(email: string) {
        return (await ok(db.from("communication_messages").select("id, category").eq("org_id", ORG).ilike("to_address", email).eq("category", "marketing"))) as Array<Json>;
    }

    it("C·1 · the link decides whether the control is offered; the tour flag itself never reaches the browser", async () => {
        const offered = await buildPublicFormResolvePayload(db, tokens.calendar, null);
        const plain = await buildPublicFormResolvePayload(db, tokens.plain, null);
        expect(offered.ok && offered.data.marketing_consent_offered).toBe(true);
        expect(plain.ok && plain.data.marketing_consent_offered).toBe(false);
        expect(JSON.stringify(offered.ok ? offered.data.link : null)).not.toContain("tour_calendar_v1");
    });

    it("C·2 · a malformed answer, or an answer on a link that never offered the control, is refused before any write", async () => {
        const bad = await familySubmits("cbad", null, tokens.calendar, { consent: { email: "yes" } });
        expect(bad.status).toBe(400);
        expect(bad.submit).toMatchObject({ code: "MARKETING_CONSENT_INVALID" });
        expect(bad.submissionStatus).toBe("draft");
        expect(bad.caseId).toBeNull();
        const notOffered = await familySubmits("cplain", null, tokens.plain, { consent: { email: true } });
        expect(notOffered.status).toBe(400);
        expect(notOffered.submit).toMatchObject({ code: "MARKETING_CONSENT_NOT_ACCEPTED" });
        expect(notOffered.submissionStatus).toBe("draft");
        // Negative control: the same link without a consent answer still takes the lead.
        const plainOk = await familySubmits("cplain2", null, tokens.plain);
        expect(plainOk.status).toBe(200);
        expect(readIntakeMarketingConsent((await caseMeta(plainOk.caseId!)).metadata)).toBeNull();
    });

    it("C·3 · unchecked boxes are recorded as 'no' and approval writes no marketing preference", async () => {
        const fam = await familySubmits("cnone", null, tokens.calendar, { consent: { email: false, sms: false } });
        expect(fam.status).toBe(200);
        const rec = readIntakeMarketingConsent((await caseMeta(fam.caseId!)).metadata)!;
        expect(rec).toMatchObject({ response: "submitted", choices: { email: false, sms: false }, committed: null, language: { version: INTAKE_MARKETING_CONSENT_LANGUAGE.version } });
        expect(rec.provenance).toMatchObject({ form_submission_id: fam.submissionId });
        const r = await approve(fam.caseId!);
        expect(r.status, JSON.stringify(r.json)).toBe(200);
        expect(r.json.data?.marketingConsent).toMatchObject({ kind: "committed", outcomes: [{ channel: "email", outcome: "skipped_unset" }, { channel: "sms", outcome: "skipped_unset" }] });
        const [person] = await personsWithEmail(fam.email);
        expect(await marketingPrefs(person!.id)).toEqual({});
        expect(await marketingMessagesTo(fam.email)).toEqual([]);
    });

    it("C·4 · an absent answer on an offering link is recorded as 'no' — submitting is never consent", async () => {
        const fam = await familySubmits("cabsent", null, tokens.calendar);
        const rec = readIntakeMarketingConsent((await caseMeta(fam.caseId!)).metadata)!;
        expect(rec).toMatchObject({ response: "absent", choices: { email: false, sms: false } });
        await approve(fam.caseId!);
        const [person] = await personsWithEmail(fam.email);
        expect(await marketingPrefs(person!.id)).toEqual({});
    });

    let emailFamily: Awaited<ReturnType<typeof familySubmits>>;
    let emailPerson = "";

    it("C·5 · explicit email consent: evidence before approval, email marketing only after it, a transactional confirmation, no marketing message", async () => {
        const start = at("2033-03-02", "14:30");
        emailFamily = await familySubmits("cemail", { start_at: start, end_at: plus30(start) }, tokens.calendar, { consent: { email: true, sms: false } });
        expect(emailFamily.status).toBe(200);
        // Before acceptance: evidence on the case, no person, no preference, no message.
        expect(readIntakeMarketingConsent((await caseMeta(emailFamily.caseId!)).metadata)).toMatchObject({ choices: { email: true, sms: false }, committed: null });
        expect(await personsWithEmail(emailFamily.email)).toEqual([]);
        const { data: before } = await db.from("communication_messages").select("id").eq("org_id", ORG).ilike("to_address", emailFamily.email);
        expect(before ?? []).toEqual([]);

        const r = await approve(emailFamily.caseId!);
        expect(r.status, JSON.stringify(r.json)).toBe(200);
        expect(r.json.data?.marketingConsent).toMatchObject({ kind: "committed", replayed: false, outcomes: [{ channel: "email", outcome: "opted_in" }, { channel: "sms", outcome: "skipped_unset" }] });
        const [person] = await personsWithEmail(emailFamily.email);
        emailPerson = person!.id;
        expect(await marketingPrefs(emailPerson)).toEqual({ email_marketing: "opted_in" });
        expect(await marketingEvents(emailPerson)).toEqual([expect.objectContaining({ category: "email_marketing", from_state: null, to_state: "opted_in", source: "public_intake", method: "form_checkbox" })]);
        expect(readIntakeMarketingConsent((await caseMeta(emailFamily.caseId!)).metadata)!.committed).toMatchObject({ person_id: emailPerson });
        // C1 · the operator sees this opt-in's source, wording and time, and that marketing email can now go.
        const optedInView = (await loadPersonPreferencesView(db, { orgId: ORG, personId: emailPerson })).preferences.find((p) => p.key === "email_marketing")!;
        expect(optedInView.lastChange).toMatchObject({ source: "public_intake", changedState: true, outcome: "opted_in", consentLanguageVersion: INTAKE_MARKETING_CONSENT_LANGUAGE.version });
        expect(describePreferenceProvenance(optedInView)).toMatch(new RegExp(`^Set by public inquiry form · .* · wording ${INTAKE_MARKETING_CONSENT_LANGUAGE.version.replace(/\./g, "\\.")}$`));
        expect(optedInView.effective.status).toBe("allowed");
        const smsView = (await loadPersonPreferencesView(db, { orgId: ORG, personId: emailPerson })).preferences.find((p) => p.key === "sms_marketing")!;
        // SMS was not ticked: nothing recorded, no consent invented.
        expect(smsView).toMatchObject({ state: "unset", lastChange: null, history: [] });
        expect(describePreferenceProvenance(smsView)).toBe("No consent on record");
        expect(smsView.effective.status).toBe("blocked");
        expect(presentIntakeMarketingConsent(readIntakeMarketingConsent((await caseMeta(emailFamily.caseId!)).metadata))?.lines).toEqual([
            { channel: "email", answered: "Email news: yes", applied: "Recorded as opted in" },
            { channel: "sms", answered: "Text news: no", applied: "Nothing recorded — no consent given" },
        ]);
        // Capturing consent generated no marketing message; the tour confirmation is transactional (C1).
        expect(await marketingMessagesTo(emailFamily.email)).toEqual([]);
        const [b] = await bookingsForCase(emailFamily.caseId!);
        const { data: conf } = await db.from("communication_messages").select("category, metadata").eq("org_id", ORG).filter("metadata->>tour_booking_id", "eq", String(b!.id));
        const confirmations = ((conf ?? []) as Array<{ category: string; metadata: Json }>).filter((m) => m.metadata?.event_key === "tour_confirmation");
        expect(confirmations.length).toBeGreaterThanOrEqual(1);
        for (const m of confirmations) expect(m.category).toBe("transactional");
    });

    it("C·6 · a replayed Approve commits nothing twice", async () => {
        const eventsBefore = (await marketingEvents(emailPerson)).length;
        const again = await approve(emailFamily.caseId!);
        expect(again.json.data).toMatchObject({ alreadyDone: true, marketingConsent: { kind: "committed", replayed: true, personId: emailPerson } });
        expect((await marketingEvents(emailPerson)).length).toBe(eventsBefore);
        expect(await marketingPrefs(emailPerson)).toEqual({ email_marketing: "opted_in" });
    });

    it("C·7 · SMS consent is its own answer: SMS marketing only", async () => {
        const fam = await familySubmits("csms", null, tokens.calendar, { consent: { sms: true } });
        const r = await approve(fam.caseId!);
        expect(r.json.data?.marketingConsent).toMatchObject({ outcomes: [{ channel: "email", outcome: "skipped_unset" }, { channel: "sms", outcome: "opted_in" }] });
        const [person] = await personsWithEmail(fam.email);
        expect(await marketingPrefs(person!.id)).toEqual({ sms_marketing: "opted_in" });
    });

    it("C·8 · a repeat inquiry after unsubscribing, and an existing email + SMS opt-out: the opt-outs hold, whatever identity path runs", async () => {
        // The family who opted in (C·5) later unsubscribes through the canonical authority.
        const unsub = await persistCommunicationPreference(db, { orgId: ORG, personId: emailPerson, category: "email_marketing", fromState: "opted_in", toState: "opted_out", source: "recipient_unsubscribe", method: "email_link" });
        expect(unsub.ok).toBe(true);
        // An existing parent with both marketing channels opted out.
        const existingEmail = `qa+${RUN}-optedout@example.invalid`;
        const existing = idOf(await ok(db.from("persons").insert({ org_id: ORG, first_name: "Zz", last_name: `Parentoo ${RUN}`, email: existingEmail }).select("id").single()));
        for (const category of ["email_marketing", "sms_marketing"]) {
            await ok(db.from("communication_preferences").upsert({ org_id: ORG, person_id: existing, category, state: "opted_out", source: "recipient_unsubscribe" }, { onConflict: "org_id,person_id,category" }));
        }

        for (const [n, email, personId] of [["crepeat", emailFamily.email, emailPerson], ["coo", existingEmail, existing]] as const) {
            const fam = await familySubmits(n, null, tokens.calendar, { consent: { email: true, sms: true }, email });
            expect(fam.status).toBe(200);
            // Intake creates nobody and writes no preference.
            expect(await personsWithEmail(email)).toHaveLength(1);
            const first = await approve(fam.caseId!);
            if (first.status !== 200) {
                // Ambiguous identity: the governed review path holds the case — and the consent with it.
                expect(readIntakeMarketingConsent((await caseMeta(fam.caseId!)).metadata)!.committed).toBeNull();
            } else {
                expect(first.json.data?.marketingConsent).toMatchObject({ kind: "committed", personId });
            }
            // Whichever way identity resolves to this person (operator link decision or automatic link), the
            // commit authority preserves both opt-outs.
            const handoff = await commitIntakeMarketingConsentForCase(db, { orgId: ORG, caseId: fam.caseId!, personId, actorUserId: ACTOR });
            expect(handoff.kind).toBe("committed");
            const outcomes = (handoff as { outcomes: Array<{ channel: string; outcome: string }> }).outcomes;
            expect(outcomes.find((o) => o.channel === "email")?.outcome).toBe("preserved_opt_out");
            const prefs = await marketingPrefs(personId);
            expect(prefs.email_marketing).toBe("opted_out");
            if (personId === existing) {
                expect(outcomes.find((o) => o.channel === "sms")?.outcome).toBe("preserved_opt_out");
                expect(prefs.sms_marketing).toBe("opted_out");
            }
            expect(await marketingMessagesTo(email)).toEqual([]);

            // C1 · provenance: the inquiry is history, never the source of the opt-out. The state row still
            // names the unsubscribe; the inquiry's event records what was asked, under which wording.
            const row = (await ok(db.from("communication_preferences").select("state, source").eq("org_id", ORG).eq("person_id", personId).eq("category", "email_marketing").single())) as Json;
            expect(row).toEqual({ state: "opted_out", source: "recipient_unsubscribe" });
            const ev = (await ok(db.from("communication_preference_events").select("from_state, to_state, source, metadata").eq("org_id", ORG).eq("person_id", personId).eq("category", "email_marketing").eq("source", "public_intake").order("occurred_at", { ascending: false }).limit(1).single())) as Json;
            expect(ev).toMatchObject({
                from_state: "opted_out",
                to_state: "opted_out",
                metadata: { outcome: "preserved_opt_out", requested_state: "opted_in", language_version: INTAKE_MARKETING_CONSENT_LANGUAGE.version, processing_case_id: fam.caseId },
            });
            // C1 · what the operator sees: provenance from the last real change, the inquiry as "opt-out kept",
            // and the canonical evaluator's answer.
            const view = await loadPersonPreferencesView(db, { orgId: ORG, personId });
            const marketing = view.preferences.find((p) => p.key === "email_marketing")!;
            expect(marketing.state).toBe("opted_out");
            expect(marketing.lastChange).toMatchObject({ source: "recipient_unsubscribe", toState: "opted_out", changedState: true });
            expect(marketing.history[0]).toMatchObject({ source: "public_intake", changedState: false, outcome: "preserved_opt_out" });
            expect(describePreferenceEvent(marketing.history[0]!)).toMatch(/asked to opt in — opt-out kept$/);
            expect(describePreferenceProvenance(marketing)).toMatch(/^Set by unsubscribe link/);
            expect(marketing.effective).toMatchObject({ status: "blocked", code: "OPTED_OUT" });
            // The person's own unsubscribe still locks the operator out of reversing it.
            expect(marketing.allowedChanges).toEqual([]);
            // The Processing case shows the family's answer and that it was not applied.
            const shown = presentIntakeMarketingConsent(readIntakeMarketingConsent((await caseMeta(fam.caseId!)).metadata));
            expect(shown?.lines.find((l) => l.channel === "email")).toEqual({ channel: "email", answered: "Email news: yes", applied: "Not applied — the person had opted out; the opt-out stands" });
        }
    });

    /*
     * I1 — WHAT A CONSENTED FAMILY ACTUALLY RECEIVES (C1 × S7). A family who opted in through the
     * public intake is sent marketing on the three outbound paths — direct, HTML provider, scheduled —
     * and unsubscribes through the link in that mail. Nothing reaches a provider: the Resend call is
     * captured, and the free-text row is what the Python dispatcher would deliver (`body` as the text
     * part, `metadata.unsubscribe_url` as List-Unsubscribe).
     *
     * The unsubscribe origin is the cert app origin, set only for these scenarios so nothing above
     * changes. Scheduled rows are due in 2001 and claimed with `now` in 2001, so the claim cannot
     * reach any other due row in Northwind.
     */
    describe("C·9–C·12 · delivered marketing, the recipient's unsubscribe, and scheduled dispatch", () => {
        const UNSUB_PATH = "/api/communications/unsubscribe";
        const SCHED = { approved: "2001-01-01T00:00:00.000Z", due: "2001-01-01T00:00:05.000Z", now: "2001-01-01T00:00:10.000Z" };
        const priorOrigin = process.env.NEXT_PUBLIC_APP_URL;
        let deliverEmail = "";
        let deliverPerson = "";
        let deliverLead = "";
        let unsubscribeUrl = "";

        beforeAll(() => {
            let origin = "";
            try {
                const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
                origin = file.split("\n").find((l) => l.startsWith("NEXT_PUBLIC_APP_URL="))?.slice("NEXT_PUBLIC_APP_URL=".length).trim() ?? "";
            } catch {
                origin = "";
            }
            process.env.NEXT_PUBLIC_APP_URL = origin || "http://localhost:3000";
        });
        afterAll(() => {
            if (priorOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
            else process.env.NEXT_PUBLIC_APP_URL = priorOrigin;
            vi.unstubAllGlobals();
        });

        type MessageRow = { id: string; status: string; category: string; error: string | null; body: string | null; to_address: string | null; metadata: Json; rendered_snapshot: { html?: string | null; text?: string | null } | null };
        async function messageRow(id: string): Promise<MessageRow> {
            return (await ok(db.from("communication_messages").select("id, status, category, error, body, to_address, metadata, rendered_snapshot").eq("id", id).single())) as MessageRow;
        }
        const claimsOf = (url: string) => {
            const v = verifyUnsubscribeToken(new URL(url).searchParams.get("t"));
            return v.ok ? v.claims : null;
        };
        async function directSend(category: "marketing" | "transactional", n: string) {
            return executeLegacyCommunicationsSendAdapter({
                supabase: db as never,
                orgId: ORG,
                quickMessage: false,
                primaryEntityType: "opportunities",
                primaryEntityId: deliverLead,
                channel: "email",
                textRaw: `ZZ ${RUN} ${n}`,
                subjectRawEmail: `ZZ ${RUN} ${n}`,
                bindingIdOpt: "",
                recipientPersonIdRaw: deliverPerson,
                toRawInput: "",
                category,
                audience: "external",
                purpose: null,
                callSite: `i1-cert:${RUN}:${n}`,
            });
        }
        async function scheduleSend(n: string, category: string | null) {
            return idOf(
                await ok(
                    db
                        .from("communication_scheduled_sends")
                        .insert({
                            org_id: ORG,
                            created_by: ACTOR,
                            entity_type: "opportunities",
                            entity_id: deliverLead,
                            recipient_person_id: deliverPerson,
                            channel: "email",
                            subject_snapshot: `ZZ ${RUN} ${n}`,
                            body_snapshot: `ZZ ${RUN} scheduled ${n}`,
                            scheduled_for: SCHED.due,
                            status: "pending",
                            approved_at: SCHED.approved,
                            approved_by: ACTOR,
                            source: "task_assist",
                            metadata: { cert_run: RUN, cert_case: n, ...(category ? { message_category: category } : {}) },
                        })
                        .select("id")
                        .single()
                )
            );
        }
        /** Claims due rows as the cron would — after proving every due row in the window is this run's. */
        async function dispatchDue(expectIds: string[]) {
            const due = (await ok(db.from("communication_scheduled_sends").select("id, metadata").eq("org_id", ORG).eq("status", "pending").lte("scheduled_for", SCHED.now))) as Array<{ id: string; metadata: Json }>;
            expect(due.map((r) => r.id).sort()).toEqual([...expectIds].sort());
            const r = await processDueCommunicationScheduledSends({ supabase: db as never, limit: 10, now: new Date(SCHED.now), orgIdFilter: ORG });
            expect(r.ok, JSON.stringify(r)).toBe(true);
            return (r as { result: { claimed: number; succeeded: number; failed: number } }).result;
        }
        async function scheduled(id: string) {
            return (await ok(db.from("communication_scheduled_sends").select("status, communication_message_id, metadata").eq("id", id).single())) as { status: string; communication_message_id: string | null; metadata: Json };
        }
        const smsFamilyEmail = () => `qa+${RUN}-csms@example.invalid`;
        let preUnsubScheduled = "";

        it("C·9 · a consented family's marketing email carries a working unsubscribe link on the direct and provider paths; transactional mail carries none", async () => {
            const fam = await familySubmits("cdeliver", null, tokens.calendar, { consent: { email: true } });
            expect(fam.status).toBe(200);
            const r = await approve(fam.caseId!);
            expect(r.status, JSON.stringify(r.json)).toBe(200);
            deliverEmail = fam.email;
            deliverPerson = (await personsWithEmail(fam.email))[0]!.id;
            expect(await marketingPrefs(deliverPerson)).toEqual({ email_marketing: "opted_in" });
            // Approve's lead is its operational result; the parent is the lead's primary person.
            deliverLead = String((r.json.data!.operationalResult as { recordId: string }).recordId);
            const lead = (await ok(db.from("opportunities").select("primary_person_id").eq("org_id", ORG).eq("id", deliverLead).single())) as { primary_person_id: string | null };
            expect(lead.primary_person_id, "Approve linked the parent to the lead").toBe(deliverPerson);

            // Direct path: the drawer adapter → canonical enqueue. The row is what the dispatcher delivers.
            const direct = await directSend("marketing", "direct-marketing");
            expect(direct.ok, JSON.stringify(direct)).toBe(true);
            const row = await messageRow((direct as { communication_message_id: string }).communication_message_id);
            expect(row).toMatchObject({ status: "queued", category: "marketing" });
            unsubscribeUrl = String(row.metadata.unsubscribe_url ?? "");
            expect(unsubscribeUrl).toContain(`${UNSUB_PATH}?t=`);
            expect(row.metadata.unsubscribe_category).toBe("email_marketing");
            expect(row.body).toContain(unsubscribeUrl); // the text part the dispatcher sends
            if (row.rendered_snapshot?.text) expect(row.rendered_snapshot.text).toContain(unsubscribeUrl);
            expect(claimsOf(unsubscribeUrl)).toMatchObject({ p: deliverPerson, o: ORG, c: "email_marketing" });

            // Provider path: rich content through canonical enqueue, then the real Resend delivery with
            // the network call captured. The HTML, the text and the List-Unsubscribe header all carry it.
            const html = await enqueueCanonicalOutboundMessage({
                supabase: db as never,
                orgId: ORG,
                primaryEntityType: "opportunities",
                primaryEntityId: deliverLead,
                channelRaw: "email",
                toRaw: deliverEmail,
                bodyRaw: `<p>ZZ ${RUN} open house — <a href="https://school.example/open-house">details</a></p>`,
                bodyIsHtml: true,
                emailSubjectRaw: `ZZ ${RUN} open house`,
                metadata: { cert_run: RUN },
                recipientPersonId: deliverPerson,
                audience: "external",
                category: "marketing",
                callSite: `i1-cert:${RUN}:html-marketing`,
                emitMessageQueued: false,
            });
            expect(html.communicationMessageId, JSON.stringify(html)).toBeTruthy();
            const htmlRow = await messageRow(html.communicationMessageId!);
            expect(htmlRow.status).toBe("queued");
            const htmlUrl = String(htmlRow.metadata.unsubscribe_url ?? "");
            expect(claimsOf(htmlUrl)).toMatchObject({ p: deliverPerson, o: ORG, c: "email_marketing" });

            // Only the provider call is captured; the database client's own requests pass through.
            const sent: Array<{ url: string; body: Json }> = [];
            const realFetch = globalThis.fetch;
            vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
                if (!url.startsWith("https://api.resend.com/")) return realFetch(input, init);
                sent.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Json });
                return new Response(JSON.stringify({ id: `cert-stub-${RUN}` }), { status: 200, headers: { "content-type": "application/json" } });
            }));
            try {
                const delivered = await deliverQueuedEmailHtml({ supabase: db as never, messageId: html.communicationMessageId!, resendApiKey: "re_cert_stub" });
                expect(delivered, JSON.stringify(delivered)).toMatchObject({ ok: true });
            } finally {
                vi.unstubAllGlobals();
            }
            expect(sent).toHaveLength(1);
            expect(sent[0]!.url).toBe("https://api.resend.com/emails");
            const payload = sent[0]!.body as { to: string[]; html: string; text?: string; headers?: Record<string, string> };
            expect(payload.to).toEqual([deliverEmail]);
            expect(payload.html).toContain(`href="${htmlUrl}"`);
            expect(payload.text ?? "").toContain(htmlUrl);
            expect(payload.headers).toMatchObject({ "List-Unsubscribe": `<${htmlUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

            // Transactional mail to the same consented person: no link, no footer — classification
            // decides, not the recipient's marketing state.
            const tx = await directSend("transactional", "direct-transactional");
            expect(tx.ok, JSON.stringify(tx)).toBe(true);
            const txRow = await messageRow((tx as { communication_message_id: string }).communication_message_id);
            expect(txRow).toMatchObject({ status: "queued", category: "transactional" });
            expect(txRow.metadata.unsubscribe_url).toBeUndefined();
            expect(txRow.body ?? "").not.toContain(UNSUB_PATH);
        });

        it("C·10 · a scheduled marketing send to the opted-in family is dispatched with its own unsubscribe link", async () => {
            const id = await scheduleSend("sched-optedin", "marketing");
            const res = await dispatchDue([id]);
            expect(res).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });
            const s = await scheduled(id);
            expect(s.status).toBe("queued");
            const row = await messageRow(s.communication_message_id!);
            expect(row).toMatchObject({ status: "queued", category: "marketing" });
            const url = String(row.metadata.unsubscribe_url ?? "");
            expect(row.body).toContain(url);
            expect(claimsOf(url)).toMatchObject({ p: deliverPerson, o: ORG, c: "email_marketing" });
        });

        it("C·11 · the link from the delivered email unsubscribes that family — only that family, only that category, only by POST", async () => {
            const smsPerson = (await personsWithEmail(smsFamilyEmail()))[0]!.id;
            const smsBefore = await marketingPrefs(smsPerson);
            expect(smsBefore).toEqual({ sms_marketing: "opted_in" });
            const token = new URL(unsubscribeUrl).searchParams.get("t")!;
            const post = (t: string) => unsubscribePost(new Request(`http://localhost${UNSUB_PATH}?t=${encodeURIComponent(t)}`, { method: "POST" }));

            // C3·5 · the same person's SMS marketing consent is its own decision: recorded before the email unsubscribe.
            const smsOptIn = await persistCommunicationPreference(db, { orgId: ORG, personId: deliverPerson, category: "sms_marketing", fromState: null, toState: "opted_in", source: "public_intake", method: "form_checkbox" });
            expect(smsOptIn.ok).toBe(true);
            // C3·6 · a marketing send approved and scheduled while the family is opted in — dispatched after they unsubscribe (C·12).
            preUnsubScheduled = await scheduleSend("sched-pre-unsub", "marketing");

            // C3·9 · an expired token and a malformed one are refused safely and change nothing.
            const expired = issueUnsubscribeToken({ personId: deliverPerson, orgId: ORG, category: "email_marketing", ttlSeconds: -60 });
            expect(verifyUnsubscribeToken(expired)).toMatchObject({ ok: false, reason: "expired" });
            expect((await post(expired)).status).toBe(400);
            expect((await post("not-a-token")).status).toBe(400);
            expect((await unsubscribeGet(new Request(`http://localhost${UNSUB_PATH}?t=not-a-token`))).status).toBe(400);
            expect((await marketingPrefs(deliverPerson)).email_marketing).toBe("opted_in");

            // A forged token naming another family (payload swapped, signature kept) changes nothing.
            const [, sig] = token.split(".");
            const forgedPayload = Buffer.from(JSON.stringify({ ...claimsOf(unsubscribeUrl), p: smsPerson }), "utf8").toString("base64url");
            expect((await post(`${forgedPayload}.${sig}`)).status).toBe(400);
            // A validly signed token for this person in ANOTHER tenant changes nothing anywhere.
            const crossTenant = issueUnsubscribeToken({ personId: deliverPerson, orgId: otherOrg, category: "email_marketing" });
            expect((await post(crossTenant)).status).toBe(400);
            const { data: otherOrgPrefs } = await db.from("communication_preferences").select("id").eq("org_id", otherOrg);
            expect(otherOrgPrefs ?? []).toEqual([]);
            // Opening the link (GET — what a prefetching scanner does) only asks.
            const get = await unsubscribeGet(new Request(`http://localhost${UNSUB_PATH}?t=${encodeURIComponent(token)}`));
            expect(get.status).toBe(200);
            expect(await get.text()).toContain('method="post"');
            expect((await marketingPrefs(deliverPerson)).email_marketing).toBe("opted_in");

            // The recipient confirms.
            const res = await post(token);
            expect(res.status).toBe(200);
            expect(await res.text()).toContain("You have been unsubscribed");
            expect((await marketingPrefs(deliverPerson)).email_marketing).toBe("opted_out");
            const events = await marketingEvents(deliverPerson);
            expect(events.at(-1)).toMatchObject({ category: "email_marketing", to_state: "opted_out", source: "recipient_unsubscribe" });
            // The other family, and this family's other channels, are untouched.
            expect(await marketingPrefs(smsPerson)).toEqual(smsBefore);
            expect((await marketingPrefs(deliverPerson)).sms_marketing).toBe("opted_in");
        });

        it("C·12 · after unsubscribing, marketing is suppressed on the direct and scheduled paths, and a send with no category is refused", async () => {
            const marketingBefore = (await marketingMessagesTo(deliverEmail)).length;

            const direct = await directSend("marketing", "direct-after-unsub");
            // C2 · the adapter answers an intentional suppression as a governed refusal (409
            // recipient_suppressed, outcome blocked) — never a 500 — and names the blocked row it persisted.
            expect(direct).toMatchObject({ ok: false, status: 409, code: "recipient_suppressed", outcome: "blocked", reason: "eligibility_blocked:OPTED_OUT" });
            const directThread = String((direct as { thread_id?: string }).thread_id ?? "");
            expect(directThread).not.toBe("");
            const threadRows = (await ok(db.from("communication_messages").select("id, status, category, error").eq("org_id", ORG).eq("thread_id", directThread).eq("status", "blocked"))) as Array<{ id: string; status: string; category: string; error: string | null }>;
            expect(threadRows.length).toBe(1);
            const directRow = threadRows[0]!;
            expect(directRow).toMatchObject({ status: "blocked", category: "marketing", error: "policy:OPTED_OUT" });
            expect((direct as { blocked_communication_message_id?: string }).blocked_communication_message_id).toBe(directRow.id);

            const optedOut = await scheduleSend("sched-after-unsub", "marketing");
            const uncategorised = await scheduleSend("sched-no-category", null);
            const res = await dispatchDue([preUnsubScheduled, optedOut, uncategorised]);
            expect(res.claimed).toBe(3);
            // C3·6 · scheduled while opted in, dispatched after the unsubscribe: re-checked at dispatch and refused.
            const pre = await scheduled(preUnsubScheduled);
            expect(pre).toMatchObject({ status: "failed", communication_message_id: null });
            expect(pre.metadata.last_process_error).toMatchObject({ http_status: 409, code: "recipient_suppressed", reason: "eligibility_blocked:OPTED_OUT" });
            // The dispatcher's adapter is refused by the eligibility gate: the scheduled send fails with
            // the refusal recorded and no message id; the blocked row is the one carrying its body.
            const s = await scheduled(optedOut);
            expect(s.status).toBe("failed");
            expect(s.communication_message_id).toBeNull();
            expect(s.metadata.last_process_error).toMatchObject({ http_status: 409, code: "recipient_suppressed", outcome: "blocked", reason: "eligibility_blocked:OPTED_OUT" });
            const schedRows = (await ok(db.from("communication_messages").select("id, status, category, error").eq("org_id", ORG).ilike("to_address", deliverEmail).ilike("body", `%ZZ ${RUN} scheduled sched-after-unsub%`))) as Array<{ id: string; status: string; category: string; error: string | null }>;
            expect(schedRows.length).toBe(1);
            const blocked = schedRows[0]!;
            expect(blocked).toMatchObject({ status: "blocked", category: "marketing", error: "policy:OPTED_OUT" });
            const u = await scheduled(uncategorised);
            expect(u.status).toBe("failed");
            expect(u.communication_message_id).toBeNull();
            expect(u.metadata.last_process_error).toMatchObject({ code: "missing_category" });

            // C3·7 · a workflow's send reaches the same gate: the canonical mirror of create_message is refused
            // (no category, no consent), and nothing deliverable is created. Its legacy SMS twin is refused at
            // dispatch by revalidate_for_dispatch (backend/tests/test_message_sender_qa_refuse.py).
            const wf = await enqueueCanonicalCommunicationMirror({
                supabase: db as never,
                orgId: ORG,
                workflowRunId: randomUUID(),
                workflowId: randomUUID(),
                channelRaw: "email",
                toRaw: deliverEmail,
                bodyRaw: `ZZ ${RUN} workflow-after-unsub`,
                payload: { org_id: ORG, opportunity: { id: deliverLead }, person: { id: deliverPerson } },
            });
            expect(wf.communicationMessageId).toBeNull();
            expect(wf.skippedReason ?? "").toMatch(/^eligibility_blocked:/);
            const wfRows = (await ok(db.from("communication_messages").select("status").eq("org_id", ORG).ilike("body", `%ZZ ${RUN} workflow-after-unsub%`))) as Array<{ status: string }>;
            expect(wfRows.filter((r) => r.status !== "blocked")).toEqual([]);

            // Exactly three new marketing rows, all blocked: nothing deliverable was created.
            const after = (await ok(db.from("communication_messages").select("id, status").eq("org_id", ORG).ilike("to_address", deliverEmail).eq("category", "marketing"))) as Array<{ id: string; status: string }>;
            expect(after.length).toBe(marketingBefore + 3);
            expect(after.filter((m) => m.status !== "blocked").length).toBe(marketingBefore);
            expect(after.filter((m) => m.id === directRow.id || m.id === blocked.id).map((m) => m.status)).toEqual(["blocked", "blocked"]);
            expect(await marketingPrefs(deliverPerson)).toEqual({ email_marketing: "opted_out", sms_marketing: "opted_in" });
        });
    });
});
