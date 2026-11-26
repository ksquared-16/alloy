#!/usr/bin/env npx tsx
/**
 * Create one tenant org and assign its first admin — the production-safe operator command (briefing M5, D11,
 * step 16). Run from `web/`:
 *
 *   ALLOY_ENVIRONMENT=production ALLOY_OPERATOR_SERVICE_ROLE_KEY=… \
 *   npm run tenant:create -- --target production --supabase-url https://<ref>.supabase.co --project-ref <ref> \
 *     --name "<org name>" --slug <slug> --industry childcare \
 *     --admin-user-id <auth.users id> --admin-email <that user's email> --log <release-dir>/step16-tenant-create.log
 *
 *   --admin-full-name "<name>"                             set the admin account's name if it has none (see below)
 *   --target local --supabase-url http://127.0.0.1:<port>   the same against a throwaway local stack
 *   --dry-run                                              preflight and plan only; writes nothing
 *
 * It calls the existing org helper, `createOrgAndAssignAdmin` (lib/dev/createOrgAndAssignAdmin.ts, unchanged),
 * directly: one `orgs` row, one `admin` membership through `create_membership_with_access_profile`, the
 * person-child relationship configuration. It never goes through `/api/admin/dev/create-org` or
 * `DEV_TENANT_SPINUP_ENABLED`, seeds no demo data, and imports nothing else under lib/dev. The org id is chosen
 * here, before any write (the helper's optional `org_id`), so the plan, the log and a failure all name it.
 *
 * Refuses, before writing: a target that is not explicit (lib/tenancy/operatorTarget.ts); an org with the same
 * slug or name (case-insensitive) already present; an admin id that is not an Auth user, or whose email is not
 * the one given; an unknown or inactive industry; an admin account with no name when --admin-full-name is not given.
 * Then it prints what it will write and asks the operator to type the slug. Every printed line is appended to --log.
 *
 * Why the name: an admin holds money-capable capabilities, and the database refuses them to a login that cannot be
 * named (`money_capable_grant_requires_named_operator`, 20261122180000): an account name in user metadata
 * (`full_name`, else `name`) or a link to a named Person. A brand-new Auth user has neither, and the refusal would
 * come after the org row was written. So the helper checks first and, with --admin-full-name, sets the account name
 * through the Auth admin API as the first write.
 */

import "@/lib/tenancy/nextRuntimeShim";

import { randomUUID } from "crypto";

import { createOrgAndAssignAdmin } from "@/lib/dev/createOrgAndAssignAdmin";
import { describeOperatorTarget } from "@/lib/tenancy/operatorTarget";
import {
    argFlag,
    argValue,
    confirmByTyping,
    openOperatorLog,
    type OperatorLog,
    operatorClient,
    resolveTargetFromArgs,
} from "@/lib/tenancy/operatorSession";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const log: OperatorLog = openOperatorLog(argv, "tenant:create");
    const target = resolveTargetFromArgs(argv, log);
    const dryRun = argFlag(argv, "dry-run");

    const name = (argValue(argv, "name") ?? "").trim();
    const slug = (argValue(argv, "slug") ?? "").trim();
    const industryKey = (argValue(argv, "industry") ?? "").trim();
    const adminUserId = (argValue(argv, "admin-user-id") ?? "").trim().toLowerCase();
    const adminEmail = (argValue(argv, "admin-email") ?? "").trim().toLowerCase();
    if (!name) log.fail("--name is required", 3);
    if (!SLUG.test(slug)) log.fail("--slug is required: lowercase letters, digits and hyphens", 3);
    if (!industryKey) log.fail("--industry is required (childcare for Firefly)", 3);
    if (!UUID.test(adminUserId)) log.fail("--admin-user-id must be the admin's auth.users id (a uuid)", 3);
    if (!adminEmail.includes("@")) log.fail("--admin-email is required, to cross-check the id", 3);
    const adminFullName = (argValue(argv, "admin-full-name") ?? "").trim();

    const supabase = operatorClient(target);
    log.line(`target: ${describeOperatorTarget(target)}`);

    // ── preflight: reads only ──────────────────────────────────────────────
    const { data: orgs, error: orgsErr } = await supabase.from("orgs").select("id, status, name, slug").order("name");
    if (orgsErr) log.fail(`orgs: ${orgsErr.message}`);
    log.line(`orgs now (${orgs!.length}):`);
    for (const o of orgs!) log.line(`  ${o.id}|${o.status}|${o.name}`);

    const sameSlug = orgs!.filter((o) => String(o.slug ?? "").toLowerCase() === slug);
    if (sameSlug.length) log.fail(`refused (duplicate_slug): org ${sameSlug[0].id} already has slug ${slug}`, 4);
    const { data: sameName, error: nameErr } = await supabase.from("orgs").select("id, name").ilike("name", escapeLike(name));
    if (nameErr) log.fail(`orgs by name: ${nameErr.message}`);
    if (sameName!.length) log.fail(`refused (duplicate_name): org ${sameName![0].id} is already named "${sameName![0].name}"`, 4);

    const { data: industry, error: indErr } = await supabase
        .from("industries")
        .select("id, key")
        .eq("key", industryKey)
        .eq("is_active", true)
        .maybeSingle();
    if (indErr) log.fail(`industries: ${indErr.message}`);
    if (!industry) log.fail(`refused (unknown_industry): no active industry ${industryKey}`, 4);

    const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(adminUserId);
    if (userErr || !userRes?.user) log.fail(`refused (admin_not_found): no Auth user ${adminUserId}${userErr ? ` (${userErr.message})` : ""}`, 4);
    const userEmail = String(userRes!.user.email ?? "").toLowerCase();
    if (userEmail !== adminEmail) log.fail(`refused (admin_email_mismatch): Auth user ${adminUserId} is ${userEmail || "<no email>"}, not ${adminEmail}`, 4);

    const meta = (userRes!.user.user_metadata ?? {}) as Record<string, unknown>;
    const currentName = [meta.full_name, meta.name].map((v) => (typeof v === "string" ? v.trim() : "")).find(Boolean) ?? "";
    if (!currentName && !adminFullName) {
        log.fail("refused (admin_unnamed): the admin account has no name, and an admin's financial access needs one; pass --admin-full-name", 4);
    }
    if (currentName && adminFullName && currentName !== adminFullName) {
        log.fail(`refused (admin_name_mismatch): the account is already named "${currentName}", not "${adminFullName}"`, 4);
    }
    const setName = !currentName;

    const { data: existingRoles, error: rolesErr } = await supabase.from("user_roles").select("org_id, role").eq("user_id", adminUserId);
    if (rolesErr) log.fail(`user_roles: ${rolesErr.message}`);
    log.line(`admin ${adminUserId} (${adminEmail}) holds ${existingRoles!.length} membership(s) today`);

    // ── plan ───────────────────────────────────────────────────────────────
    const orgId = randomUUID();
    log.line("plan:");
    if (setName) log.line(`  set the admin account's name (Auth user_metadata.full_name) to "${adminFullName}"`);
    else log.line(`  the admin account is already named "${currentName}"; Auth is not changed`);
    log.line(`  insert orgs: id ${orgId}, name "${name}", slug ${slug}, status active, industry ${industryKey} (${industry!.id})`);
    log.line(`  insert one admin membership for ${adminUserId} (${adminEmail}) via create_membership_with_access_profile`);
    log.line("  provision the person-child relationship field configuration (sections, option sets, field definitions)");
    log.line("  nothing else: no demo data, no records, no other users");
    if (dryRun) {
        log.line("dry run: nothing was written");
        return;
    }
    await confirmByTyping(log, `Create org "${name}" on ${describeOperatorTarget(target)}?`, slug);

    // ── write ──────────────────────────────────────────────────────────────
    if (setName) {
        const { error: nameErr } = await supabase.auth.admin.updateUserById(adminUserId, {
            user_metadata: { ...meta, full_name: adminFullName },
        });
        if (nameErr) log.fail(`setting the admin account's name failed before any org write: ${nameErr.message}`);
        log.line(`admin account named "${adminFullName}"`);
    }
    const result = await createOrgAndAssignAdmin(supabase, {
        name,
        slug,
        industry_key: industryKey,
        admin_user_id: adminUserId,
        org_id: orgId,
    });
    if (!result.ok) {
        // The helper does not say how far it got; the planned id does.
        const { data: written } = await supabase.from("orgs").select("id").eq("id", orgId).maybeSingle();
        log.fail(
            written
                ? `helper failed after inserting org ${orgId}: ${result.error.replace(/\.+$/, "")}. Remove that org before retrying (briefing §7, step-16 failure).`
                : `helper failed before inserting the org (${orgId} is absent): ${result.error}`,
        );
    }
    log.line(`created org ${result.org_id} slug ${result.slug}`);

    // ── read back ──────────────────────────────────────────────────────────
    const { data: members, error: memErr } = await supabase.from("user_roles").select("user_id, role").eq("org_id", result.org_id);
    if (memErr) log.fail(`read back user_roles: ${memErr.message}`);
    log.line(`memberships in the new org: ${members!.map((m) => `${m.user_id}|${m.role}`).join(", ") || "none"}`);
    if (members!.length !== 1 || members![0].user_id !== adminUserId || members![0].role !== "admin") {
        log.fail("read back: the new org does not hold exactly the named admin's admin membership");
    }
    log.line(`ORG_ID=${result.org_id}`);
    log.line("done");
}

main().catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
