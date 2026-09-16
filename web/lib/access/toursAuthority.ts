/**
 * TOURS — two powers, because they are two jobs.
 *
 * All nine Tour mutations were reachable through PORTAL ADMISSION ALONE.
 * `requireAdminOrOps()` resolves admission and no role — despite its name — so any principal who
 * could enter the portal could rewrite when tours may be booked, and could confirm, cancel or
 * no-show any family's tour. That was the largest portal-only cluster left in the estate, and it is
 * customer-facing.
 *
 * ── THE SPLIT ──
 *
 * `tours.configure`  WHEN AND WHERE tours may be booked: the availability rules an administrator
 *                    edits at Settings → Tours → Availability. Organization-wide, per location.
 *
 * `tours.book`       ONE FAMILY'S TOUR: create, confirm, cancel, complete, no-show, reschedule —
 *                    operated from the Lead drawer, where the front desk actually works.
 *
 * Neither implies the other, and the asymmetry is the point: a front desk that books tours should
 * not thereby decide the organization's availability, and whoever sets availability need not be
 * trusted to cancel a particular family's tour.
 *
 * ── TWO KEYS THIS DELIBERATELY DOES NOT BORROW ──
 *
 * NOT `scheduling.write`. Tour availability is not ordinary schedule editing: it governs a
 * customer-facing booking window, stored in `tour_availability_rules` with its own location
 * binding, and reached from a Tours settings surface rather than a calendar.
 *
 * NOT `crm.opportunities.write`. The booking lifecycle does touch the Lead —
 * `tourBookingOpportunityIntegration` mirrors booking state onto `opportunities.metadata`,
 * org-scoped and with an undo — but that is the Tour transaction mirroring its OWN state, not an
 * independent Lead edit. The Opportunity census established `crm.opportunities.*` as legacy
 * vocabulary over live runtime, and it must not be published as authority.
 *
 * ── AND ONE IT DOES NOT REQUIRE ──
 *
 * NOT `communications.send`. A booking emits the product's own notification as a named step inside
 * the transaction (`notification_comms`), and the service is explicit that a notification failure
 * must never revoke a booking. Emitting a product-defined notification is not the same power as an
 * operator composing and sending arbitrary communication.
 */
import { NextResponse } from "next/server";

/** Setting when and where tours may be booked. */
export const TOURS_CONFIGURE = "tours.configure" as const;

/** Operating one family's tour through its lifecycle. */
export const TOURS_BOOK = "tours.book" as const;

export type ToursCapability = typeof TOURS_CONFIGURE | typeof TOURS_BOOK;

/** Every Tours authority, as a closed set a lock can read. */
export const TOURS_CAPABILITIES = [TOURS_CONFIGURE, TOURS_BOOK] as const;

/** Pure: does this resolved context carry the Tours authority named? */
export function hasToursCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: ToursCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * Refuse unless the caller holds this Tours authority, naming the key so a denial is debuggable.
 *
 * No role title and no environment flag: a principal is admitted by grant or not at all, and
 * identically in every deployment.
 */
export function requireToursCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: ToursCapability,
): NextResponse | null {
    if (hasToursCapability(ctx, capability)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: capability },
        { status: 403 },
    );
}
