/**
 * THE FAMILY RECORD, AND THE TWO KEYS THAT ALREADY OWNED IT ON PAPER.
 *
 * `crm.customers.read` and `crm.customers.write` have been in the capability catalog since the
 * permission grid, granted to `admin` and `ops` in every organization, and offered in the role
 * editor. `crm.customers.write` was enforced by NOTHING — not one source file named it — and
 * `crm.customers.read` by exactly one, the CRM entity search the Forms cleanup gated.
 *
 * Meanwhile the surface they describe — persons, customers, households, contacts, the links between
 * them — was decided by three different things, none of which is a capability:
 *
 *   - `requireAdminOrOps()`, whose name promises a role check and whose body resolves portal
 *     admission and nothing else;
 *   - `ctx.role !== "admin"`, a role TITLE recorded in no grant table, in nine places;
 *   - nothing at all, on four contact mutations.
 *
 * This is the shape `W-13` removed from the rest of the platform and the shape the Communications
 * and Financials slices each found again: a key that is catalogued, granted and inert, next to the
 * routes it was supposed to govern. An organization could withhold `crm.customers.write` from a role
 * and change nothing about what that role could do to a family's record.
 *
 * READ AND WRITE STAY SEPARATE, because the catalog already says they are and because the product
 * has a real reader: `crm.customers.read` is what the Forms entity search needs, and it must not
 * carry the ability to edit the household it searches.
 *
 * WHAT THIS DOES NOT OWN. A person's profile photo is documents-backed — the GET beside it is
 * already declared `documents.read` — so its mutations take `documents.write` rather than being
 * folded in here because they happen to hang off a person. And the organization's relationship
 * VOCABULARY (`customer-person-role-types`, `person-relationship-type-settings`) is configuration of
 * what a relationship may be, not a change to anyone's record; bundling it here would say that
 * whoever may edit a family may also redefine what families are, which is a different power.
 */
import { NextResponse } from "next/server";

/** Reading family, person, household and contact records. */
export const CRM_CUSTOMERS_READ = "crm.customers.read" as const;
/** Creating and changing them, and the links between them. */
export const CRM_CUSTOMERS_WRITE = "crm.customers.write" as const;

export type CrmPeopleCapability = typeof CRM_CUSTOMERS_READ | typeof CRM_CUSTOMERS_WRITE;

/** Pure: does this resolved context carry the capability? */
export function hasCrmPeopleCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: CrmPeopleCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * Refuse unless the caller holds the capability, naming the key so an operator debugging a denial
 * can see which authority they lack rather than only that they are forbidden.
 *
 * Takes an already-resolved context rather than resolving one, matching
 * `requireSchedulingJobsCapability`: these routes have all established who is calling before they
 * reach this point, and a second resolution would be a second place for the two to disagree.
 */
export function requireCrmPeopleCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: CrmPeopleCapability,
): NextResponse | null {
    if (hasCrmPeopleCapability(ctx, capability)) return null;
    return NextResponse.json({ error: "Forbidden", required_permission: capability }, { status: 403 });
}
