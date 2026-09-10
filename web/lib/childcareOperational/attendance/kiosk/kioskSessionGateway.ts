/**
 * From a typed code and a trusted device to a decided list of children.
 *
 * This is the only place kiosk facts are LOADED. The policy that judges them is
 * pure and lives next door; keeping the reads here means there is one query shape
 * to audit and one place where site scope is applied.
 *
 * ── EVERY BOUNDARY COMES FROM THE DEVICE, NEVER THE REQUEST ──
 *
 * The org and the site are read off the resolved device row. Nothing in a kiosk
 * request can widen them: a manipulated child id simply will not appear in a set
 * that was built by asking "which of this person's children are enrolled at THIS
 * site", and a child at another site is absent rather than refused. Scenario E is
 * closed by construction rather than by a check somebody could forget.
 *
 * ── AN EMPTY ANSWER IS NOT AN ERROR, AND NOT AN EXPLANATION ──
 *
 * A code that resolves to nobody, and a person with no children at this site,
 * both return an empty set. The kiosk says the same thing either way, because
 * saying anything more precise would let the lobby tablet be used to find out who
 * attends the centre.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SafeguardingRestriction } from "@/lib/safeguarding/safeguardingRestriction";
import {
    resolveKioskEligibility,
    type KioskChildFacts,
    type KioskEligibility,
    type KioskOperation,
} from "@/lib/childcareOperational/attendance/kiosk/kioskChildEligibility";
import type { TrustedKioskDevice } from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAuthority";

/** SHA-256 hex of a typed kiosk code; matches `person_kiosk_codes.code_hash`. */
export function hashKioskPersonCode(plaintext: string): string {
    return createHash("sha256").update(String(plaintext).trim().toUpperCase(), "utf8").digest("hex");
}

/** A child the kiosk may show, with the decision already taken. */
export type KioskChildOption = {
    childId: string;
    displayName: string;
    enrollmentAgreementId: string;
    eligibility: KioskEligibility;
};

export type KioskSessionResolution = {
    /** Null when the code matched nothing. Deliberately indistinguishable downstream. */
    personId: string | null;
    children: KioskChildOption[];
};

/**
 * Resolve a typed code to a person WITHIN THE DEVICE'S ORG.
 *
 * The org filter is not decoration: the hash index is unique deployment-wide, so
 * without it a code issued by another tenant would resolve here.
 */
async function resolvePerson(
    supabase: SupabaseClient,
    orgId: string,
    code: string,
): Promise<string | null> {
    const typed = (code ?? "").trim();
    if (!typed) return null;
    const { data, error } = await supabase
        .from("person_kiosk_codes")
        .select("person_id, status")
        .eq("org_id", orgId)
        .eq("code_hash", hashKioskPersonCode(typed))
        .maybeSingle();
    // A failed read resolves to nobody. Nothing is authored on this path, so
    // failing closed costs an adult one retry and risks nothing.
    if (error || !data) return null;
    const row = data as { person_id: string; status: string };
    return row.status === "active" ? row.person_id : null;
}

type RelationshipRow = { id: string; customer_member_id: string };
type RoleRow = { relationship_id: string; role_key: string };
type AgreementRow = { id: string; customer_member_id: string };
type MemberRow = { id: string; first_name: string | null; last_name: string | null; person_id: string | null };

function displayName(m: MemberRow | undefined): string {
    const name = `${m?.first_name ?? ""} ${m?.last_name ?? ""}`.trim();
    return name || "Child";
}

/**
 * The whole kiosk read, in one place.
 *
 * `onDate` is the service date the question is asked for — pickup authority is
 * about today, not about a record.
 */
export async function resolveKioskSession(params: {
    supabase: SupabaseClient;
    device: TrustedKioskDevice;
    code: string;
    operation: KioskOperation;
    onDate: string;
}): Promise<KioskSessionResolution> {
    const { supabase, device, code, operation, onDate } = params;

    const personId = await resolvePerson(supabase, device.orgId, code);
    if (!personId) return { personId: null, children: [] };

    // 1. This person's ACTIVE relationships, which are already child-scoped.
    const { data: relData } = await supabase
        .from("person_child_relationships")
        .select("id, customer_member_id")
        .eq("org_id", device.orgId)
        .eq("person_id", personId)
        .eq("status", "active");
    const relationships = (relData ?? []) as unknown as RelationshipRow[];
    if (relationships.length === 0) return { personId, children: [] };

    // 2. SITE SCOPE, applied as a filter on the set rather than a check afterwards.
    //    A child enrolled elsewhere is simply not in the answer.
    const memberIds = [...new Set(relationships.map((r) => r.customer_member_id))];
    const { data: agrData } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id")
        .eq("org_id", device.orgId)
        .eq("site_location_id", device.siteLocationId)
        .in("customer_member_id", memberIds);
    const agreements = (agrData ?? []) as unknown as AgreementRow[];
    if (agreements.length === 0) return { personId, children: [] };

    const agreementByChild = new Map(agreements.map((a) => [a.customer_member_id, a.id]));
    const scopedChildIds = [...agreementByChild.keys()];

    // 3. Roles per relationship — the capacity, per child.
    const { data: roleData } = await supabase
        .from("person_child_relationship_roles")
        .select("relationship_id, role_key")
        .eq("org_id", device.orgId)
        .eq("is_active", true)
        .in(
            "relationship_id",
            relationships.filter((r) => agreementByChild.has(r.customer_member_id)).map((r) => r.id),
        );
    const rolesByRelationship = new Map<string, string[]>();
    for (const row of (roleData ?? []) as unknown as RoleRow[]) {
        const list = rolesByRelationship.get(row.relationship_id) ?? [];
        list.push(row.role_key);
        rolesByRelationship.set(row.relationship_id, list);
    }

    // 4. Safeguarding: every restriction on these children, UNFILTERED. The
    //    resolver needs to see proposed, expired and revoked rows to tell
    //    "nothing recorded" from "something recorded that is not in force".
    const { data: restrictionData } = await supabase
        .from("child_safeguarding_restrictions")
        .select(
            "id, customer_member_id, affected_person_id, affected_party_description, restriction_kind," +
                " operational_effect, status, effective_from, effective_to, evidence_basis," +
                " evidence_document_id, source, review_state, supersedes_id",
        )
        .eq("org_id", device.orgId)
        .in("customer_member_id", scopedChildIds);
    const restrictionsByChild = new Map<string, SafeguardingRestriction[]>();
    for (const r of (restrictionData ?? []) as unknown as SafeguardingRestriction[]) {
        const list = restrictionsByChild.get(r.customer_member_id) ?? [];
        list.push(r);
        restrictionsByChild.set(r.customer_member_id, list);
    }

    // 5. Was the question ever asked for this child?
    const { data: screenData } = await supabase
        .from("child_safeguarding_screenings")
        .select("customer_member_id")
        .eq("org_id", device.orgId)
        .in("customer_member_id", scopedChildIds);
    const screened = new Set(
        ((screenData ?? []) as unknown as { customer_member_id: string }[]).map((s) => s.customer_member_id),
    );

    const { data: memberData } = await supabase
        .from("customer_members")
        .select("id, first_name, last_name, person_id")
        .eq("org_id", device.orgId)
        .in("id", scopedChildIds);
    const memberById = new Map(
        ((memberData ?? []) as unknown as MemberRow[]).map((m) => [m.id, m]),
    );

    const relationshipByChild = new Map(relationships.map((r) => [r.customer_member_id, r.id]));
    const facts: KioskChildFacts[] = scopedChildIds.map((childId) => ({
        childId,
        activeRoleKeys: rolesByRelationship.get(relationshipByChild.get(childId) ?? "") ?? [],
        restrictions: restrictionsByChild.get(childId) ?? [],
        safeguardingScreened: screened.has(childId),
    }));

    const decisions = resolveKioskEligibility({ operation, personId, children: facts, onDate });
    const byChild = new Map(decisions.map((d) => [d.childId, d]));

    return {
        personId,
        children: scopedChildIds.map((childId) => ({
            childId,
            displayName: displayName(memberById.get(childId)),
            enrollmentAgreementId: agreementByChild.get(childId) as string,
            eligibility: byChild.get(childId) as KioskEligibility,
        })),
    };
}
