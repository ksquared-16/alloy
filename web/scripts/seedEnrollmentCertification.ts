#!/usr/bin/env npx tsx
/**
 * REAL ENROLLMENT CERTIFICATION FIXTURE — the trusted-runner entry point.
 *
 * The domain logic lives in `lib/certification/enrollmentCertificationFixture.ts`; this file is only
 * the boundary the toolkit runner invokes, matching the shape `alloy-certify-fixture` already knows:
 *
 *   npm run dev:seed:enrollment-certification              # ensure
 *   npm run dev:seed:enrollment-certification -- --verify  # read-only
 *   npm run dev:seed:enrollment-certification -- --remove  # reset, namespace-scoped
 *
 * Credentials are injected by the toolkit into this process only and are never written to the
 * worktree. Nothing here prints a value — names and counts only.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";

import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    ENROLLMENT_CERT_DOMAIN,
    assertNamespaceIsolated,
    ensureEnrollmentCertification,
    verifyEnrollmentCertification,
} from "@/lib/certification/enrollmentCertificationFixture";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * One org, or an explicit one. Guessing between several would let the fixture write into a tenant
 * nobody asked for, so several orgs with no explicit choice is a refusal, not a pick.
 */
async function resolveOrgId(supabase: Supabase): Promise<string> {
    const explicit = process.env.ALLOY_CERT_ORG_ID?.trim();
    if (explicit) return explicit;
    const { data, error } = await supabase.from("orgs").select("id").order("created_at").limit(2);
    if (error) throw new Error(`orgs lookup failed: ${error.message}`);
    if (!data?.length) throw new Error("no orgs in this database");
    if (data.length > 1) throw new Error("several orgs present — pass --org rather than guessing");
    return (data[0] as { id: string }).id;
}

/**
 * Remove ONLY what the reserved namespace reaches, deepest-first.
 *
 * The selector is the e-mail domain and nothing else — never a name, never a date, never "created
 * recently". The certification tenant's real families are not matched, so they cannot be reached.
 */
async function removeFixture(supabase: Supabase, orgId: string): Promise<Record<string, number>> {
    await assertNamespaceIsolated(supabase, orgId);

    // Reach households through the canonical person → customer link; `customers` carries no e-mail.
    const { data: persons } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", `%@${ENROLLMENT_CERT_DOMAIN}`);
    const personIds = ((persons ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (!personIds.length) return { households: 0, children: 0, participations: 0, journeys: 0 };
    const { data: links } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("org_id", orgId)
        .in("person_id", personIds);
    const customerIds = [...new Set(((links ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id))];
    if (!customerIds.length) return { households: 0, children: 0, participations: 0, journeys: 0 };

    const { data: members } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .in("customer_id", customerIds);
    const memberIds = ((members ?? []) as Array<{ id: string }>).map((r) => r.id);

    const counts: Record<string, number> = { households: customerIds.length, children: memberIds.length };

    if (memberIds.length) {
        const { data: journeys } = await supabase
            .from("process_instances")
            .select("id")
            .eq("org_id", orgId)
            .in("subject_id", memberIds);
        counts.journeys = ((journeys ?? []) as Array<{ id: string }>).length;
        await supabase.from("process_instances").delete().eq("org_id", orgId).in("subject_id", memberIds);

        const { data: participations } = await supabase
            .from("opportunity_customer_members")
            .select("id")
            .eq("org_id", orgId)
            .in("customer_member_id", memberIds);
        counts.participations = ((participations ?? []) as Array<{ id: string }>).length;
        await supabase
            .from("opportunity_customer_members")
            .delete()
            .eq("org_id", orgId)
            .in("customer_member_id", memberIds);

        await supabase.from("customer_members").delete().eq("org_id", orgId).in("id", memberIds);
    }

    await supabase.from("customers").delete().eq("org_id", orgId).in("id", customerIds);
    return counts;
}

/** An actual member of this org to attribute the fixture's writes to. */
async function resolveActorUserId(supabase: Supabase, orgId: string): Promise<string | null> {
    const explicit = process.env.ALLOY_CERT_ACTOR_USER_ID?.trim();
    if (explicit) return explicit;
    const { data } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("org_id", orgId)
        .in("role", ["owner", "admin"])
        .limit(1);
    const row = ((data ?? []) as Array<{ user_id?: string }>)[0];
    return (row?.user_id ?? "").trim() || null;
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const wantsVerify = argv.includes("--verify");
    const wantsRemove = argv.includes("--remove");

    const supabase = createAdminClient();
    const orgId = await resolveOrgId(supabase);

    if (wantsVerify) {
        const result = await verifyEnrollmentCertification(supabase, orgId);
        console.log(JSON.stringify({ operation: "verify", ...result }, null, 2));
        process.exit(result.ok ? 0 : 1);
    }

    if (wantsRemove) {
        const counts = await removeFixture(supabase, orgId);
        console.log(JSON.stringify({ operation: "reset", orgId, removed: counts }, null, 2));
        return;
    }

    /*
     * A REAL actor, resolved from the org's own membership — never a literal.
     * `ALLOY_CERT_ACTOR_USER_ID` overrides; otherwise the first admin/owner in this org is used,
     * because the audit trail should name someone who genuinely holds the org.
     */
    const actorUserId = await resolveActorUserId(supabase, orgId);
    const result = await ensureEnrollmentCertification(supabase, orgId, { actorUserId });
    console.log(JSON.stringify({ operation: "ensure", ...result }, null, 2));
    if (!result.ok) process.exit(1);
}

main().catch((error) => {
    console.error(`enrollment certification fixture failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
});
