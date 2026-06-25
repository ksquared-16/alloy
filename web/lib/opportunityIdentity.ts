/**
 * Person-first identity for opportunities: primary_person_id is canonical; primary_contact_id is legacy.
 * Centralize fallback and write normalization here — avoid ad hoc contact-as-primary logic elsewhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    CONTACT_COMPAT_SELECT,
    PERSON_CANONICAL_IDENTITY_SELECT,
} from "@/lib/fields/canonicalEntitySelectColumns";
import { stripLegacyTextStatusFromWritePayload } from "@/lib/fields/canonicalLegacyStatusWrite";
import { ensureContactLinkedToPerson } from "@/lib/bookingCustomerPersonLink";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";

const GUARD_TAG = "[OPPORTUNITY_IDENTITY_GUARD]";

export function trimOpportunityUuid(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s || null;
}

export type ResolvedOpportunityIdentityIds = {
    primary_person_id: string | null;
    /** LEGACY: contact-based identity when no person is linked. Do not treat as canonical id. */
    fallback_contact_id: string | null;
};

/**
 * Sync helper: which ids to use for lookups (UI lists, etc.).
 * Full row resolution (person vs contact fallback) belongs in {@link resolveOpportunityPerson}.
 */
export function resolveOpportunityIdentityIds(opportunity: {
    primary_person_id?: unknown;
    primary_contact_id?: unknown;
}): ResolvedOpportunityIdentityIds {
    const primary_person_id = trimOpportunityUuid(opportunity.primary_person_id);
    const primary_contact_id = trimOpportunityUuid(opportunity.primary_contact_id);
    return {
        primary_person_id,
        fallback_contact_id: primary_contact_id,
    };
}

export type ResolvedOpportunityParty =
    | {
          kind: "person";
          primary_person_id: string;
          person: Record<string, unknown> | null;
          fallback_contact_id: string | null;
      }
    | {
          kind: "contact_legacy";
          primary_person_id: null;
          fallback_contact_id: string | null;
          contact: Record<string, unknown> | null;
      };

/**
 * Canonical resolver: person row when possible; else contact fallback (explicitly legacy).
 * Use this instead of branching on primary_contact_id / primary_person_id ad hoc.
 */
export async function resolveOpportunityPerson(
    supabase: SupabaseClient,
    opportunity: { primary_person_id?: unknown; primary_contact_id?: unknown }
): Promise<ResolvedOpportunityParty> {
    const pid = trimOpportunityUuid(opportunity.primary_person_id);
    const cid = trimOpportunityUuid(opportunity.primary_contact_id);
    if (pid) {
        const { data: person } = await supabase.from("persons").select(PERSON_CANONICAL_IDENTITY_SELECT).eq("id", pid).maybeSingle();
        return {
            kind: "person",
            primary_person_id: pid,
            person: (person as Record<string, unknown> | null) ?? null,
            fallback_contact_id: cid,
        };
    }
    if (cid) {
        const { data: contact } = await supabase.from("contacts").select(CONTACT_COMPAT_SELECT).eq("id", cid).maybeSingle();
        const cRow = contact as { person_id?: string | null } | null;
        const linked = trimOpportunityUuid(cRow?.person_id ?? null);
        if (linked) {
            const { data: person } = await supabase.from("persons").select(PERSON_CANONICAL_IDENTITY_SELECT).eq("id", linked).maybeSingle();
            return {
                kind: "person",
                primary_person_id: linked,
                person: (person as Record<string, unknown> | null) ?? null,
                fallback_contact_id: cid,
            };
        }
        return {
            kind: "contact_legacy",
            primary_person_id: null,
            fallback_contact_id: cid,
            contact: (contact as Record<string, unknown> | null) ?? null,
        };
    }
    return {
        kind: "contact_legacy",
        primary_person_id: null,
        fallback_contact_id: null,
        contact: null,
    };
}

export async function resolvePrimaryPersonIdFromContactId(
    supabase: SupabaseClient,
    contactId: string | null | undefined
): Promise<string | null> {
    const cid = trimOpportunityUuid(contactId);
    if (!cid) return null;
    const { data: row } = await supabase.from("contacts").select("person_id").eq("id", cid).maybeSingle();
    return trimOpportunityUuid((row as { person_id?: string | null } | null)?.person_id ?? null);
}

/** Regression guard: contact-only identity writes (non-breaking — log only). */
export function warnOpportunityContactOnlyWrite(context: string, details?: Record<string, unknown>): void {
    console.warn(GUARD_TAG, "contact_id_write_without_resolved_person", { context, ...details });
}

/**
 * Before any `opportunities` insert or update: call this on the row payload (mutates in place).
 * - No-op when `primary_person_id` / `primary_contact_id` are absent (e.g. metadata-only or `location_id`-only patches).
 * - When only `primary_contact_id` is set, resolves `contacts.person_id` and sets `primary_person_id` when found.
 * - When both are set, trimmed `primary_person_id` is canonical (contact is legacy fallback only).
 */
export async function normalizeOpportunityWritePayload(
    supabase: SupabaseClient,
    patch: Record<string, unknown>,
    context: string
): Promise<Record<string, unknown>> {
    const hasPersonKey = Object.prototype.hasOwnProperty.call(patch, "primary_person_id");
    const hasContactKey = Object.prototype.hasOwnProperty.call(patch, "primary_contact_id");
    if (!hasPersonKey && !hasContactKey) {
        return patch;
    }

    let pid = hasPersonKey ? trimOpportunityUuid(patch.primary_person_id) : null;
    const cid = hasContactKey ? trimOpportunityUuid(patch.primary_contact_id) : null;

    if (cid && !pid) {
        warnOpportunityContactOnlyWrite(context, { stage: "attempt_resolve" });
        pid = await resolvePrimaryPersonIdFromContactId(supabase, cid);
        if (pid) {
            patch.primary_person_id = pid;
        } else {
            warnOpportunityContactOnlyWrite(context, { stage: "unresolved", primary_contact_id: cid });
        }
    }

    if (hasPersonKey && trimOpportunityUuid(patch.primary_person_id)) {
        patch.primary_person_id = trimOpportunityUuid(patch.primary_person_id);
    }

    return patch;
}

export type InsertOpportunityPersonFirstInput = {
    vertical_id?: string | null;
    customer_id?: string | null;
    location_id?: string | null;
    primary_contact_id: string;
    primary_person_id?: string | null;
    org_id?: string | null;
    pipeline_stage_id?: string | null;
    pipeline_id?: string | null;
    status_key?: string | null;
    name: string;
    status?: string | null;
    source?: string | null;
    monetary_value_cents?: number | null;
    estimated_price_cents?: number | null;
    metadata?: Record<string, unknown> | null;
    external_source?: string | null;
    external_id?: string | null;
};

/**
 * Ensures primary_person_id (create/link person when needed), then inserts opportunity.
 * Keeps primary_contact_id when provided (legacy column retained).
 */
export async function insertOpportunityWithPersonFirst(
    supabase: SupabaseClient,
    input: InsertOpportunityPersonFirstInput,
    context: string
): Promise<{ id: string; primary_person_id: string }> {
    const contactId = trimOpportunityUuid(input.primary_contact_id);
    if (!contactId) {
        throw new Error("insertOpportunityWithPersonFirst: primary_contact_id required for this helper");
    }

    let personId = trimOpportunityUuid(input.primary_person_id ?? null);
    if (!personId) {
        personId = await resolvePrimaryPersonIdFromContactId(supabase, contactId);
    }

    const { data: contactRow, error: cErr } = await supabase
        .from("contacts")
        .select("id, org_id, person_id, first_name, last_name, email, phone")
        .eq("id", contactId)
        .maybeSingle();
    if (cErr || !contactRow) {
        throw new Error(cErr?.message ?? "Contact not found for opportunity insert");
    }

    const orgId =
        trimOpportunityUuid((contactRow as { org_id?: string | null }).org_id) ??
        trimOpportunityUuid(process.env.ALLOY_PUBLIC_ORG_ID) ??
        null;

    if (!personId) {
        warnOpportunityContactOnlyWrite(context, { stage: "create_person", contactId });
        const c = contactRow as {
            first_name?: string | null;
            last_name?: string | null;
            email?: string | null;
            phone?: string | null;
        };
        const created = await findOrCreatePersonInOrgWithMeta(supabase, {
            email: c.email ?? null,
            phone: c.phone ?? null,
            first_name: c.first_name ?? null,
            last_name: c.last_name ?? null,
            org_id: orgId,
        });
        personId = trimOpportunityUuid(created?.id ?? null);
        if (!personId) {
            warnOpportunityContactOnlyWrite(context, { stage: "person_create_failed_no_org", contactId, orgId });
            throw new Error(
                "Could not resolve or create primary_person_id for opportunity (org may be missing on contact)"
            );
        }
        if (orgId) {
            await ensureContactLinkedToPerson(supabase, { contactId, personId, orgId });
        }
    }

    const resolvedPersonId = trimOpportunityUuid(personId);
    if (!resolvedPersonId) {
        throw new Error("insertOpportunityWithPersonFirst: missing primary_person_id after resolution");
    }

    const raw: Record<string, unknown> = {
        ...input,
        primary_contact_id: contactId,
        primary_person_id: resolvedPersonId,
    };
    await normalizeOpportunityWritePayload(supabase, raw, `${context}:pre-insert`);

    const insertPayload = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;
    stripLegacyTextStatusFromWritePayload(insertPayload);

    const { data, error } = await supabase.from("opportunities").insert(insertPayload).select("id").single();
    if (error || !data) {
        throw new Error(error?.message ?? "Opportunity insert failed");
    }
    return { id: (data as { id: string }).id, primary_person_id: resolvedPersonId };
}

/**
 * Workflow / event payload: canonical top-level identity keys (person-first).
 * Does not remove nested opportunity.*; adds explicit primary_person_id and fallback_contact_id.
 */
export async function attachCanonicalOpportunityIdentityToWorkflowPayload(
    supabase: SupabaseClient,
    payload: Record<string, unknown>
): Promise<void> {
    const opp = payload.opportunity;
    if (opp == null || typeof opp !== "object") return;
    const o = opp as Record<string, unknown>;
    let pid = trimOpportunityUuid(o.primary_person_id);
    const cid = trimOpportunityUuid(o.primary_contact_id);
    if (!pid && cid) {
        pid = await resolvePrimaryPersonIdFromContactId(supabase, cid);
    }
    payload.primary_person_id = pid ?? null;
    payload.fallback_contact_id = cid ?? null;
}
