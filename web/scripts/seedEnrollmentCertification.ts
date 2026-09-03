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
    CERT_FAMILIES,
    ENROLLMENT_CERT_DOMAIN,
    assertNamespaceIsolated,
    removeEnrollmentCertificationFixture,
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
        const counts = await removeEnrollmentCertificationFixture(supabase, orgId);
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
