/**
 * The public attendance fact contract.
 *
 * Two things are being protected here, and they are different in kind.
 *
 * The first is an EXCLUSION list. `child_attendance_events` carries an operator's free-text note, a
 * named actor, an absence reason that can say `illness`, and uncontracted metadata. None of that is
 * a decision anyone made to publish, and the representation is built from an explicit allow-list so
 * that adding a column to the table can never add a field to the API.
 *
 * The second is the CHECKPOINT. Attendance is the first resource whose facts arrive out of order
 * with respect to the days they describe — a correction to last Tuesday is recorded today — so the
 * field the feed advances on is the only thing standing between a consumer and silently missing it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    ATTENDANCE_EVENT_COLUMNS,
    toPublicAttendanceEvent,
    type CanonicalAttendanceEventRow,
} from "@/lib/platform/external/resources/attendanceEventResource";
import { PUBLIC_OPERATIONS, PUBLIC_SCOPES, scopeForOperation } from "@/lib/platform/external/scopeCatalog";
import { presentScope } from "@/lib/platform/external/scopePresentation";

const WEB = resolve(__dirname, "../../..");
const ROUTE_FILE = resolve(WEB, "app/api/v1/attendance-events/route.ts");

/** A canonical row with every field populated, including the ones that must not be published. */
const ROW = {
    id: "11111111-1111-4111-8111-111111111111",
    customer_member_id: "22222222-2222-4222-8222-222222222222",
    site_location_id: "33333333-3333-4333-8333-333333333333",
    room_location_id: "44444444-4444-4444-8444-444444444444",
    from_room_location_id: null,
    to_room_location_id: null,
    event_kind: "check_in",
    entry_type: "original",
    corrects_event_id: null,
    event_at: "2026-03-02T08:15:00.000Z",
    service_date: "2026-03-02",
    actor_type: "staff",
    source_type: "integration_api",
    created_at: "2026-03-02T08:15:04.000Z",
} satisfies CanonicalAttendanceEventRow;

describe("the representation publishes an allow-list, not a row", () => {
    const published = toPublicAttendanceEvent(ROW, "provider-child-7");

    it("carries what a partner needs to reconcile a day", () => {
        expect(published).toEqual({
            id: ROW.id,
            child_id: ROW.customer_member_id,
            child_external_id: "provider-child-7",
            site_id: ROW.site_location_id,
            room_id: ROW.room_location_id,
            from_room_id: null,
            to_room_id: null,
            event_kind: "check_in",
            entry_type: "original",
            corrects_event_id: null,
            event_at: ROW.event_at,
            service_date: ROW.service_date,
            actor_type: "staff",
            source: "integration_api",
            recorded_at: ROW.created_at,
        });
    });

    it("never names a person, only the kind of actor", () => {
        const serialized = JSON.stringify(published);
        for (const forbidden of ["actor_user_id", "actor_person_id", "actor_label", "created_by"]) {
            expect(serialized, forbidden).not.toContain(forbidden);
        }
        expect(published.actor_type).toBe("staff");
    });

    it("does not select the columns it must not publish", () => {
        /*
         * The exclusion is enforced at the SELECT, not after it. A field that is never read cannot
         * be leaked by a later change to the serializer, and a note about a child is the field most
         * likely to contain something nobody decided to publish.
         */
        for (const forbidden of [
            "note",          // free text authored about a child
            "reason_key",    // closed vocabulary, but it contains `illness`
            "metadata",      // uncontracted
            "actor_label",   // a named human
            "actor_user_id",
            "actor_person_id",
            "created_by",
            "source_key",    // internal transport identity
            "enrollment_agreement_id",
            "org_id",        // determined by the installation; publishing it implies it is selectable
        ]) {
            expect(ATTENDANCE_EVENT_COLUMNS, forbidden).not.toContain(forbidden);
        }
    });

    it("an unmapped child simply has no external id", () => {
        expect(toPublicAttendanceEvent(ROW, null).child_external_id).toBeNull();
    });

    it("corrections and reversals are visible as facts in their own right", () => {
        const correction = toPublicAttendanceEvent(
            { ...ROW, entry_type: "correction", corrects_event_id: ROW.id },
            null,
        );
        expect(correction.entry_type).toBe("correction");
        expect(correction.corrects_event_id).toBe(ROW.id);
    });
});

describe("the checkpoint advances on the recording time", () => {
    it("recorded_at comes from created_at, not event_at", () => {
        /*
         * THE DEFECT THIS PREVENTS. A correction to last Tuesday is recorded today. If the feed
         * ordered and watermarked on `event_at`, that correction would be filed behind a watermark
         * the consumer passed a week ago and would never be delivered — the consumer would hold a
         * fact Alloy had already retracted, with no way to discover it.
         */
        const lateCorrection = toPublicAttendanceEvent(
            {
                ...ROW,
                entry_type: "correction",
                corrects_event_id: ROW.id,
                event_at: "2026-02-24T08:15:00.000Z",
                service_date: "2026-02-24",
                created_at: "2026-03-02T09:00:00.000Z",
            },
            null,
        );
        expect(lateCorrection.event_at < lateCorrection.recorded_at).toBe(true);
        expect(lateCorrection.recorded_at).toBe("2026-03-02T09:00:00.000Z");
    });

    it("the route orders and watermarks on the same field it publishes as recorded_at", () => {
        const route = readFileSync(ROUTE_FILE, "utf8");
        expect(route).toContain('.order("created_at", { ascending: true })');
        expect(route).toContain('.order("id", { ascending: true })');
        expect(route).toContain('query.gt("created_at", watermark.since)');
        // Never the physical time.
        expect(route).not.toContain('.order("event_at"');
        expect(route).not.toContain('gt("event_at"');
    });
});

describe("the boundary and the scope", () => {
    it("the operation requires a read scope of its own", () => {
        expect(scopeForOperation("listAttendanceEvents")).toBe("attendance.read");
        expect(PUBLIC_OPERATIONS.listAttendanceEvents.route).toBe("/api/v1/attendance-events");
    });

    it("the read scope does not imply, and is not implied by, the write scope", () => {
        // The catalog forbids hierarchy by construction; this is the attendance instance of it.
        expect(PUBLIC_SCOPES["attendance.read"].access).toBe("read");
        expect(PUBLIC_SCOPES["attendance.write"].access).toBe("write");
        expect(PUBLIC_SCOPES["attendance.read"]).not.toHaveProperty("internalPermissionKeys");
    });

    it("an operator can read what the read scope grants", () => {
        const presented = presentScope("attendance.read");
        expect(presented.title).toBeTruthy();
        expect(presented.detail).toMatch(/read only/i);
        expect(presented.access).toBe("read");
    });

    it("the route resolves its sites from the same authority Locations uses", () => {
        const route = readFileSync(ROUTE_FILE, "utf8");
        expect(route).toContain("resolveBoundarySites");
        // The boundary is a column predicate on the query, never a filter applied to returned rows.
        expect(route).toContain('.in("site_location_id", authorizedSites)');
        expect(route).toContain('.eq("org_id", ctx.organizationId)');
        // A caller-named site intersects the authorized set rather than replacing it.
        expect(route).toContain("sites.siteIds.filter(");
    });
});
