/**
 * THE HOUSEHOLD'S CHILDREN'S RELATIONSHIPS — one bounded read, against the real database.
 *
 * Deployed (Lil' Sunshine ZZQALM234600, staging 8bf1b849): the Registration work view's Household
 * card read the opportunity DRAWER record, which never carried the children's canonical relationship
 * bags, so a pick-up — a child relationship with no household row — counted 0. The drawer record now
 * attaches them through a batched reader. Certified here over rows Postgres holds:
 *
 *   no children · one child · siblings sharing a contact · an inactive relationship · a person
 *   outside the organization · another household's child · a fixed query count · the drawer attach
 *
 * Skipped unless the cert stack is configured (alloy-stack use).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolvePersonChildRelationshipsForMembersFromStore, resolvePersonChildRelationshipsFromStore } from "@/lib/fields/personChildRelationship/personChildRelationshipResolverRegistry";
import { attachDrawerChildRelationships } from "@/lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps";
import { fillEmptyRelationshipTypeFromStatedKinship as applyStatedKinship } from "@/lib/fields/personChildRelationship/personChildRelationshipService";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "9c000000-0000-4000-8000-00000000e007";
const RUN = Date.now();
let db: SupabaseClient;
const ids = { a: "", b: "", ava: "", ben: "", cal: "", other: "", persons: [] as string[] };

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
}
async function person(name: string, orgId = ORG): Promise<string> {
    const [first, ...rest] = name.split(" ");
    const row = (await ok(db.from("persons").insert({ org_id: orgId, first_name: first, last_name: rest.join(" ") || null, phone: "5035550100" }).select("id").single())) as { id: string };
    ids.persons.push(row.id);
    return row.id;
}
async function relate(customerId: string, memberId: string, personId: string, roles: string[], status = "active"): Promise<void> {
    const rel = (await ok(db.from("person_child_relationships").insert({ org_id: ORG, customer_id: customerId, customer_member_id: memberId, person_id: personId, status: "active" }).select("id").single())) as { id: string };
    for (const role_key of roles) await ok(db.from("person_child_relationship_roles").insert({ org_id: ORG, relationship_id: rel.id, role_key }));
    // A removal is a relationship that WAS active and was ended — exactly how the platform does it.
    if (status !== "active") await ok(db.from("person_child_relationships").update({ status }).eq("id", rel.id));
}

/** Count every query a client issues, so "bounded" is a measured claim. */
function counting(client: SupabaseClient): { client: SupabaseClient; count: () => number } {
    let n = 0;
    const wrapped = new Proxy(client, {
        get(target, prop, recv) {
            if (prop === "from") return (...a: unknown[]) => { n += 1; return (target.from as (...x: unknown[]) => unknown)(...a); };
            return Reflect.get(target, prop, recv);
        },
    });
    return { client: wrapped as SupabaseClient, count: () => n };
}

describe.skipIf(!env)("household relationship projection (cert DB)", () => {
    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const a = (await ok(db.from("customers").insert({ org_id: ORG, name: `ZZ Cert Household A ${RUN}` }).select("id").single())) as { id: string };
        const b = (await ok(db.from("customers").insert({ org_id: ORG, name: `ZZ Cert Household B ${RUN}` }).select("id").single())) as { id: string };
        ids.a = a.id; ids.b = b.id;
        const kids = (await ok(db.from("customer_members").insert([
            { org_id: ORG, customer_id: ids.a, display_name: `Ava ${RUN}`, first_name: "Ava", relationship: "child", is_active: true },
            { org_id: ORG, customer_id: ids.a, display_name: `Ben ${RUN}`, first_name: "Ben", relationship: "child", is_active: true },
            { org_id: ORG, customer_id: ids.a, display_name: `Cal ${RUN}`, first_name: "Cal", relationship: "child", is_active: true },
            { org_id: ORG, customer_id: ids.b, display_name: `Other ${RUN}`, first_name: "Other", relationship: "child", is_active: true },
        ]).select("id, first_name"))) as { id: string; first_name: string }[];
        const id = (n: string) => kids.find((k) => k.first_name === n)!.id;
        ids.ava = id("Ava"); ids.ben = id("Ben"); ids.cal = id("Cal"); ids.other = id("Other");

        const dana = await person("Dana Pickup");
        const rose = await person("Rose Grandma");
        const dr = await person("Lee Park");
        const gone = await person("Former Contact");
        const stranger = await person("Stranger Danger");
        // Siblings share Dana (pick-up) and Rose (emergency); Ava alone has a physician.
        await relate(ids.a, ids.ava, dana, ["authorized_pickup"]);
        await relate(ids.a, ids.ben, dana, ["authorized_pickup"]);
        await relate(ids.a, ids.ava, rose, ["emergency_contact"]);
        await relate(ids.a, ids.ben, rose, ["emergency_contact"]);
        await relate(ids.a, ids.ava, dr, ["physician"]);
        // A removed pick-up does not count.
        await relate(ids.a, ids.ben, gone, ["authorized_pickup"], "inactive");
        // Another household's child has its own pick-up, which must never reach household A.
        await relate(ids.b, ids.other, stranger, ["authorized_pickup"]);
    });

    afterAll(async () => {
        if (!db) return;
        for (const c of [ids.a, ids.b].filter(Boolean)) {
            const { data: edges } = await db.from("person_child_relationships").select("id").eq("customer_id", c);
            const edgeIds = ((edges ?? []) as { id: string }[]).map((e) => e.id);
            if (edgeIds.length) await db.from("person_child_relationship_roles").delete().in("relationship_id", edgeIds);
            await db.from("person_child_relationships").delete().eq("customer_id", c);
            await db.from("customer_members").delete().eq("customer_id", c);
            await db.from("customers").delete().eq("id", c);
        }
        if (ids.persons.length) await db.from("persons").delete().in("id", ids.persons);
    });

    it("no children reads nothing; one child equals the per-child resolver exactly", async () => {
        expect((await resolvePersonChildRelationshipsForMembersFromStore({ supabase: db, orgId: ORG, customerId: ids.a, customerMemberIds: [] })).size).toBe(0);
        const batch = await resolvePersonChildRelationshipsForMembersFromStore({ supabase: db, orgId: ORG, customerId: ids.a, customerMemberIds: [ids.ava] });
        const single = await resolvePersonChildRelationshipsFromStore({ supabase: db, orgId: ORG, customerId: ids.a, customerMemberId: ids.ava });
        expect(batch.get(ids.ava)!.items.map((i) => i.id).sort()).toEqual(single.items.map((i) => i.id).sort());
        expect(batch.get(ids.ava)!.items).toHaveLength(3);
    });

    it("siblings keep their own lists; inactive and other-household rows never appear", async () => {
        const r = await resolvePersonChildRelationshipsForMembersFromStore({ supabase: db, orgId: ORG, customerId: ids.a, customerMemberIds: [ids.ava, ids.ben, ids.cal, ids.other] });
        const roles = (m: string) => r.get(m)!.items.map((i) => `${i.person?.full_name}:${[...i.operational_roles].join("+")}`).sort();
        expect(roles(ids.ava)).toEqual(["Dana Pickup:authorized_pickup", "Lee Park:physician", "Rose Grandma:emergency_contact"]);
        expect(roles(ids.ben)).toEqual(["Dana Pickup:authorized_pickup", "Rose Grandma:emergency_contact"]);
        expect(r.get(ids.cal)!.items).toEqual([]);
        // Asked for under household A, household B's child resolves to nothing.
        expect(r.get(ids.other)!.items).toEqual([]);
    });

    it("a person outside the organization is never returned, and the rest of the child's list survives", async () => {
        const foreign = await person("Foreign Org Person", OTHER_ORG);
        // Either the database refuses to relate another organization's person to this child, or the
        // reader drops the row — both are the boundary; which one holds is recorded, never assumed.
        const linked = await relate(ids.a, ids.cal, foreign, ["emergency_contact"]).then(() => true, () => false);
        const r = await resolvePersonChildRelationshipsForMembersFromStore({ supabase: db, orgId: ORG, customerId: ids.a, customerMemberIds: [ids.cal] });
        expect(r.get(ids.cal)!.items).toEqual([]);
        if (linked) expect(r.get(ids.cal)!.status).toBe("missing_person");
    });

    it("reads a fixed number of queries whatever the family size (was five per child)", async () => {
        const one = counting(db);
        await resolvePersonChildRelationshipsForMembersFromStore({ supabase: one.client, orgId: ORG, customerId: ids.a, customerMemberIds: [ids.ava] });
        const three = counting(db);
        await resolvePersonChildRelationshipsForMembersFromStore({ supabase: three.client, orgId: ORG, customerId: ids.a, customerMemberIds: [ids.ava, ids.ben, ids.cal] });
        expect(three.count()).toBe(one.count());
        expect(three.count()).toBeLessThanOrEqual(5);
        // Before: the per-child path, as the entity GET used to call it — one round per child.
        const before = counting(db);
        for (const m of [ids.ava, ids.ben, ids.cal]) await resolvePersonChildRelationshipsFromStore({ supabase: before.client, orgId: ORG, customerId: ids.a, customerMemberId: m });
        const { writeFileSync } = await import("node:fs");
        writeFileSync("/tmp/household-relationship-query-counts.json", JSON.stringify({ batch_one_child: one.count(), batch_three_children: three.count(), per_child_three_children: before.count() }));
        expect(before.count()).toBeGreaterThan(2 * three.count());
    });

    it("the drawer record carries the bags, and the Household card counts Dana once and Rose once", async () => {
        const record: Record<string, unknown> = {
            id: "opp", customer_id: ids.a, org_id: ORG,
            _inquiry_children: [{ id: ids.ava, customer_member_id: ids.ava }, { id: ids.ben, customer_member_id: ids.ben }, { id: ids.cal, customer_member_id: ids.cal }],
            _opportunity_persons: [], _customer_persons: [],
        };
        await attachDrawerChildRelationships(db as never, ORG, record);
        expect((record._person_child_relationships_by_member as unknown[]).length).toBe(3);
        const ctx = { grain: "case", subject: { type: "opportunity", id: "opp", label: "A" }, businessProcess: { key: null, label: null, stageKey: null }, perspective: null, truth: record,
            signals: { work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null }, attention: { needsAttention: false, primaryReason: null, reasonCount: 0 }, tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null }, communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null }, billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null } },
            capabilities: { canMutate: true, maskedChannels: false }, status: "ready" } as unknown as OperationalContext;
        const ev = buildHouseholdCardEvidence(ctx);
        expect(ev.authorizedPickupCount).toBe(1);
        expect(ev.emergencyContactCount).toBe(1);
        expect(ev.otherParentGuardianCount).toBe(0);
        expect(JSON.stringify(ev)).not.toContain("Lee Park");
        expect(JSON.stringify(ev)).not.toContain("Former Contact");
    });

    it("the relationship the family stated reaches an empty edge, matched to the org's own vocabulary only", async () => {
        const kin = await person("Kin Person");
        await relate(ids.a, ids.cal, kin, ["emergency_contact"]);
        const read = async () => ((await ok(db.from("person_child_relationships").select("relationship_type").eq("person_id", kin).single())) as { relationship_type: string | null }).relationship_type;
        await applyStatedKinship(db, ORG, kin, [ids.cal], "Not A Real Relationship");
        expect(await read()).toBeNull();
        await applyStatedKinship(db, ORG, kin, [ids.cal], "Grandparent");
        expect(await read()).toBe("grandparent");
        // An edge that already says something is never overwritten.
        await applyStatedKinship(db, ORG, kin, [ids.cal], "Uncle");
        expect(await read()).toBe("grandparent");
    });

    it("a household with no customer or no children gets an empty list, never an error", async () => {
        const noKids: Record<string, unknown> = { customer_id: ids.a, _inquiry_children: [] };
        await attachDrawerChildRelationships(db as never, ORG, noKids);
        expect(noKids._person_child_relationships_by_member).toEqual([]);
        const noCustomer: Record<string, unknown> = { _inquiry_children: [{ customer_member_id: ids.ava }] };
        await attachDrawerChildRelationships(db as never, ORG, noCustomer);
        expect(noCustomer._person_child_relationships_by_member).toEqual([]);
    });
});
