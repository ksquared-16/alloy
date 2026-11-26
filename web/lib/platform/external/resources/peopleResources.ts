/**
 * The public shape of Children, Households and Relationships.
 *
 * ── THE ALLOW-LIST IS THE CONTRACT ──
 *
 * Each mapper names every field it publishes. Nothing is spread from a row, because a spread is
 * how a column added to a domain table six months from now becomes a partner-visible field nobody
 * decided to publish. A new field here is a deliberate line of code.
 *
 * ── WHAT IS STRUCTURALLY ABSENT ──
 *
 * Health and safeguarding never appear, and not because these mappers remove them: neither
 * `customer_members` nor `persons` carries a health, medical, allergy or safeguarding column at
 * all. That data lives in separate tables which the SQL authorities behind these resources do not
 * join. Exclusion is a property of the query, not a discipline someone must remember.
 *
 * Payment instruments are excluded the same way — the Household authority never selects them.
 */

export type PublicChild = {
    id: string;
    external_id: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    date_of_birth: string | null;
    household_id: string | null;
    status: "active" | "inactive";
    status_key: string | null;
};

export type PublicHousehold = {
    id: string;
    name: string | null;
    household_type: string | null;
    status_key: string | null;
};

export type PublicRelationship = {
    id: string;
    child_id: string;
    household_id: string | null;
    person_id: string;
    first_name: string | null;
    last_name: string | null;
    email?: string | null;
    phone?: string | null;
    relationship_type: string | null;
    priority: number | null;
    status: string | null;
    /**
     * EFFECTIVE authority, computed server-side. Never the raw relationship role.
     *
     * True only when a canonical grant exists, no active restriction removes it, and the child is
     * inside the boundary. Anything else is false, including a restriction whose subject cannot be
     * resolved — we cannot prove it does not name this person, so it counts against them.
     *
     * The reason is never published in any form. A partner learns true or false and nothing about
     * why, because "why" is safeguarding information.
     */
    pickup_authorized: boolean;
};

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function toPublicChild(row: Row): PublicChild {
    return {
        id: String(row.id),
        external_id: str(row.external_id),
        first_name: str(row.first_name),
        last_name: str(row.last_name),
        display_name: str(row.display_name),
        date_of_birth: str(row.date_of_birth),
        household_id: str(row.household_id),
        // `is_active` is the lifecycle a partner polls on. Published as a word rather than a
        // boolean so that a future third state does not become a breaking change.
        status: row.is_active === false ? "inactive" : "active",
        status_key: str(row.status_key),
    };
}

export function toPublicHousehold(row: Row): PublicHousehold {
    return {
        id: String(row.id),
        name: str(row.name),
        household_type: str(row.household_type),
        status_key: str(row.status_key),
    };
}

/**
 * The contact columns arrive NULL when the caller lacks `relationships.contact.read`, because the
 * SQL authority gates them. This mapper therefore omits the keys entirely rather than publishing
 * `null`, so a partner can tell "not granted" from "granted but empty".
 */
export function toPublicRelationship(row: Row, includeContact: boolean): PublicRelationship {
    const base: PublicRelationship = {
        id: String(row.id),
        child_id: String(row.child_id),
        household_id: str(row.household_id),
        person_id: String(row.person_id),
        first_name: str(row.first_name),
        last_name: str(row.last_name),
        relationship_type: str(row.relationship_type),
        priority: num(row.priority),
        status: str(row.status),
        pickup_authorized: row.pickup_authorized === true,
    };
    if (!includeContact) return base;
    return { ...base, email: str(row.email), phone: str(row.phone) };
}
