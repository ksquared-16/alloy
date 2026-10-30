/**
 * The real ports of the Tours certification fixture: the isolated QA database (service role, loopback
 * only — the guard refuses anything else before this is built) and the candidate preview's own Forms
 * routes, called as the bound QA persona.
 *
 * Product owners reused, never re-implemented:
 *   - tour rules: `createTourSchedule` / `deleteTourSchedule` (the schedule writer; org-wide scope = the
 *     legacy shape, `location_id` NULL);
 *   - form links: POST /api/admin/forms/[formId]/public-links and PATCH …/[linkId] on the preview. Token
 *     generation, hashing, location metadata and lead-capture rules stay the route's; this file keeps only
 *     the new link's id and discards the rest of the response (it carries the plaintext token).
 * Written directly, because no product writer may create them: the legacy PENDING booking (the booking
 * writer revalidates against location-only availability and refuses it, which is the behaviour under
 * test) and the synthetic household (the same rows the canonical lead seed writes). None carries a token.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { createTourSchedule, deleteTourSchedule } from "@/lib/tours/schedules/tourScheduleWrites";
import { TOUR_SCHEDULE_METADATA_KEY } from "@/lib/tours/schedules/tourWeeklySchedule";
import {
    LEGACY_RULE,
    TOURS_FIXTURE_EMAIL,
    TOURS_FIXTURE_LOCATION_ID,
    TOURS_FIXTURE_MARKER,
    TOURS_FIXTURE_MARKER_KEY,
    TOURS_FIXTURE_NAMESPACE,
    TOURS_FIXTURE_ORG_ID,
    TOURS_FIXTURE_ROLE_KEY,
    isLoopbackHttp,
    type FixtureForm,
    type LocationLinkRow,
    type MarkerBooking,
    type MarkerFamily,
    type MarkerRule,
    type ToursFixturePorts,
} from "@/lib/qa/toursFixture/toursCertificationFixture";

const ORG = TOURS_FIXTURE_ORG_ID;
const MARK = { [TOURS_FIXTURE_MARKER_KEY]: TOURS_FIXTURE_MARKER };
const MARKER_FILTER = `metadata->>${TOURS_FIXTURE_MARKER_KEY}`;

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
    // The message never leaves this process: the fixture prints only check names.
    if (r.error) throw new Error("db");
    return r.data as T;
}

/** The preview origin and Cookie header from the executor-provided QA storage state (loopback only). */
export function previewSessionFrom(path: string | undefined): { origin: string; cookie: string } | null {
    if (!path) return null;
    try {
        const state = JSON.parse(readFileSync(path, "utf8")) as { cookies?: { name: string; value: string; domain?: string }[]; origins?: { origin?: string }[] };
        const origin = state.origins?.map((o) => o.origin).find((o) => isLoopbackHttp(o));
        if (!origin) return null;
        const host = new URL(origin).hostname;
        const cookies = (state.cookies ?? []).filter((c) => !c.domain || c.domain.replace(/^\./, "") === host);
        if (!cookies.length) return null;
        return { origin, cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
    } catch {
        return null;
    }
}

export function createToursFixturePorts(env: Readonly<Record<string, string | undefined>>): ToursFixturePorts {
    const db: SupabaseClient = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const session = previewSessionFrom(env.ALLOY_QA_SESSION_FILE);

    async function preview(path: string, init: { method: string; body: unknown }): Promise<Record<string, unknown>> {
        if (!session) throw new Error("preview_session_unavailable");
        const res = await fetch(`${session.origin}${path}`, {
            method: init.method,
            headers: { "content-type": "application/json", cookie: session.cookie },
            body: JSON.stringify(init.body),
            redirect: "manual",
        });
        if (!res.ok) throw new Error(`preview_${res.status}`);
        const json = (await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
        return (json.data ?? json) as Record<string, unknown>;
    }

    const toRule = (r: Record<string, unknown>): MarkerRule => ({
        id: String(r.id),
        location_id: (r.location_id as string | null) ?? null,
        day_of_week: Number(r.day_of_week),
        start_time: String(r.start_time),
        end_time: String(r.end_time),
        schedule_id: ((r.metadata as Record<string, { id?: string }> | null)?.[TOUR_SCHEDULE_METADATA_KEY]?.id as string | undefined) ?? null,
    });

    return {
        async orgAndLocationExist() {
            const org = must(await db.from("orgs").select("id").eq("id", ORG).maybeSingle());
            const loc = must(await db.from("locations").select("id").eq("id", TOURS_FIXTURE_LOCATION_ID).eq("org_id", ORG).maybeSingle());
            return Boolean(org && loc);
        },
        async countActiveProviderBindings() {
            const r = await db.from("communication_provider_bindings").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("status", "active");
            if (r.error || r.count === null) throw new Error("db");
            return r.count;
        },
        async countOutboundRows() {
            const m = await db.from("communication_messages").select("id", { count: "exact", head: true }).eq("org_id", ORG);
            const s = await db.from("communication_scheduled_sends").select("id", { count: "exact", head: true }).eq("org_id", ORG);
            if (m.error || s.error || m.count === null || s.count === null) throw new Error("db");
            return { messages: m.count, scheduled: s.count };
        },
        async countNamespaceOutboundRows() {
            const r = await db.from("communication_messages").select("id", { count: "exact", head: true }).eq("org_id", ORG).ilike("to_address", `%@${TOURS_FIXTURE_NAMESPACE}`);
            if (r.error || r.count === null) throw new Error("db");
            return r.count;
        },

        async findMarkerRules() {
            const rows = must(await db.from("tour_availability_rules").select("id, location_id, day_of_week, start_time, end_time, metadata").eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER));
            return (rows as Record<string, unknown>[]).map(toRule);
        },
        async findLocationRules() {
            const rows = must(await db.from("tour_availability_rules").select("id, location_id, day_of_week, start_time, end_time, metadata").eq("org_id", ORG).eq("location_id", TOURS_FIXTURE_LOCATION_ID).eq("is_active", true));
            return (rows as Record<string, unknown>[]).map(toRule);
        },
        async createLegacyRule() {
            const r = await createTourSchedule(db, { orgId: ORG, locationId: null }, {
                name: LEGACY_RULE.name,
                days: [LEGACY_RULE.day_of_week],
                windows: [{ start_time: LEGACY_RULE.start_time, end_time: LEGACY_RULE.end_time }],
                timezone: LEGACY_RULE.timezone,
                slot_duration_minutes: LEGACY_RULE.slot_duration_minutes,
                buffer_minutes: 0,
                max_bookings_per_slot: 1,
                approval_required: true,
                is_active: true,
            });
            if (!r.ok) throw new Error("schedule");
            // Ownership: the writer stamps its schedule identity; the fixture adds its marker beside it.
            for (const rule of r.rules as unknown as { id: string; metadata?: Record<string, unknown> | null }[]) {
                must(await db.from("tour_availability_rules").update({ metadata: { ...(rule.metadata ?? {}), ...MARK, [TOURS_FIXTURE_ROLE_KEY]: "legacy_rule" } }).eq("id", rule.id).eq("org_id", ORG).select("id"));
            }
        },
        async deleteRuleSchedule(scheduleId) {
            const r = await deleteTourSchedule(db, { orgId: ORG, locationId: null }, scheduleId);
            if (!r.ok) throw new Error("schedule");
            return r.deleted;
        },
        async deleteRules(ids) {
            const rows = must(await db.from("tour_availability_rules").delete().eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).in("id", ids).select("id"));
            return (rows as unknown[]).length;
        },

        async findMarkerFamily() {
            const person = must(await db.from("persons").select("id").eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).maybeSingle()) as { id: string } | null;
            const customer = must(await db.from("customers").select("id").eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).maybeSingle()) as { id: string } | null;
            const opp = must(await db.from("opportunities").select("id").eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).maybeSingle()) as { id: string } | null;
            const memberships = customer && person
                ? (must(await db.from("customer_persons").select("id").eq("org_id", ORG).eq("customer_id", customer.id).eq("person_id", person.id)) as { id: string }[])
                : [];
            return { personId: person?.id ?? null, customerId: customer?.id ?? null, opportunityId: opp?.id ?? null, membershipIds: memberships.map((m) => m.id) };
        },
        async createFamily(existing) {
            let { personId, customerId, opportunityId } = existing;
            if (!personId) {
                const p = must(await db.from("persons").insert({ org_id: ORG, first_name: "Tourqa", last_name: "Legacy", email: TOURS_FIXTURE_EMAIL, phone: null, status_key: "active", metadata: { ...MARK } }).select("id").single()) as { id: string };
                personId = p.id;
            }
            if (!customerId) {
                const c = must(await db.from("customers").insert({ org_id: ORG, name: "Tourqa Legacy household (fixture)", customer_type: "household", status_key: "active", primary_contact_id: null, metadata: { ...MARK } }).select("id").single()) as { id: string };
                customerId = c.id;
            }
            let membershipIds = existing.membershipIds;
            if (!membershipIds.length) {
                const m = must(await db.from("customer_persons").insert({ org_id: ORG, customer_id: customerId, person_id: personId, role_type: "primary_guardian", is_primary: true }).select("id").single()) as { id: string };
                membershipIds = [m.id];
            }
            if (!opportunityId) {
                const v = must(await db.from("verticals").select("id").eq("org_id", ORG).limit(1).maybeSingle()) as { id: string } | null;
                if (!v) throw new Error("vertical");
                const o = must(await db.from("opportunities").insert({ org_id: ORG, vertical_id: v.id, name: "Tourqa Legacy (fixture)", source: "tours_certification_fixture", status_key: NEW_LEAD_STATUS_KEY, customer_id: customerId, primary_person_id: personId, primary_contact_id: null, location_id: TOURS_FIXTURE_LOCATION_ID, metadata: { ...MARK } }).select("id").single()) as { id: string };
                opportunityId = o.id;
            }
            return { personId, customerId, opportunityId, membershipIds };
        },
        async deleteFamily(f: MarkerFamily) {
            let n = 0;
            // Every delete re-asserts the marker (or, for the membership join, both marked ends).
            if (f.opportunityId) n += (must(await db.from("opportunities").delete().eq("org_id", ORG).eq("id", f.opportunityId).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).select("id")) as unknown[]).length;
            if (f.membershipIds.length && f.customerId && f.personId) n += (must(await db.from("customer_persons").delete().eq("org_id", ORG).eq("customer_id", f.customerId).eq("person_id", f.personId).in("id", f.membershipIds).select("id")) as unknown[]).length;
            if (f.customerId) n += (must(await db.from("customers").delete().eq("org_id", ORG).eq("id", f.customerId).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).select("id")) as unknown[]).length;
            if (f.personId) n += (must(await db.from("persons").delete().eq("org_id", ORG).eq("id", f.personId).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).select("id")) as unknown[]).length;
            return n;
        },

        async findMarkerBookings() {
            const rows = must(await db.from("tour_bookings").select("id, location_id, status_key, start_at, end_at").eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER));
            return rows as MarkerBooking[];
        },
        async insertLegacyPendingBooking(input) {
            must(await db.from("tour_bookings").insert({
                org_id: ORG,
                opportunity_id: input.opportunityId,
                location_id: TOURS_FIXTURE_LOCATION_ID,
                primary_person_id: input.personId,
                primary_contact_id: null,
                requested_by_user_id: null,
                start_at: input.startAt,
                end_at: input.endAt,
                timezone: LEGACY_RULE.timezone,
                status_key: "pending_approval",
                source: "admin",
                // `slot_capacity` is what enforce_tour_booking_slot_capacity requires of a capacity-consuming status.
                metadata: { ...MARK, [TOURS_FIXTURE_ROLE_KEY]: "legacy_pending_booking", slot_capacity: 1 },
            }).select("id"));
        },
        async deleteBookings(ids) {
            if (!ids.length) return 0;
            const rows = must(await db.from("tour_bookings").delete().eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER).in("id", ids).select("id"));
            return (rows as unknown[]).length;
        },

        async resolveForms(titles) {
            const rows = must(await db.from("form_definitions").select("id, name, is_active").eq("org_id", ORG).in("name", [...titles])) as { id: string; name: string; is_active?: boolean }[];
            const out: FixtureForm[] = [];
            for (const title of titles) {
                const hits = rows.filter((r) => r.name === title && r.is_active !== false);
                if (hits.length !== 1) return { refused: hits.length ? "ambiguous" : "missing" };
                out.push({ id: hits[0]!.id, title });
            }
            return out;
        },
        async listLocationLinks() {
            const rows = must(await db.from("form_public_links").select("id, form_definition_id, is_active, expires_at, allowed_embed_origins, metadata, created_at").eq("org_id", ORG));
            return rows as LocationLinkRow[];
        },
        async createLink({ formId, key }) {
            const data = await preview(`/api/admin/forms/${formId}/public-links`, {
                method: "POST",
                body: { location_id: TOURS_FIXTURE_LOCATION_ID, label: `Tours cert ${key}`, metadata: { ...MARK, [TOURS_FIXTURE_ROLE_KEY]: key } },
            });
            const id = typeof data.id === "string" ? data.id : "";
            if (!id) throw new Error("link");
            return id; // the plaintext token in `data` is dropped here and never stored or printed
        },
        async withdrawLink({ formId, linkId }) {
            await preview(`/api/admin/forms/${formId}/public-links/${linkId}`, { method: "PATCH", body: { is_active: false } });
        },
    };
}
