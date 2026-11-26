/**
 * The real ports of the Tours certification fixture: the isolated QA database (service role) and the candidate
 * preview's own Forms routes, called as the bound QA persona. Everything comes from what was verified, never from a
 * second read of the environment: the Supabase API origin and service key are the copy `runAttestedToursConnection`
 * froze and re-verified (`ToursClientConfig` — the origin is the authority's `api_identity`); the organization, site
 * and QA run are `ToursFixtureWorld` (persona org `qa_shared`, site `qa_north`, the verified `qa_run_id`); the preview
 * origin and Cookie header are the digest-bound session (`PreviewSession`) — never a constant, never a URL from the
 * session file.
 *
 * Product owners reused, never re-implemented:
 *   - tour rules: `createTourSchedule` / `deleteTourSchedule` (the schedule writer; org-wide scope = the
 *     legacy shape, `location_id` NULL);
 *   - the run's two forms: POST /api/admin/forms, POST …/[formId]/versions and POST …/versions/[versionId]/publish
 *     on the preview (key allocation, schema validation, the publish gates and the publisher stay the routes');
 *     this file keeps only the new ids (toursFixtureForms.ts owns the ownership rules);
 *   - form links: POST /api/admin/forms/[formId]/public-links and PATCH …/[linkId] on the preview. Token
 *     generation, hashing, location metadata and lead-capture rules stay the route's; this file keeps only
 *     the new link's id and discards the rest of the response (it carries the plaintext token).
 * Written directly, because no product writer may create them: the legacy PENDING booking (the booking
 * writer revalidates against location-only availability and refuses it, which is the behaviour under
 * test) and the synthetic household (the same rows the canonical lead seed writes). None carries a token.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { createTourSchedule, deleteTourSchedule } from "@/lib/tours/schedules/tourScheduleWrites";
import { TOUR_SCHEDULE_METADATA_KEY } from "@/lib/tours/schedules/tourWeeklySchedule";
import {
    LEGACY_RULE,
    TOURS_FIXTURE_EMAIL,
    TOURS_FIXTURE_MARKER,
    TOURS_FIXTURE_MARKER_KEY,
    TOURS_FIXTURE_NAMESPACE,
    TOURS_FIXTURE_ROLE_KEY,
    type LocationLinkRow,
    type MarkerBooking,
    type MarkerFamily,
    type MarkerRule,
    type PreviewSession,
    type ToursClientConfig,
    type ToursFixturePorts,
    type ToursFixtureWorld,
} from "@/lib/qa/toursFixture/toursCertificationFixture";
import { TOURS_FIXTURE_RUN_KEY, type FixtureFormRow, type FixtureFormVersionRow } from "@/lib/qa/toursFixture/toursFixtureForms";

const MARK = { [TOURS_FIXTURE_MARKER_KEY]: TOURS_FIXTURE_MARKER };
const MARKER_FILTER = `metadata->>${TOURS_FIXTURE_MARKER_KEY}`;

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
    // The message never leaves this process: the fixture prints only check names.
    if (r.error) throw new Error("db");
    return r.data as T;
}

export function createToursFixturePorts(client: ToursClientConfig, bound: { world: ToursFixtureWorld; session: PreviewSession }): ToursFixturePorts {
    if (!client.apiUrl || !client.serviceKey) throw new Error("client");
    const db: SupabaseClient = createClient(client.apiUrl, client.serviceKey, { auth: { persistSession: false } });
    const ORG = bound.world.orgId;
    const LOCATION = bound.world.locationId;
    const RUN = bound.world.runId;
    const session = bound.session;

    async function preview(path: string, init: { method: string; body: unknown }): Promise<Record<string, unknown>> {
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
            const loc = must(await db.from("locations").select("id").eq("id", LOCATION).eq("org_id", ORG).maybeSingle());
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
            const rows = must(await db.from("tour_availability_rules").select("id, location_id, day_of_week, start_time, end_time, metadata").eq("org_id", ORG).eq("location_id", LOCATION).eq("is_active", true));
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
                // `verticals` is platform-wide (no org_id): the active childcare vertical, as lib/dev/seedChildcareDemo resolves it.
                const v = must(await db.from("verticals").select("id").eq("slug", "childcare").eq("is_active", true).maybeSingle()) as { id: string } | null;
                if (!v) throw new Error("vertical");
                const o = must(await db.from("opportunities").insert({ org_id: ORG, vertical_id: v.id, name: "Tourqa Legacy (fixture)", source: "tours_certification_fixture", status_key: NEW_LEAD_STATUS_KEY, customer_id: customerId, primary_person_id: personId, primary_contact_id: null, location_id: LOCATION, metadata: { ...MARK } }).select("id").single()) as { id: string };
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
                location_id: LOCATION,
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

        async findFixtureFormRows(keys) {
            const cols = "id, org_id, key, name, is_active, metadata";
            const byKey = keys.length ? (must(await db.from("form_definitions").select(cols).eq("org_id", ORG).in("key", [...keys])) as FixtureFormRow[]) : [];
            const byMarker = must(await db.from("form_definitions").select(cols).eq("org_id", ORG).eq(MARKER_FILTER, TOURS_FIXTURE_MARKER)) as FixtureFormRow[];
            return [...new Map([...byKey, ...byMarker].map((r) => [r.id, r])).values()];
        },
        async countFormKeysOutsideOrg(keys) {
            const r = await db.from("form_definitions").select("id", { count: "exact", head: true }).in("key", [...keys]).neq("org_id", ORG);
            if (r.error || r.count === null) throw new Error("db");
            return r.count;
        },
        async findFormOrg(formId) {
            const row = must(await db.from("form_definitions").select("org_id").eq("id", formId).maybeSingle()) as { org_id: string } | null;
            return row?.org_id ?? null;
        },
        async listFormVersions(formIds) {
            if (!formIds.length) return [];
            // Not org-filtered on purpose: a version of these definitions in another org is a refusal, not invisible.
            return must(await db.from("form_definition_versions").select("id, org_id, form_definition_id, status, metadata").in("form_definition_id", [...formIds])) as FixtureFormVersionRow[];
        },
        async createForm({ key, name, metadata }) {
            const data = await preview("/api/admin/forms", { method: "POST", body: { key, name, kind: "center", is_active: true, metadata } });
            const id = typeof data.id === "string" ? data.id : "";
            if (!id) throw new Error("form");
            return id;
        },
        async createDraftVersion({ formId, schema, metadata }) {
            const data = await preview(`/api/admin/forms/${formId}/versions`, { method: "POST", body: { schema_json: schema, metadata } });
            const id = typeof data.id === "string" ? data.id : "";
            if (!id) throw new Error("form_version");
            return id;
        },
        async publishVersion({ formId, versionId }) {
            await preview(`/api/admin/forms/${formId}/versions/${versionId}/publish`, { method: "POST", body: {} });
        },
        async listLocationLinks() {
            const rows = must(await db.from("form_public_links").select("id, form_definition_id, is_active, expires_at, allowed_embed_origins, metadata, created_at").eq("org_id", ORG));
            return rows as LocationLinkRow[];
        },
        async createLink({ formId, key }) {
            const data = await preview(`/api/admin/forms/${formId}/public-links`, {
                method: "POST",
                body: { location_id: LOCATION, label: `Tours cert ${key}`, metadata: { ...MARK, [TOURS_FIXTURE_ROLE_KEY]: key, [TOURS_FIXTURE_RUN_KEY]: RUN } },
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
