/**
 * The canonical Location, as an external contract.
 *
 * ── A PUBLIC RESOURCE IS NOT A TABLE ROW ──
 *
 * `public.locations` carries thirty columns and most of them have no business
 * leaving Alloy. The dangerous ones are not obscure: `address1`, `city`,
 * `postal_code`, `lat`, `lng`, `access_notes` and `access_code` — the last
 * documented in the schema as "Door/gate code when customer selects code-based
 * access" — describe a FAMILY'S HOME and how to get into it. They live on the
 * same table as a childcare site because the commercial vertical stores service
 * addresses there.
 *
 * This adapter therefore names what goes out, one field at a time, and the SQL
 * behind it never selects the rest. A serializer that starts from the row and
 * removes fields leaks the next column somebody adds; one that starts from
 * nothing and adds fields does not.
 *
 * ── FIELD OWNERSHIP ──
 *
 *   id           locations.id                canonical Alloy identity
 *   type         locations.location_type     site | unit (address is never public)
 *   unit_role    locations.unit_role         topology V1 discriminator, units only
 *   name         locations.label             the operator-facing name
 *   parent_id    locations.parent_location_id structural parent
 *   site_id      public.location_site_id()   the declared site-resolution authority
 *   active       locations.is_active
 *   updated_at   COALESCE(updated_at, created_at) — the resync watermark (Thread 4 §04 L)
 *
 * `timezone` is deliberately absent. The public contract exposed it and the
 * canonical schema has no such column: `locations` carries no timezone, and no
 * migration in the repository creates one. The assumption survived review
 * because the resource had never run against a real database -- the governed
 * apply failed on `column l.timezone does not exist`. A field is published only
 * when canonical Alloy authority backs it, so it is removed rather than sourced
 * from somewhere plausible. If Alloy later gains a canonical location timezone,
 * adding it back is an additive API change.
 *
 * `org_id` is deliberately absent: an installation reads exactly one
 * organization and `GET /api/v1/context` already names it, so repeating it on
 * every row would add no information and would invite a client to treat it as
 * something it could vary.
 */

export type CanonicalLocationRow = {
    id: string;
    location_type: string;
    unit_role: string | null;
    label: string | null;
    parent_location_id: string | null;
    site_id: string | null;
    is_active: boolean;
    sort_key: string;
};

export type PublicLocation = {
    id: string;
    type: "site" | "unit";
    unit_role: "physical_space" | "operational_group" | "shared_space" | null;
    name: string | null;
    parent_id: string | null;
    site_id: string | null;
    active: boolean;
    updated_at: string;
};

/**
 * Topology V1 reads a NULL role on a unit as a legacy classroom, and the
 * migration is explicit that it was never back-filled "to a lie". The public
 * contract keeps that honesty: null means unknown, not a guessed value.
 */
export function toPublicLocation(row: CanonicalLocationRow): PublicLocation {
    return {
        id: row.id,
        type: row.location_type === "site" ? "site" : "unit",
        unit_role: (row.unit_role as PublicLocation["unit_role"]) ?? null,
        name: row.label,
        parent_id: row.parent_location_id,
        site_id: row.site_id,
        active: row.is_active,
        updated_at: row.sort_key,
    };
}
