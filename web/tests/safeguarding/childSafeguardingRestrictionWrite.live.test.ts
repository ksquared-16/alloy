/**
 * The safeguarding restriction WRITER, certified end to end against the real SQL authority.
 *
 * The published `pickup_authorized` contract was correct and operationally incomplete at once:
 * Alloy could evaluate restrictions but nothing could create one, so an operator holding a court
 * order had no way to make Alloy act on it. This suite proves the new writer produces exactly the
 * canonical state the EXISTING pickup reader already consults — no pickup logic was changed to
 * accommodate it.
 *
 * The chain under test is deliberately the whole one:
 *
 *   addChildSafeguardingRestriction  ->  child_safeguarding_restrictions  ->  GET /api/v1/relationships
 *
 * The final read is the public route over HTTP with a real token, not the SQL function directly,
 * because the question is what a partner sees.
 *
 * Skips without a certification environment and a running server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential } from "@/lib/platform/principal/applicationCredential";
import {
    addChildSafeguardingRestriction,
    endChildSafeguardingRestriction,
    listChildSafeguardingRestrictions,
} from "@/lib/safeguarding/childSafeguardingRestrictionService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const APP_URL = (process.env.CERT_APP_URL ?? "http://127.0.0.1:3018").replace(/\/+$/, "");
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ff";
const run = Date.now();

const today = () => new Date().toISOString().slice(0, 10);
const shiftDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Rel = { person_id: string; pickup_authorized: boolean } & Record<string, unknown>;

describeLive("Safeguarding restriction write capability", () => {
    let supabase: SupabaseClient;
    const cleanup: { table: string; ids: string[] }[] = [];
    let siteId = "";
    let childId = "";
    let personId = "";
    let customerId = "";
    let relationshipId = "";
    let actorUserId = "";
    let clientId = "";
    let clientSecret = "";
    let applicationId = "";
    let installationId = "";

    async function bearer(): Promise<string> {
        const res = await fetch(`${APP_URL}/api/v1/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
        });
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token, `token exchange (status ${res.status})`).toBeTruthy();
        return body.access_token!;
    }

    /** What a partner sees for this child right now. */
    async function publicRelationships(): Promise<{ rows: Rel[]; raw: string }> {
        const res = await fetch(`${APP_URL}/api/v1/relationships?child_id=${childId}`, {
            headers: { authorization: `Bearer ${await bearer()}` },
        });
        const raw = await res.text();
        expect(res.status, raw.slice(0, 300)).toBe(200);
        return { rows: (JSON.parse(raw) as { data: Rel[] }).data, raw };
    }

    async function nextNumber(table: string, column: string): Promise<number> {
        const { data } = await supabase.from(table).select(column).eq("org_id", ORG)
            .order(column, { ascending: false }).limit(1).maybeSingle();
        return Number((data as Record<string, number> | null)?.[column] ?? 0) + 1;
    }

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });

        // An actor to attribute the writes to. Provenance is part of what is being certified, so a
        // real auth user is used rather than a fabricated uuid the FK would reject.
        const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        actorUserId = users?.users?.[0]?.id ?? "";
        expect(actorUserId, "a certification auth user must exist").toBeTruthy();

        const site = await supabase.from("locations").insert({
            org_id: ORG, location_number: await nextNumber("locations", "location_number"),
            label: `SG-site-${run}`, location_type: "site", is_active: true,
        }).select("id").single();
        expect(site.error, `site: ${site.error?.message}`).toBeNull();
        siteId = (site.data as { id: string }).id;
        cleanup.push({ table: "locations", ids: [siteId] });

        const cust = await supabase.from("customers").insert({
            org_id: ORG, name: `SG-household-${run}`, customer_number: await nextNumber("customers", "customer_number"),
        }).select("id").single();
        expect(cust.error, `customer: ${cust.error?.message}`).toBeNull();
        customerId = (cust.data as { id: string }).id;

        const member = await supabase.from("customer_members").insert({
            org_id: ORG, customer_id: customerId, display_name: `SG child ${run}`, is_active: true,
        }).select("id").single();
        expect(member.error, `member: ${member.error?.message}`).toBeNull();
        childId = (member.data as { id: string }).id;

        const person = await supabase.from("persons").insert({
            org_id: ORG, person_number: await nextNumber("persons", "person_number"),
            first_name: "Sg", last_name: `Guardian${run}`,
        }).select("id").single();
        expect(person.error, `person: ${person.error?.message}`).toBeNull();
        personId = (person.data as { id: string }).id;

        // Enrollment is what makes the child externally visible at all.
        await supabase.from("child_enrollment_agreements").insert({
            org_id: ORG, customer_member_id: childId, site_location_id: siteId, status: "active",
        });

        const rel = await supabase.from("person_child_relationships").insert({
            org_id: ORG, customer_id: customerId, customer_member_id: childId,
            person_id: personId, status: "active", relationship_type: "parent",
        }).select("id").single();
        expect(rel.error, `relationship: ${rel.error?.message}`).toBeNull();
        relationshipId = (rel.data as { id: string }).id;

        // The grant whose effective answer the restriction must override.
        await supabase.from("person_child_relationship_roles").insert({
            org_id: ORG, relationship_id: relationshipId, role_key: "authorized_pickup", is_active: true,
        });

        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `sg-write-cert-${run}`, p_name: `Safeguarding write cert ${run}`,
            p_publisher: "alloy-certification", p_ownership_mode: "alloy_managed",
            p_environment: "sandbox", p_distribution_mode: "private", p_status: "active",
            p_registered_by: "safeguarding-write-cert", p_metadata: {},
        });
        applicationId = (registered.data as { application: { id: string } }).application.id;
        const inst = await supabase.from("app_installations").insert({
            application_id: applicationId, org_id: ORG, producer_key: `sg-write:${run}`,
            granted_scopes: ["children.read", "relationships.read"],
            boundary_mode: "org_wide", location_boundary: [], status: "active",
        }).select("id").single();
        installationId = (inst.data as { id: string }).id;
        const issued = await issueCredential(supabase, { installationId, label: `sg write ${run}` });
        expect(issued.ok).toBe(true);
        if (!issued.ok) throw new Error("credential issue failed");
        clientId = issued.issued.clientId;
        clientSecret = issued.issued.clientSecret;
    }, 180_000);

    afterAll(async () => {
        if (!supabase) return;
        await supabase.from("child_safeguarding_restrictions").delete().eq("customer_member_id", childId);
        await supabase.from("person_child_relationship_roles").delete().eq("relationship_id", relationshipId);
        await supabase.from("person_child_relationships").delete().eq("customer_member_id", childId);
        await supabase.from("child_enrollment_agreements").delete().eq("customer_member_id", childId);
        await supabase.from("customer_members").delete().eq("id", childId);
        await supabase.from("customers").delete().eq("id", customerId);
        await supabase.from("persons").delete().eq("id", personId);
        await supabase.from("app_installations").delete().eq("id", installationId);
        await supabase.from("developer_applications").delete().eq("id", applicationId);
        for (const c of cleanup) await supabase.from(c.table).delete().in("id", c.ids);
    }, 120_000);

    it("CASE 1 — a pickup grant with no restriction reads true", async () => {
        const { rows } = await publicRelationships();
        expect(rows).toHaveLength(1);
        expect(rows[0].pickup_authorized).toBe(true);
    });

    it("CASE 2 — an added restriction overrides the grant to false", async () => {
        const added = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "protective_or_restraining_order",
            operationalEffect: "may_not_pick_up",
            affectedPersonId: personId,
            evidenceBasis: "operator_entry",
        });
        expect(added.ok, added.ok ? "" : added.error).toBe(true);
        if (!added.ok) return;

        // The writer must produce the state the EXISTING reader consults — active AND approved.
        expect(added.value.status).toBe("active");
        expect(added.value.review_state).toBe("approved");

        const { rows } = await publicRelationships();
        expect(rows).toHaveLength(1);
        expect(rows[0].pickup_authorized, "the restriction must override the grant").toBe(false);
    });

    it("CASE 3 — the false answer leaks nothing about why", async () => {
        const { rows, raw } = await publicRelationships();
        expect(rows.length, "a vacuous payload would prove nothing").toBeGreaterThan(0);
        const lower = raw.toLowerCase();
        for (const term of [
            "safeguard", "restriction", "restricted", "may_not_pick_up", "protective",
            "restraining", "custody", "court", "evidence", "operator_entry", "review",
            "reason", "note", actorUserId.toLowerCase(),
        ]) {
            expect(lower.includes(term), `public payload must not contain "${term}"`).toBe(false);
        }
        // The effective answer is all a partner gets, and it is still there.
        expect(Object.keys(rows[0])).toContain("pickup_authorized");
    });

    it("CASE 4 — ending the restriction restores the grant to true", async () => {
        const listed = await listChildSafeguardingRestrictions(supabase, ORG, childId);
        expect(listed.ok).toBe(true);
        if (!listed.ok) return;
        const active = listed.value.find((r) => r.status === "active");
        expect(active, "the restriction from CASE 2 must be present").toBeTruthy();

        const ended = await endChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, restrictionId: String(active!.id),
        });
        expect(ended.ok, ended.ok ? "" : ended.error).toBe(true);
        if (!ended.ok) return;
        expect(ended.value.status).toBe("revoked");

        const { rows } = await publicRelationships();
        expect(rows[0].pickup_authorized, "the underlying grant still stands").toBe(true);
    });

    it("the ended restriction is RETAINED, with who ended it", async () => {
        const { data } = await supabase
            .from("child_safeguarding_restrictions")
            .select("id, status, updated_by, created_by, reviewed_by, reviewed_at, effective_to")
            .eq("customer_member_id", childId).eq("status", "revoked").maybeSingle();
        expect(data, "revoking must never delete the row").toBeTruthy();
        const row = data as Record<string, unknown>;
        expect(row.updated_by, "who lifted it").toBe(actorUserId);
        expect(row.created_by, "who recorded it").toBe(actorUserId);
        expect(row.reviewed_by, "the operator act IS the review, and it is recorded").toBe(actorUserId);
        expect(row.reviewed_at).toBeTruthy();
        expect(row.effective_to).toBe(today());
    });

    it("a future-dated restriction is not yet in force", async () => {
        const added = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "custody_restriction", operationalEffect: "may_not_pick_up",
            affectedPersonId: personId, evidenceBasis: "operator_entry",
            effectiveFrom: shiftDays(7),
        });
        expect(added.ok).toBe(true);
        if (!added.ok) return;

        const { rows } = await publicRelationships();
        expect(rows[0].pickup_authorized, "a restriction that starts next week does not bar today").toBe(true);

        await endChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, restrictionId: String(added.value.id), endedOn: shiftDays(8),
        });
    });

    it("a FUTURE restriction can still be lifted before it takes effect", async () => {
        // Hosted certification found this refused outright: the default end (today) fell before
        // `effective_from`, and `effective_to >= effective_from` is a database constraint. A court
        // order withdrawn before it takes effect is ordinary, so the window clamps forward instead.
        const added = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "protective_or_restraining_order", operationalEffect: "may_not_pick_up",
            affectedPersonId: personId, evidenceBasis: "operator_entry",
            effectiveFrom: shiftDays(7),
        });
        expect(added.ok, added.ok ? "" : added.error).toBe(true);
        if (!added.ok) return;

        const ended = await endChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, restrictionId: String(added.value.id),
        });
        expect(ended.ok, ended.ok ? "" : ended.error).toBe(true);
        if (!ended.ok) return;
        expect(ended.value.status).toBe("revoked");
        // Clamped forward so the row stays constraint-valid and never comes into force.
        expect(ended.value.effective_to).toBe(shiftDays(7));
        expect((await publicRelationships()).rows[0].pickup_authorized).toBe(true);
    });

    it("a restriction naming no person does not bar a specific adult by itself", async () => {
        const added = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "custody_restriction", operationalEffect: "informational_only",
            affectedPartyDescription: "A custody arrangement is in place",
            evidenceBasis: "parent_declaration",
        });
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        expect(added.value.affected_person_id).toBeNull();

        const { rows } = await publicRelationships();
        expect(rows[0].pickup_authorized, "informational_only never removes collection authority").toBe(true);
        await endChildSafeguardingRestriction(supabase, { orgId: ORG, actorUserId, restrictionId: String(added.value.id) });
    });

    it("refuses a child in another tenant as NOT FOUND, never as forbidden", async () => {
        const result = await addChildSafeguardingRestriction(supabase, {
            orgId: OTHER_ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "custody_restriction", operationalEffect: "may_not_pick_up",
            evidenceBasis: "operator_entry",
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        // Confirming an id exists elsewhere is itself a cross-tenant disclosure.
        expect(result.code).toBe("child_not_found");
    });

    it("refuses an affected person from another tenant", async () => {
        const { data: foreign } = await supabase.from("persons").select("id").neq("org_id", ORG).limit(1).maybeSingle();
        if (!foreign) return; // no foreign person in this stack; nothing to prove
        const result = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "custody_restriction", operationalEffect: "may_not_pick_up",
            affectedPersonId: (foreign as { id: string }).id, evidenceBasis: "operator_entry",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("affected_person_not_found");
    });

    it("refuses a document basis with no document", async () => {
        const result = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "protective_or_restraining_order", operationalEffect: "may_not_pick_up",
            evidenceBasis: "document",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("evidence_document_required");
    });

    it("refuses an unknown effect rather than storing it", async () => {
        const result = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "custody_restriction",
            operationalEffect: "prohibited_pickup" as never,
            evidenceBasis: "operator_entry",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("invalid_operational_effect");
    });

    it("ending an already-ended restriction converges instead of conflicting", async () => {
        const added = await addChildSafeguardingRestriction(supabase, {
            orgId: ORG, actorUserId, childCustomerMemberId: childId,
            restrictionKind: "custody_restriction", operationalEffect: "may_not_pick_up",
            affectedPersonId: personId, evidenceBasis: "operator_entry",
        });
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        const id = String(added.value.id);
        const first = await endChildSafeguardingRestriction(supabase, { orgId: ORG, actorUserId, restrictionId: id });
        const second = await endChildSafeguardingRestriction(supabase, { orgId: ORG, actorUserId, restrictionId: id });
        expect(first.ok).toBe(true);
        expect(second.ok, "a retry an operator could not confirm must converge").toBe(true);
        if (second.ok) expect(second.value.status).toBe("revoked");
    });

    it("never returns review_note to any caller of the service", async () => {
        const listed = await listChildSafeguardingRestrictions(supabase, ORG, childId);
        expect(listed.ok).toBe(true);
        if (!listed.ok) return;
        expect(listed.value.length).toBeGreaterThan(0);
        for (const row of listed.value) expect(Object.keys(row)).not.toContain("review_note");
    });
});
