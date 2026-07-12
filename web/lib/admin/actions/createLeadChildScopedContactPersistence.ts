/**
 * Create Lead → child-scoped customer_member_contacts (EB-FW-04).
 *
 * Phase A: default guardian links on all included children.
 * Phase B-ready: pass explicit ChildScopedContactAssignment[] to override/extend defaults.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCanonicalChildScopedRelationships } from "@/lib/admin/actions/createLeadPersonChildRelationshipPersistence";
import type { CreateLeadCommitRecord, CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { includedCommitRecords } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { linkedPersonIdFromCommitRecord } from "@/lib/intake/resolve/applyResolutionToCommitSelection";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function normRoleKey(raw: unknown): string {
    return trim(raw).toLowerCase().replace(/\s+/g, "_");
}

export type ChildScopedContactAssignment = {
    customer_member_id: string;
    person_id: string;
    role_key: string;
    /** Traceability for Phase B explicit per-child assignments. */
    source?: "default_guardian" | "explicit_child" | "role_contact";
};

export type CreateLeadChildMemberRow = {
    customer_member_id: string;
    person_id: string | null;
};

export type CreateLeadGuardianPersonRow = {
    person_id: string;
    is_primary: boolean;
    intake_role?: string | null;
    commit_record?: CreateLeadCommitRecord | null;
};

const PRIMARY_GUARDIAN_ROLE_CANDIDATES = ["guardian", "primary_contact", "parent"] as const;
const SECONDARY_GUARDIAN_ROLE_CANDIDATES = ["secondary_guardian", "secondary", "guardian"] as const;
const EMERGENCY_ROLE_CANDIDATES = ["emergency_contact", "emergency"] as const;
const BILLING_ROLE_CANDIDATES = ["billing_contact", "payer", "billing", "billing_responsible"] as const;

export function pickFirstAvailableMemberContactRoleKey(
    candidates: readonly string[],
    activeRoleKeys: Set<string>,
): string | null {
    for (const key of candidates) {
        if (activeRoleKeys.has(key)) return key;
    }
    return null;
}

export async function loadActiveMemberContactRoleKeys(
    supabase: SupabaseClient,
    orgId: string,
): Promise<Set<string>> {
    const { data, error } = await supabase
        .from("customer_member_contact_roles")
        .select("role_key")
        .eq("org_id", orgId)
        .eq("is_active", true);

    if (error) {
        console.warn("[create_lead_child_scoped_contacts] role_config_load_failed", {
            org_id: orgId,
            message: error.message,
        });
        return new Set(["guardian", "emergency_contact", "billing_contact", "payer"]);
    }

    const keys = new Set(
        (data ?? [])
            .map((row: { role_key?: string | null }) => trim(row.role_key))
            .filter(Boolean),
    );
    if (keys.size === 0) {
        return new Set(["guardian", "emergency_contact", "billing_contact", "payer"]);
    }
    return keys;
}

export function resolveGuardianMemberContactRoleKey(
    isPrimary: boolean,
    activeRoleKeys: Set<string>,
): string {
    const candidates = isPrimary ? PRIMARY_GUARDIAN_ROLE_CANDIDATES : SECONDARY_GUARDIAN_ROLE_CANDIDATES;
    const picked = pickFirstAvailableMemberContactRoleKey(candidates, activeRoleKeys);
    if (picked) return picked;
    if (activeRoleKeys.has("guardian")) return "guardian";
    const first = [...activeRoleKeys][0];
    if (!first) {
        throw new Error(
            "No active customer_member_contact_roles configured for this org. Seed guardian/emergency/billing role keys before creating leads.",
        );
    }
    return first;
}

export function resolveEmergencyMemberContactRoleKey(activeRoleKeys: Set<string>): string | null {
    return pickFirstAvailableMemberContactRoleKey(EMERGENCY_ROLE_CANDIDATES, activeRoleKeys);
}

export function resolveBillingMemberContactRoleKey(activeRoleKeys: Set<string>): string | null {
    return pickFirstAvailableMemberContactRoleKey(BILLING_ROLE_CANDIDATES, activeRoleKeys);
}

export type ParentContactClassification = "guardian" | "emergency" | "billing";

export function classifyParentContactRole(record: Pick<CreateLeadCommitRecord, "role" | "extra_payload_values">): ParentContactClassification {
    const role = normRoleKey(record.role);
    const extraRole = normRoleKey(
        record.extra_payload_values?.contact_role ?? record.extra_payload_values?.role_key,
    );
    if (EMERGENCY_ROLE_CANDIDATES.some((k) => role.includes(k.replace("_contact", "")) || extraRole === k || extraRole.includes("emergency"))) {
        return "emergency";
    }
    if (BILLING_ROLE_CANDIDATES.some((k) => role.includes(k) || extraRole === k || extraRole.includes("billing") || extraRole === "payer")) {
        return "billing";
    }
    return "guardian";
}

/** Phase B extension point: explicit per-child assignments on commit records. */
export function readExplicitChildScopedAssignmentsFromCommit(
    selection: CreateLeadCommitSelection,
): ChildScopedContactAssignment[] {
    const out: ChildScopedContactAssignment[] = [];
    const seen = new Set<string>();

    for (const child of includedCommitRecords(selection).children) {
        const explicitRaw = child.extra_payload_values?.child_scoped_contact_assignments;
        if (!explicitRaw?.trim()) continue;
        try {
            const parsed = JSON.parse(explicitRaw) as Array<{
                customer_member_id?: string;
                person_id?: string;
                role_key?: string;
            }>;
            for (const row of parsed ?? []) {
                const memberId = trim(row.customer_member_id);
                const personId = trim(row.person_id);
                const roleKey = trim(row.role_key);
                if (!memberId || !personId || !roleKey) continue;
                const dedupe = `${memberId}:${personId}:${roleKey}`;
                if (seen.has(dedupe)) continue;
                seen.add(dedupe);
                out.push({
                    customer_member_id: memberId,
                    person_id: personId,
                    role_key: roleKey,
                    source: "explicit_child",
                });
            }
        } catch {
            // Phase B payload invalid — ignore until UI validates
        }
    }
    return out;
}

export function buildDefaultGuardianScopedAssignments(input: {
    childMembers: CreateLeadChildMemberRow[];
    guardians: CreateLeadGuardianPersonRow[];
    activeRoleKeys: Set<string>;
}): ChildScopedContactAssignment[] {
    const out: ChildScopedContactAssignment[] = [];
    const seen = new Set<string>();

    for (const guardian of input.guardians) {
        const record = guardian.commit_record;
        if (record && classifyParentContactRole(record) !== "guardian") continue;
        const roleKey = resolveGuardianMemberContactRoleKey(guardian.is_primary, input.activeRoleKeys);
        for (const child of input.childMembers) {
            const memberId = trim(child.customer_member_id);
            const personId = trim(guardian.person_id);
            if (!memberId || !personId) continue;
            const dedupe = `${memberId}:${personId}:${roleKey}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            out.push({
                customer_member_id: memberId,
                person_id: personId,
                role_key: roleKey,
                source: "default_guardian",
            });
        }
    }
    return out;
}

export function buildRoleContactScopedAssignments(input: {
    childMembers: CreateLeadChildMemberRow[];
    guardians: CreateLeadGuardianPersonRow[];
    activeRoleKeys: Set<string>;
}): ChildScopedContactAssignment[] {
    const out: ChildScopedContactAssignment[] = [];
    const seen = new Set<string>();

    for (const guardian of input.guardians) {
        const record = guardian.commit_record;
        if (!record) continue;
        const classification = classifyParentContactRole(record);
        let roleKey: string | null = null;
        if (classification === "emergency") {
            roleKey = resolveEmergencyMemberContactRoleKey(input.activeRoleKeys);
        } else if (classification === "billing") {
            roleKey = resolveBillingMemberContactRoleKey(input.activeRoleKeys);
        }
        if (!roleKey) continue;

        for (const child of input.childMembers) {
            const memberId = trim(child.customer_member_id);
            const personId = trim(guardian.person_id);
            if (!memberId || !personId) continue;
            const dedupe = `${memberId}:${personId}:${roleKey}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            out.push({
                customer_member_id: memberId,
                person_id: personId,
                role_key: roleKey,
                source: "role_contact",
            });
        }
    }
    return out;
}

export function mergeChildScopedContactAssignments(
    ...groups: ChildScopedContactAssignment[][]
): ChildScopedContactAssignment[] {
    const byKey = new Map<string, ChildScopedContactAssignment>();
    for (const group of groups) {
        for (const row of group) {
            const key = `${row.customer_member_id}:${row.person_id}:${row.role_key}`;
            const existing = byKey.get(key);
            if (!existing || row.source === "explicit_child") {
                byKey.set(key, row);
            }
        }
    }
    return [...byKey.values()];
}

/** Find or create compatibility contacts row linked to canonical person. */
export async function ensureContactForPerson(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        personId: string;
    },
): Promise<string> {
    const { orgId, customerId, personId } = input;

    const { data: linked } = await supabase
        .from("contacts")
        .select("id")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .limit(1)
        .maybeSingle();
    if (linked?.id) return String(linked.id);

    const { data: person, error: personErr } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    if (personErr || !person) {
        throw new Error(personErr?.message ?? "Could not load person for contact link.");
    }

    const p = person as {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
    };

    const insertPayload = {
        org_id: orgId,
        customer_id: customerId,
        person_id: personId,
        first_name: trim(p.first_name) || null,
        last_name: trim(p.last_name) || null,
        email: trim(p.email) || null,
        phone: trim(p.phone) || null,
        status: "active",
        metadata: { source: "create_lead" },
    };

    const { data: created, error: insertErr } = await supabase
        .from("contacts")
        .insert(insertPayload)
        .select("id")
        .single();

    if (insertErr?.code === "23505") {
        const { data: again } = await supabase
            .from("contacts")
            .select("id")
            .eq("org_id", orgId)
            .eq("person_id", personId)
            .limit(1)
            .maybeSingle();
        if (again?.id) return String(again.id);
    }
    if (insertErr || !created) {
        throw new Error(insertErr?.message ?? "Could not create contact for person.");
    }
    return String((created as { id: string }).id);
}

/** Idempotent customer_member_contacts upsert (unique on member + contact + role_key). */
export async function upsertCustomerMemberContactLink(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        customerMemberId: string;
        contactId: string;
        roleKey: string;
    },
): Promise<{ inserted: boolean; skipped_invalid_role: boolean }> {
    const { orgId, customerId, customerMemberId, contactId, roleKey } = input;

    const { data: roleRow, error: roleErr } = await supabase
        .from("customer_member_contact_roles")
        .select("role_key")
        .eq("org_id", orgId)
        .eq("role_key", roleKey)
        .eq("is_active", true)
        .maybeSingle();

    if (roleErr || !roleRow) {
        console.warn("[create_lead_child_scoped_contacts] skipped_invalid_role_key", {
            org_id: orgId,
            role_key: roleKey,
            message: roleErr?.message ?? "role_not_configured",
        });
        return { inserted: false, skipped_invalid_role: true };
    }

    const { data: existing } = await supabase
        .from("customer_member_contacts")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .eq("contact_id", contactId)
        .eq("role_key", roleKey)
        .maybeSingle();

    if (existing?.id) {
        return { inserted: false, skipped_invalid_role: false };
    }

    const { error: insertErr } = await supabase.from("customer_member_contacts").insert({
        org_id: orgId,
        customer_id: customerId,
        customer_member_id: customerMemberId,
        contact_id: contactId,
        role_key: roleKey,
        is_active: true,
    });

    if (insertErr?.code === "23505") {
        return { inserted: false, skipped_invalid_role: false };
    }
    if (insertErr) {
        throw new Error(insertErr.message ?? "Could not create customer_member_contact link.");
    }
    return { inserted: true, skipped_invalid_role: false };
}

export async function applyChildScopedContactAssignments(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        assignments: ChildScopedContactAssignment[];
    },
): Promise<{ links_written: number; links_skipped_invalid_role: number }> {
    const contactIdByPersonId = new Map<string, string>();
    let linksWritten = 0;
    let linksSkippedInvalidRole = 0;

    for (const assignment of input.assignments) {
        const personId = trim(assignment.person_id);
        const memberId = trim(assignment.customer_member_id);
        const roleKey = trim(assignment.role_key);
        if (!personId || !memberId || !roleKey) continue;

        let contactId = contactIdByPersonId.get(personId);
        if (!contactId) {
            contactId = await ensureContactForPerson(supabase, {
                orgId: input.orgId,
                customerId: input.customerId,
                personId,
            });
            contactIdByPersonId.set(personId, contactId);
        }

        const result = await upsertCustomerMemberContactLink(supabase, {
            orgId: input.orgId,
            customerId: input.customerId,
            customerMemberId: memberId,
            contactId,
            roleKey,
        });
        if (result.skipped_invalid_role) {
            linksSkippedInvalidRole += 1;
        } else if (result.inserted) {
            linksWritten += 1;
        }
    }

    return { links_written: linksWritten, links_skipped_invalid_role: linksSkippedInvalidRole };
}

export async function loadCreateLeadChildMemberRows(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
): Promise<CreateLeadChildMemberRow[]> {
    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .select("customer_member_id, customer_members(person_id)")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    if (error) {
        throw new Error(error.message ?? "Could not load inquiry children for scoped contact persistence.");
    }

    const out: CreateLeadChildMemberRow[] = [];
    for (const raw of data ?? []) {
        const row = raw as {
            customer_member_id?: string;
            customer_members?: { person_id?: string | null } | { person_id?: string | null }[] | null;
        };
        const memberId = trim(row.customer_member_id);
        if (!memberId) continue;
        const nested = row.customer_members;
        const personNested = Array.isArray(nested) ? nested[0] : nested;
        out.push({
            customer_member_id: memberId,
            person_id: trim(personNested?.person_id) || null,
        });
    }
    return out;
}

export function buildGuardianRowsFromCommitSelection(input: {
    selection: CreateLeadCommitSelection | null;
    primaryPersonId: string;
}): CreateLeadGuardianPersonRow[] {
    if (!input.selection) {
        return [{ person_id: input.primaryPersonId, is_primary: true, intake_role: "parent" }];
    }

    const { parents } = includedCommitRecords(input.selection);
    const rows: CreateLeadGuardianPersonRow[] = [];
    for (const parent of parents) {
        const linkedPersonId = linkedPersonIdFromCommitRecord(parent);
        const personId = parent.primary ? input.primaryPersonId : linkedPersonId;
        if (!personId) continue;
        rows.push({
            person_id: personId,
            is_primary: parent.primary,
            intake_role: parent.role,
            commit_record: parent,
        });
    }

    if (!rows.some((r) => r.person_id === input.primaryPersonId)) {
        rows.unshift({
            person_id: input.primaryPersonId,
            is_primary: true,
            intake_role: "parent",
        });
    }
    return rows.filter((r) => trim(r.person_id));
}

export async function persistCreateLeadChildScopedContacts(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        opportunityId: string;
        primaryPersonId: string;
        selection?: CreateLeadCommitSelection | null;
        /** Phase B: explicit assignments override defaults for matching keys. */
        explicitAssignments?: ChildScopedContactAssignment[];
    },
): Promise<{ links_written: number; links_skipped_invalid_role: number; assignment_count: number }> {
    const childMembers = await loadCreateLeadChildMemberRows(supabase, input.orgId, input.opportunityId);
    if (childMembers.length === 0) {
        return { links_written: 0, links_skipped_invalid_role: 0, assignment_count: 0 };
    }

    const activeRoleKeys = await loadActiveMemberContactRoleKeys(supabase, input.orgId);
    const guardians = buildGuardianRowsFromCommitSelection({
        selection: input.selection ?? null,
        primaryPersonId: input.primaryPersonId,
    });

    const explicitFromCommit =
        input.selection ? readExplicitChildScopedAssignmentsFromCommit(input.selection) : [];
    const assignments = mergeChildScopedContactAssignments(
        buildDefaultGuardianScopedAssignments({ childMembers, guardians, activeRoleKeys }),
        buildRoleContactScopedAssignments({ childMembers, guardians, activeRoleKeys }),
        explicitFromCommit,
        input.explicitAssignments ?? [],
    );

    const result = await applyCanonicalChildScopedRelationships(supabase, {
        orgId: input.orgId,
        customerId: input.customerId,
        assignments,
    });

    return {
        links_written: result.relationships_written,
        links_skipped_invalid_role: result.skipped,
        assignment_count: assignments.length,
    };
}
