/**
 * The step-16 checks after the import (briefing §5.6 item 5). Reads only. Each check prints PASS or FAIL; any FAIL
 * fails step 16 (briefing §7, "If step 16 fails its checks").
 *
 *   config_present      re-planning the reviewed file against the org finds every item present and equal, and
 *                       every lane work unit the export names exists, active, in the department
 *   baseline_counts     every record/transaction table, every binding table, and every other table the step-9
 *                       baseline names outside the import's write set, holds exactly its baseline count
 *   census_write_set    with the census taken after step 16 (`emit-sql census`, the step-9 command again): every
 *                       table whose count moved is in the import's write set. This is the check that also sees a
 *                       table that was empty at step 9, which the per-table counts above cannot name
 *   orgs                the org, plus retired `_w17_selftest_` orgs, and nothing else; no ZZ Alloy QA fixture org,
 *                       no reviewed retired staging org (Alloy Bend); no `f17e0000-…` seed id in any org or written row
 *   memberships         the org has exactly one membership: the named admin's `admin` row
 *   auth_users          Auth holds exactly that one user
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { SEED_ID_PREFIX, TABLE_CLASSES } from "./allowlist";
import type { ExportFile } from "./exportFile";
import { planImport } from "./importer";

export type CheckResult = { check: string; pass: boolean; detail: string };

export type TenancyPolicy = {
    qaFixtureOrgIds: string[];
    stagingRetiredOrgIds: string[];
};

/** `rows:<table>|<count>` lines of the step-9 census (`release check-production --stage schema --census`). */
export function parseBaselineCounts(text: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const line of text.split("\n")) {
        const m = /^rows:([a-z0-9_]+)\|(\d+)$/.exec(line.trim());
        if (m) out.set(m[1], Number(m[2]));
    }
    return out;
}

async function countRows(supabase: SupabaseClient, table: string): Promise<number | string> {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) return `unreadable (${error.message || error.code || "error"})`;
    return count ?? 0;
}

async function seedIdCount(supabase: SupabaseClient, table: string): Promise<number | null> {
    const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .gte("id", `${SEED_ID_PREFIX}000000000000`)
        .lte("id", `${SEED_ID_PREFIX}ffffffffffff`);
    return error ? null : (count ?? 0);
}

export async function verifyTenantImport(args: {
    supabase: SupabaseClient;
    orgId: string;
    adminUserId: string;
    file: ExportFile;
    baseline: Map<string, number> | null;
    /** The census after step 16, same command as step 9. */
    after?: Map<string, number> | null;
    policy: TenancyPolicy;
}): Promise<CheckResult[]> {
    const { supabase, orgId, adminUserId, file } = args;
    const results: CheckResult[] = [];
    const add = (check: string, pass: boolean, detail: string) => results.push({ check, pass, detail });

    // config_present
    const steps = await planImport(supabase, orgId, file);
    const notPresent = steps.filter((s) => s.action !== "present");
    add("config_present", notPresent.length === 0, notPresent.length ? notPresent.map((s) => `${s.ref}: ${s.action} (${s.detail})`).join("; ") : `${steps.length} item(s) present and equal`);
    for (const e of file.kinds.enrollment_process ?? []) {
        const { data: dept } = await supabase.from("departments").select("id").eq("org_id", orgId).eq("key", e.department.key).maybeSingle();
        const { data: wus } = dept
            ? await supabase.from("work_units").select("key, is_active").eq("org_id", orgId).eq("department_id", (dept as { id: string }).id)
            : { data: [] };
        const active = new Set(((wus ?? []) as Array<{ key: string; is_active: boolean | null }>).filter((w) => w.is_active !== false).map((w) => w.key));
        const missing = e.derived_work_unit_keys.filter((k) => !active.has(k));
        add(`work_units:${e.department.key}`, missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${e.derived_work_unit_keys.length} lane work unit(s) active`);
    }

    // baseline_counts
    const writes = new Set<string>(TABLE_CLASSES.import_writes);
    const mustHold = new Set<string>([...TABLE_CLASSES.record_or_transaction, ...TABLE_CLASSES.never_transferred_bindings]);
    if (args.baseline) for (const t of args.baseline.keys()) if (!writes.has(t)) mustHold.add(t);
    const changed: string[] = [];
    for (const t of [...mustHold].sort()) {
        const now = await countRows(supabase, t);
        const before = args.baseline?.get(t) ?? 0;
        if (typeof now === "string" || now !== before) changed.push(`${t} ${before} → ${now}`);
    }
    add(
        "baseline_counts",
        changed.length === 0,
        changed.length ? changed.join("; ") : `${mustHold.size} table(s) at their baseline${args.baseline ? "" : " (no baseline file: expected 0)"}`,
    );
    if (args.baseline) {
        const grown: string[] = [];
        for (const t of [...writes].sort()) {
            const now = await countRows(supabase, t);
            const before = args.baseline.get(t) ?? 0;
            if (now !== before) grown.push(`${t} ${before} → ${now}`);
        }
        add("import_write_set", true, grown.join("; ") || "no change");
    }
    if (args.baseline && args.after) {
        const moved = [...new Set([...args.baseline.keys(), ...args.after.keys()])]
            .filter((t) => (args.baseline!.get(t) ?? 0) !== (args.after!.get(t) ?? 0))
            .sort();
        const outside = moved.filter((t) => !writes.has(t));
        add(
            "census_write_set",
            outside.length === 0,
            outside.length
                ? `moved outside the import's write set: ${outside.map((t) => `${t} ${args.baseline!.get(t) ?? 0} → ${args.after!.get(t) ?? 0}`).join("; ")}`
                : `${moved.length} table(s) moved, all in the write set`,
        );
    }

    // orgs
    const { data: orgs, error: orgsErr } = await supabase.from("orgs").select("id, status, name, slug");
    if (orgsErr) add("orgs", false, orgsErr.message);
    else {
        const rows = orgs as Array<{ id: string; status: string; name: string; slug: string | null }>;
        const bad = rows.filter(
            (o) => o.id !== orgId && !(o.status === "retired" && String(o.name).startsWith("_w17_selftest_")),
        );
        const qa = rows.filter((o) => args.policy.qaFixtureOrgIds.includes(o.id) || args.policy.stagingRetiredOrgIds.includes(o.id));
        const seed = rows.filter((o) => o.id.startsWith(SEED_ID_PREFIX));
        const target = rows.find((o) => o.id === orgId);
        const pass = !!target && target.status === "active" && bad.length === 0 && qa.length === 0 && seed.length === 0;
        add("orgs", pass, rows.map((o) => `${o.id}|${o.status}|${o.name}`).sort().join("; ") + (bad.length ? `  UNEXPECTED: ${bad.map((o) => o.name).join(", ")}` : ""));
    }
    const seedRows: string[] = [];
    for (const t of [...writes].sort()) {
        const n = await seedIdCount(supabase, t);
        if (n) seedRows.push(`${t} ${n}`);
    }
    add("no_seed_ids", seedRows.length === 0, seedRows.length ? seedRows.join("; ") : "no f17e0000-… id in any table the import writes");

    // memberships
    const { data: roles, error: rolesErr } = await supabase.from("user_roles").select("user_id, role").eq("org_id", orgId);
    const r = (roles ?? []) as Array<{ user_id: string; role: string }>;
    add("memberships", !rolesErr && r.length === 1 && r[0].user_id === adminUserId && r[0].role === "admin", rolesErr ? rolesErr.message : r.map((x) => `${x.user_id}|${x.role}`).join(", ") || "none");

    // auth_users
    const { data: users, error: usersErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
    const u = users?.users ?? [];
    add("auth_users", !usersErr && u.length === 1 && u[0].id === adminUserId, usersErr ? usersErr.message : `${u.length} user(s): ${u.map((x) => x.id).join(", ")}`);

    return results;
}
