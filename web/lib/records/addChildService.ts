/**
 * Add Child — the one identity-safe path from "this child belongs to this
 * household" to a canonical Child record.
 *
 * Order is the whole point, and it is the same order Add Staff uses:
 *
 *     resolve household → resolve identity → reuse OR (explicitly) create → member
 *
 * ── ADD CHILD IS NOT CREATE LEAD ──
 *
 * Three different intents, three different commands:
 *
 *     Add Child        establish / link the canonical Child record
 *     Start Enrollment create process participation
 *     Create Lead      acquisition entry for a new prospect family
 *
 * This service writes ONE table: `customer_members`. It creates no Opportunity,
 * no `process_instances` row, no `opportunity_customer_members` bridge and no
 * Work Unit. A child may live in Records with none of those, and fabricating one
 * so that Add Child "works" would make every participation count a lie.
 *
 * ── THE SUBJECT IS THE MEMBER ──
 *
 * `customer_members.id` is the durable child subject; `person_id` is NULLABLE
 * and stays that way. In the certification tenant all ~1500 seeded children have
 * a null person, so forcing a `persons` row just because Records added a child
 * would invent an identity the platform never had. A person is involved only
 * when the operator explicitly reuses one.
 * @see docs/runtime/DURABLE-RECORD-ATTENTION.md
 *
 * ── THE GATE ──
 *
 * The path this replaces (`findOrCreateChildPersonInOrg`) fell back to an
 * org-wide first/last-name `ilike` and returned the first row silently, so two
 * Emma Chens became one child with no operator involved. Nothing in here
 * resolves an ambiguous identity: `resolvePersonCandidates` reports, and a
 * candidate in any match band stops the write until the operator chooses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    resolvePersonCandidates,
    type ResolvedIdentityCandidate,
} from "@/lib/identity/resolveIdentityCandidates";
import { RecordCreationError } from "@/lib/records/recordCreationErrors";

/** Raised when the operator must resolve identity before anything is written. */
export class ChildIdentityChoiceRequiredError extends RecordCreationError {
    readonly candidates: ResolvedIdentityCandidate[];

    constructor(candidates: ResolvedIdentityCandidate[]) {
        super(
            "conflict",
            "This child may already be in Alloy. Select the existing record, or explicitly choose to create a new one.",
            { candidates }
        );
        this.name = "ChildIdentityChoiceRequiredError";
        this.candidates = candidates;
    }
}

export type AddChildInput = {
    orgId: string;
    /** The household this child belongs to. Always explicit — never inferred from a name match. */
    customerId: string;

    /** Operator chose an existing household member. Nothing is created. */
    customerMemberId?: string | null;
    /** Operator chose an existing person identity. A membership is created for it. */
    personId?: string | null;

    /** Identity for the resolver / creation path. Ignored when a choice above is set. */
    firstName?: string | null;
    lastName?: string | null;
    dob?: string | null;

    /** Explicit operator override: create a new child despite candidates. */
    createNewChild?: boolean;
    /** Required with createNewChild when the resolver surfaced candidates. */
    createNewReason?: string | null;
};

export type AddChildIdentityOutcome =
    /** The chosen child was already a member of this household — nothing was written. */
    | "already_in_household"
    /** An existing person identity was reused; a new membership links it here. */
    | "linked_existing_person"
    /** No existing identity was reused; a new member row was created with a null person. */
    | "created_new";

export type AddChildResult = {
    /** The durable child subject. */
    customerMemberId: string;
    /** Null is a valid, canonical answer. */
    personId: string | null;
    customerId: string;
    displayName: string;
    identityOutcome: AddChildIdentityOutcome;
    /** How many rows this call inserted. Zero on the already-a-member path. */
    membersCreated: number;
};

function trimOrNull(value: unknown): string | null {
    const s = value != null ? String(value).trim() : "";
    return s || null;
}

function normalizeDob(value: unknown): string | null {
    const t = (value != null ? String(value) : "").trim().slice(0, 10);
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

type MemberRow = {
    id: string;
    customer_id: string | null;
    person_id: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean | null;
};

const MEMBER_COLUMNS = "id, customer_id, person_id, display_name, first_name, last_name, is_active";

function memberDisplayName(row: MemberRow): string {
    return (
        (row.display_name ?? "").trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Child"
    );
}

/** The household must exist IN THIS ORG. Tenancy is proved here, not assumed from the caller. */
async function requireHousehold(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string
): Promise<void> {
    const { data, error } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", customerId)
        .maybeSingle();
    if (error) throw new RecordCreationError("db_error", error.message);
    if (!data) throw new RecordCreationError("not_found", "Household not found in this organization");
}

async function loadMemberInOrg(
    supabase: SupabaseClient,
    orgId: string,
    memberId: string
): Promise<MemberRow | null> {
    const { data, error } = await supabase
        .from("customer_members")
        .select(MEMBER_COLUMNS)
        .eq("org_id", orgId)
        .eq("id", memberId)
        .maybeSingle();
    if (error) throw new RecordCreationError("db_error", error.message);
    return (data as MemberRow | null) ?? null;
}

/** An active child membership for this person in this household, if one already exists. */
async function findMemberForPerson(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    personId: string
): Promise<MemberRow | null> {
    const { data, error } = await supabase
        .from("customer_members")
        .select(MEMBER_COLUMNS)
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("person_id", personId)
        .eq("relationship", "child")
        .eq("is_active", true)
        .limit(1);
    if (error) throw new RecordCreationError("db_error", error.message);
    const rows = (data ?? []) as MemberRow[];
    return rows[0] ?? null;
}

async function insertChildMember(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        personId: string | null;
        firstName: string | null;
        lastName: string | null;
        dob: string | null;
        displayName: string;
    }
): Promise<MemberRow> {
    const { data, error } = await supabase
        .from("customer_members")
        .insert({
            org_id: input.orgId,
            customer_id: input.customerId,
            person_id: input.personId,
            display_name: input.displayName,
            first_name: input.firstName,
            last_name: input.lastName,
            dob: input.dob,
            relationship: "child",
            is_active: true,
            external_source: "child_add",
            metadata: { source: "child_add" },
        })
        .select(MEMBER_COLUMNS)
        .single();
    if (error || !data) {
        throw new RecordCreationError("db_error", error?.message ?? "Could not create the child record");
    }
    return data as MemberRow;
}

export async function addChild(
    supabase: SupabaseClient,
    input: AddChildInput
): Promise<AddChildResult> {
    const orgId = trimOrNull(input.orgId);
    if (!orgId) throw new RecordCreationError("invalid_input", "orgId is required");
    const customerId = trimOrNull(input.customerId);
    if (!customerId) {
        throw new RecordCreationError("invalid_input", "Select the household this child belongs to");
    }
    await requireHousehold(supabase, orgId, customerId);

    const firstName = trimOrNull(input.firstName);
    const lastName = trimOrNull(input.lastName);
    const dob = normalizeDob(input.dob);

    // ── Operator chose an existing household member. This is not a new record and
    // not a second membership: the relationship they asked for already exists.
    const chosenMemberId = trimOrNull(input.customerMemberId);
    if (chosenMemberId) {
        const member = await loadMemberInOrg(supabase, orgId, chosenMemberId);
        if (!member) {
            throw new RecordCreationError("not_found", "Selected child record not found in this organization");
        }
        if ((member.customer_id ?? "") !== customerId) {
            // Moving a child between households is a different command with
            // different consequences; Add Child will not do it as a side effect.
            throw new RecordCreationError(
                "conflict",
                "That child belongs to a different household. Add Child cannot move a child between households."
            );
        }
        return {
            customerMemberId: member.id,
            personId: member.person_id,
            customerId,
            displayName: memberDisplayName(member),
            identityOutcome: "already_in_household",
            membersCreated: 0,
        };
    }

    // ── Operator chose an existing person identity. Reuse it; never duplicate it.
    const chosenPersonId = trimOrNull(input.personId);
    if (chosenPersonId) {
        const { data: person, error } = await supabase
            .from("persons")
            .select("id, first_name, last_name, date_of_birth")
            .eq("org_id", orgId)
            .eq("id", chosenPersonId)
            .maybeSingle();
        if (error) throw new RecordCreationError("db_error", error.message);
        if (!person) {
            throw new RecordCreationError("not_found", "Selected person not found in this organization");
        }
        const p = person as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            date_of_birth: string | null;
        };

        const existing = await findMemberForPerson(supabase, orgId, customerId, p.id);
        if (existing) {
            return {
                customerMemberId: existing.id,
                personId: existing.person_id,
                customerId,
                displayName: memberDisplayName(existing),
                identityOutcome: "already_in_household",
                membersCreated: 0,
            };
        }

        const first = firstName ?? trimOrNull(p.first_name);
        const last = lastName ?? trimOrNull(p.last_name);
        const created = await insertChildMember(supabase, {
            orgId,
            customerId,
            personId: p.id,
            firstName: first,
            lastName: last,
            dob: dob ?? normalizeDob(p.date_of_birth),
            displayName: [first, last].filter(Boolean).join(" ").trim() || "Child",
        });
        return {
            customerMemberId: created.id,
            personId: created.person_id,
            customerId,
            displayName: memberDisplayName(created),
            identityOutcome: "linked_existing_person",
            membersCreated: 1,
        };
    }

    // ── Create-new. The gate stands here, BEFORE any write.
    if (!firstName || !lastName) {
        throw new RecordCreationError(
            "invalid_input",
            "First and last name are required to add a child"
        );
    }

    const resolution = await resolvePersonCandidates(supabase, orgId, {
        kind: "child",
        subjectRef: "child_add",
        firstName,
        lastName,
        dob,
        householdCustomerId: customerId,
    });

    if (resolution.decision === "operator_choice_required") {
        const override = input.createNewChild === true && Boolean(trimOrNull(input.createNewReason));
        if (!override) {
            // Nothing has been written at this point. The operator resolves, then
            // calls again with a chosen record or an explicit override.
            throw new ChildIdentityChoiceRequiredError(resolution.candidates);
        }
    }

    // No person row. The member IS the child record, and `person_id` stays null
    // until something that actually needs a person creates one.
    const created = await insertChildMember(supabase, {
        orgId,
        customerId,
        personId: null,
        firstName,
        lastName,
        dob,
        displayName: `${firstName} ${lastName}`,
    });

    return {
        customerMemberId: created.id,
        personId: created.person_id,
        customerId,
        displayName: memberDisplayName(created),
        identityOutcome: "created_new",
        membersCreated: 1,
    };
}
