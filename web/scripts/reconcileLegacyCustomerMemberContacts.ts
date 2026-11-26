#!/usr/bin/env npx tsx
/**
 * Dry-run reconciliation: customer_member_contacts → person_child_relationships.
 * Usage: npx tsx web/scripts/reconcileLegacyCustomerMemberContacts.ts [--org=<uuid>] [--apply]
 */

import { createClient } from "@supabase/supabase-js";
import { projectLegacyCustomerMemberContactsToRelationshipInstances } from "../lib/fields/personChildRelationship/personChildRelationshipLegacyReadAdapter";

const apply = process.argv.includes("--apply");
const orgArg = process.argv.find((a) => a.startsWith("--org="));
const orgFilter = orgArg?.slice("--org=".length);

async function main() {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
        process.exit(1);
    }
    const supabase = createClient(url, key);

    let q = supabase
        .from("customer_member_contacts")
        .select("id, org_id, customer_id, customer_member_id, contact_id, role_key, is_active, contacts(person_id)")
        .eq("is_active", true);
    if (orgFilter) q = q.eq("org_id", orgFilter);
    const { data, error } = await q;
    if (error) throw error;

    const counts = {
        deterministic: 0,
        inferred: 0,
        ambiguous_person: 0,
        ambiguous_child: 0,
        already_canonical: 0,
    };

    const byMember = new Map<string, typeof data>();
    for (const row of data ?? []) {
        const memberId = String(row.customer_member_id);
        const list = byMember.get(memberId) ?? [];
        list.push(row);
        byMember.set(memberId, list);
    }

    for (const [memberId, rows] of byMember.entries()) {
        const orgId = String(rows[0]?.org_id ?? "");
        const customerId = String(rows[0]?.customer_id ?? "");
        const personsById = new Map<string, Record<string, unknown>>();
        for (const row of rows) {
            const contacts = row.contacts as { person_id?: string } | { person_id?: string }[] | null;
            const contact = Array.isArray(contacts) ? contacts[0] : contacts;
            const personId = contact?.person_id?.trim();
            if (!personId) {
                counts.ambiguous_person += 1;
                continue;
            }
            personsById.set(personId, { id: personId });
        }
        const projected = projectLegacyCustomerMemberContactsToRelationshipInstances({
            orgId,
            customerId,
            customerMemberId: memberId,
            rows: rows.map((r) => {
                const contacts = r.contacts as { person_id?: string } | { person_id?: string }[] | null;
                const contact = Array.isArray(contacts) ? contacts[0] : contacts;
                return {
                    id: String(r.id),
                    org_id: orgId,
                    customer_id: customerId,
                    customer_member_id: memberId,
                    contact_id: String(r.contact_id),
                    role_key: String(r.role_key),
                    is_active: r.is_active !== false,
                    person_id: contact?.person_id ?? null,
                };
            }),
            personsById,
        });
        if (projected.classification === "incompatible") counts.ambiguous_person += rows.length;
        else if (projected.classification === "inferred") counts.inferred += projected.items.length;
        else counts.deterministic += projected.items.length;

        const { data: existing } = await supabase
            .from("person_child_relationships")
            .select("id")
            .eq("org_id", orgId)
            .eq("customer_member_id", memberId);
        if ((existing ?? []).length > 0) counts.already_canonical += (existing ?? []).length;
    }

    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", counts, row_count: data?.length ?? 0 }, null, 2));
    if (apply) {
        console.warn("--apply not implemented in this sprint; dry-run only");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
