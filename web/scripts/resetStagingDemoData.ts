#!/usr/bin/env npx tsx
/**
 * Staging-only wipe for demo / realistic childcare seed rows.
 *
 * Default: dry-run (counts only). Actual deletion requires `--execute` plus env gates.
 *
 * Env:
 *   DEMO_RESET_ORG_ID (required)
 *   DEMO_RESET_CONFIRM=RESET_STAGING_DEMO_DATA (required when --execute)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Refuses when VERCEL_ENV=production.
 *
 * Does not touch auth, orgs, org config, role_definitions, status_definitions, field_definitions, etc.
 * Deletes org-scoped operational rows tagged by demo metadata and/or FK-linked to those opportunities.
 *
 * @see web/scripts/lib/stagingDemoMarkers.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    LEGACY_DEMO_SEED_PACKAGES,
    STAGING_DEMO_SEED_SOURCE,
} from "./lib/stagingDemoMarkers";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const RESET_CONFIRM_VALUE = "RESET_STAGING_DEMO_DATA";

function errMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
        return (err as { message: string }).message;
    }
    return String(err);
}

function errCode(err: unknown): string | undefined {
    if (err && typeof err === "object" && "code" in err) {
        const c = (err as { code: unknown }).code;
        return typeof c === "string" ? c : undefined;
    }
    return undefined;
}

/** True when the client likely cannot reach Supabase (vs schema/RLS/column issues). */
function isConnectivityFailure(err: unknown): boolean {
    const msg = errMessage(err).toLowerCase();
    const code = errCode(err);
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return true;
    if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("econnrefused")) return true;
    return false;
}

function logOptionalSkip(table: string, operation: string, column: string | undefined, err: unknown): void {
    const col = column ? ` column=${column}` : "";
    console.warn(`[optional skip] table=${table} op=${operation}${col} — ${errMessage(err)} (code=${errCode(err) ?? "n/a"})`);
}

/**
 * Optional / supporting tables: count or delete failures are logged and treated as 0 rows.
 * Core tables (opportunities discovery, org env gates) still throw on error except connectivity is detected first.
 */
async function optionalCount(table: string, operation: string, column: string | undefined, fn: () => Promise<number>): Promise<number> {
    try {
        return await fn();
    } catch (err) {
        logOptionalSkip(table, operation, column, err);
        return 0;
    }
}

async function optionalDelete(table: string, operation: string, column: string | undefined, fn: () => Promise<number>): Promise<number> {
    try {
        return await fn();
    } catch (err) {
        logOptionalSkip(table, operation, column, err);
        return 0;
    }
}

/** PostgREST `.or()` filter: demo packages, staging reset marker, or known seed_key prefixes. */
function demoMetadataOrFilter(): string {
    const pkgOrs = LEGACY_DEMO_SEED_PACKAGES.map((p) => `metadata->>demo_seed_package.eq.${p}`).join(",");
    return [
        pkgOrs,
        `metadata->>seed_source.eq.${STAGING_DEMO_SEED_SOURCE}`,
        "metadata->>seed_key.like.childcare_realistic%",
        "metadata->>seed_key.like.enroll_demo%",
        "metadata->>seed_key.like.dept_seed*",
    ].join(",");
}

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        console.error(`Missing required env: ${name}`);
        process.exit(1);
    }
    return v;
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function selectIdsInChunks(
    supabase: SupabaseAdmin,
    table: string,
    orgId: string,
    orFilter: string,
    idColumn = "id"
): Promise<string[]> {
    const all: string[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const q = supabase
            .from(table)
            .select(idColumn)
            .eq("org_id", orgId)
            .or(orFilter)
            .order(idColumn, { ascending: true })
            .range(from, from + pageSize - 1);
        const { data, error } = await q;
        if (error) {
            if (isConnectivityFailure(error)) {
                console.error(`Cannot reach Supabase while querying ${table}: ${errMessage(error)}`);
                process.exit(1);
            }
            throw new Error(`[${table} select] ${error.message}`);
        }
        const rows = (data ?? []) as unknown as Array<Record<string, string | undefined>>;
        for (const r of rows) {
            const id = r[idColumn];
            if (id) all.push(id);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return all;
}

/** Demo opportunity ids — soft-fail (warn + []) on schema/RLS errors so dry-run can finish. */
async function selectDemoOpportunityIds(supabase: SupabaseAdmin, orgId: string, orDemo: string): Promise<string[]> {
    try {
        return await selectIdsInChunks(supabase, "opportunities", orgId, orDemo);
    } catch (err) {
        if (isConnectivityFailure(err)) {
            console.error(`Cannot reach Supabase while listing opportunities: ${errMessage(err)}`);
            process.exit(1);
        }
        logOptionalSkip("opportunities", "select demo opportunity ids", undefined, err);
        return [];
    }
}

async function countRows(supabase: SupabaseAdmin, table: string, orgId: string, orFilter: string | null): Promise<number> {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if (orFilter) q = q.or(orFilter);
    const { count, error } = await q;
    if (error) throw new Error(`[${table} count] ${error.message}`);
    return count ?? 0;
}

async function countQuotesDemoScope(supabase: SupabaseAdmin, orgId: string, oppIds: string[], orDemo: string): Promise<number> {
    return optionalCount("quotes", "count demo scope", undefined, async () => {
        const ids = new Set<string>();
        for (const part of chunk(oppIds, 200)) {
            const { data, error } = await supabase.from("quotes").select("id").eq("org_id", orgId).in("opportunity_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        }
        const { data: metaRows, error: mErr } = await supabase.from("quotes").select("id").eq("org_id", orgId).or(orDemo);
        if (mErr) throw mErr;
        for (const r of metaRows ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
        return ids.size;
    });
}

async function countCustomerMembersDemoScope(
    supabase: SupabaseAdmin,
    orgId: string,
    customerIds: string[],
    orDemo: string
): Promise<number> {
    return optionalCount("customer_members", "count demo scope", undefined, async () => {
        const ids = new Set<string>();
        for (const part of chunk(customerIds, 200)) {
            const { data, error } = await supabase.from("customer_members").select("id").eq("org_id", orgId).in("customer_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        }
        const { data: metaRows, error: mErr } = await supabase.from("customer_members").select("id").eq("org_id", orgId).or(orDemo);
        if (mErr) throw mErr;
        for (const r of metaRows ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
        return ids.size;
    });
}

async function countCustomerPersonsDemoScope(
    supabase: SupabaseAdmin,
    orgId: string,
    customerIds: string[],
    orDemo: string
): Promise<number> {
    return optionalCount("customer_persons", "count demo scope", undefined, async () => {
        const ids = new Set<string>();
        for (const part of chunk(customerIds, 200)) {
            const { data, error } = await supabase.from("customer_persons").select("id").eq("org_id", orgId).in("customer_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        }
        const { data: metaRows, error: mErr } = await supabase.from("customer_persons").select("id").eq("org_id", orgId).or(orDemo);
        if (mErr) throw mErr;
        for (const r of metaRows ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
        return ids.size;
    });
}

async function collectCustomerMemberIds(
    supabase: SupabaseAdmin,
    orgId: string,
    customerIds: string[]
): Promise<string[]> {
    const ids = new Set<string>();
    for (const part of chunk(customerIds, 200)) {
        try {
            const { data, error } = await supabase.from("customer_members").select("id").eq("org_id", orgId).in("customer_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        } catch (err) {
            if (isConnectivityFailure(err)) {
                console.error(`Cannot reach Supabase while listing customer_members: ${errMessage(err)}`);
                process.exit(1);
            }
            logOptionalSkip("customer_members", "select id by customer_id", "customer_id", err);
        }
    }
    return [...ids];
}

async function collectScheduleIdsForJobs(supabase: SupabaseAdmin, orgId: string, jobIds: string[]): Promise<string[]> {
    const ids = new Set<string>();
    for (const part of chunk(jobIds, 200)) {
        try {
            const { data, error } = await supabase.from("schedules").select("id").eq("org_id", orgId).in("job_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        } catch (err) {
            if (isConnectivityFailure(err)) {
                console.error(`Cannot reach Supabase while listing schedules: ${errMessage(err)}`);
                process.exit(1);
            }
            logOptionalSkip("schedules", "select id by job_id", "job_id", err);
        }
    }
    return [...ids];
}

async function selectDemoPersonIds(supabase: SupabaseAdmin, orgId: string, orDemo: string): Promise<string[]> {
    try {
        return await selectIdsInChunks(supabase, "persons", orgId, orDemo);
    } catch (err) {
        if (isConnectivityFailure(err)) {
            console.error(`Cannot reach Supabase while listing demo persons: ${errMessage(err)}`);
            process.exit(1);
        }
        logOptionalSkip("persons", "select demo person ids", undefined, err);
        return [];
    }
}

async function countPersonRelationshipsForPersons(
    supabase: SupabaseAdmin,
    orgId: string,
    personIds: string[]
): Promise<number> {
    return optionalCount("person_relationships", "count demo scope", undefined, async () => {
        if (!personIds.length) return 0;
        const ids = new Set<string>();
        for (const part of chunk(personIds, 150)) {
            const { data: fromRows, error: e1 } = await supabase
                .from("person_relationships")
                .select("id")
                .eq("org_id", orgId)
                .in("from_person_id", part);
            if (e1) throw e1;
            for (const r of fromRows ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
            const { data: toRows, error: e2 } = await supabase
                .from("person_relationships")
                .select("id")
                .eq("org_id", orgId)
                .in("to_person_id", part);
            if (e2) throw e2;
            for (const r of toRows ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        }
        return ids.size;
    });
}

async function countCustomerMemberContactsScope(
    supabase: SupabaseAdmin,
    orgId: string,
    customerIds: string[],
    memberIds: string[]
): Promise<number> {
    return optionalCount("customer_member_contacts", "count demo scope", undefined, async () => {
        const ids = new Set<string>();
        for (const part of chunk(memberIds, 200)) {
            const { data, error } = await supabase.from("customer_member_contacts").select("id").eq("org_id", orgId).in("customer_member_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        }
        for (const part of chunk(customerIds, 200)) {
            const { data, error } = await supabase.from("customer_member_contacts").select("id").eq("org_id", orgId).in("customer_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        }
        return ids.size;
    });
}

async function countPersonLocationsDemoScope(
    supabase: SupabaseAdmin,
    orgId: string,
    orDemo: string,
    personIds: string[]
): Promise<number> {
    return optionalCount("person_locations", "count demo scope", undefined, async () => {
        const ids = new Set<string>();
        const { data: metaRows, error: mErr } = await supabase.from("person_locations").select("id").eq("org_id", orgId).or(orDemo);
        if (mErr) throw mErr;
        for (const r of metaRows ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
        for (const part of chunk(personIds, 200)) {
            const { data, error } = await supabase.from("person_locations").select("id").eq("org_id", orgId).in("person_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        }
        return ids.size;
    });
}

/**
 * Count rows matching `column IN ids` (and optional `org_id`).
 * Uses `select('*')` so composite tables without an `id` column (e.g. `opportunity_tags`) still count.
 */
async function countByIn(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    orgId?: string
): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    for (const part of chunk(ids, 200)) {
        let q = supabase.from(table).select("*", { count: "exact", head: true }).in(column, part);
        if (orgId) q = q.eq("org_id", orgId);
        const { count, error } = await q;
        if (error) throw new Error(`[${table} count ${column}] ${error.message}`);
        total += count ?? 0;
    }
    return total;
}

/** For tables without `org_id` (e.g. `customer_tags`). */
async function countByInNoOrg(supabase: SupabaseAdmin, table: string, column: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    for (const part of chunk(ids, 200)) {
        const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).in(column, part);
        if (error) throw new Error(`[${table} count ${column}] ${error.message}`);
        total += count ?? 0;
    }
    return total;
}

async function deleteByOr(
    supabase: SupabaseAdmin,
    table: string,
    orgId: string,
    orFilter: string
): Promise<number> {
    const { data, error } = await supabase.from(table).delete().eq("org_id", orgId).or(orFilter).select("id");
    if (error) throw new Error(`[${table} delete or] ${error.message}`);
    return (data ?? []).length;
}

async function selectDemoLocationRows(
    supabase: SupabaseAdmin,
    orgId: string,
    orDemo: string
): Promise<Array<{ id: string; parent_location_id: string | null }>> {
    try {
        const out: Array<{ id: string; parent_location_id: string | null }> = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
            const { data, error } = await supabase
                .from("locations")
                .select("id,parent_location_id")
                .eq("org_id", orgId)
                .or(orDemo)
                .order("id", { ascending: true })
                .range(from, from + pageSize - 1);
            if (error) throw error;
            for (const r of data ?? []) {
                const row = r as { id: string; parent_location_id: string | null };
                out.push({ id: row.id, parent_location_id: row.parent_location_id ?? null });
            }
            if (!data?.length || data.length < pageSize) break;
        }
        return out;
    } catch (err) {
        if (isConnectivityFailure(err)) {
            console.error(`Cannot reach Supabase while listing demo locations: ${errMessage(err)}`);
            process.exit(1);
        }
        logOptionalSkip("locations", "select demo rows", undefined, err);
        return [];
    }
}

/** Delete demo-tagged locations leaf-first (rooms before parent sites). */
async function deleteDemoLocations(supabase: SupabaseAdmin, orgId: string, orDemo: string, execute: boolean): Promise<number> {
    const rows = await selectDemoLocationRows(supabase, orgId, orDemo);
    if (!execute) return rows.length;
    const idSet = new Set(rows.map((r) => r.id));
    let deleted = 0;
    while (idSet.size > 0) {
        const leaves: string[] = [];
        for (const id of idSet) {
            const hasChildInSet = [...idSet].some((other) => {
                const row = rows.find((r) => r.id === other);
                return row?.parent_location_id === id;
            });
            if (!hasChildInSet) leaves.push(id);
        }
        if (!leaves.length) {
            throw new Error("locations: could not resolve delete order (cycle in parent_location_id among demo rows)");
        }
        for (const part of chunk(leaves, 200)) {
            deleted += await optionalDelete("locations", "delete", "id", () =>
                deleteByInColumn(supabase, "locations", "id", part, orgId)
            );
            for (const id of part) idSet.delete(id);
        }
    }
    return deleted;
}

async function deleteByInColumn(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    orgId?: string,
    /** Composite tables may lack `id`; use `*` so PostgREST returns deleted rows for counting. */
    selectShape: "*" | "id" = "id"
): Promise<number> {
    if (!ids.length) return 0;
    let n = 0;
    for (const part of chunk(ids, 200)) {
        let q = supabase.from(table).delete().in(column, part).select(selectShape);
        if (orgId) q = q.eq("org_id", orgId);
        const { data, error } = await q;
        if (error) throw new Error(`[${table} delete ${column}] ${error.message}`);
        n += (data ?? []).length;
    }
    return n;
}

async function deleteByInColumnNoOrg(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    selectShape: "*" | "id" = "*"
): Promise<number> {
    if (!ids.length) return 0;
    let n = 0;
    for (const part of chunk(ids, 200)) {
        const { data, error } = await supabase.from(table).delete().in(column, part).select(selectShape);
        if (error) throw new Error(`[${table} delete ${column}] ${error.message}`);
        n += (data ?? []).length;
    }
    return n;
}

async function deleteOppJoins(supabase: SupabaseAdmin, orgId: string, oppIds: string[], execute: boolean): Promise<number> {
    if (!oppIds.length) return 0;
    if (!execute) {
        return optionalCount("opportunity_customer_members", "count", "opportunity_id", () =>
            countByIn(supabase, "opportunity_customer_members", "opportunity_id", oppIds, orgId)
        );
    }
    return optionalDelete("opportunity_customer_members", "delete", "opportunity_id", () =>
        deleteByInColumn(supabase, "opportunity_customer_members", "opportunity_id", oppIds, orgId)
    );
}

async function deleteOpportunityPersons(supabase: SupabaseAdmin, orgId: string, oppIds: string[], execute: boolean): Promise<number> {
    if (!oppIds.length) return 0;
    if (!execute) {
        return optionalCount("opportunity_persons", "count", "opportunity_id", () =>
            countByIn(supabase, "opportunity_persons", "opportunity_id", oppIds, orgId)
        );
    }
    return optionalDelete("opportunity_persons", "delete", "opportunity_id", () =>
        deleteByInColumn(supabase, "opportunity_persons", "opportunity_id", oppIds, orgId)
    );
}

async function deleteOpportunityTags(supabase: SupabaseAdmin, oppIds: string[], execute: boolean): Promise<number> {
    if (!oppIds.length) return 0;
    if (!execute) {
        return optionalCount("opportunity_tags", "count", "opportunity_id", () =>
            countByIn(supabase, "opportunity_tags", "opportunity_id", oppIds)
        );
    }
    return optionalDelete("opportunity_tags", "delete", "opportunity_id", () =>
        deleteByInColumn(supabase, "opportunity_tags", "opportunity_id", oppIds, undefined, "*")
    );
}

async function collectJobIdsForDemo(supabase: SupabaseAdmin, orgId: string, oppIds: string[]): Promise<string[]> {
    const ids = new Set<string>();
    for (const part of chunk(oppIds, 200)) {
        try {
            const { data, error } = await supabase.from("jobs").select("id").eq("org_id", orgId).in("opportunity_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) ids.add(id);
            }
        } catch (err) {
            if (isConnectivityFailure(err)) {
                console.error(`Cannot reach Supabase while listing jobs: ${errMessage(err)}`);
                process.exit(1);
            }
            logOptionalSkip("jobs", "select by opportunity_id", "opportunity_id", err);
        }
    }
    try {
        const { data: metaJobs, error: mjErr } = await supabase.from("jobs").select("id").eq("org_id", orgId).or(demoMetadataOrFilter());
        if (mjErr) throw mjErr;
        for (const r of metaJobs ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
    } catch (err) {
        if (isConnectivityFailure(err)) {
            console.error(`Cannot reach Supabase while listing demo-tagged jobs: ${errMessage(err)}`);
            process.exit(1);
        }
        logOptionalSkip("jobs", "select demo metadata", undefined, err);
    }
    return [...ids];
}

async function collectWorkflowRunIds(
    supabase: SupabaseAdmin,
    orgId: string,
    entityIds: string[]
): Promise<{ runIds: string[]; eventIds: string[] }> {
    if (!entityIds.length) return { runIds: [], eventIds: [] };
    const eventIds = new Set<string>();
    for (const part of chunk(entityIds, 150)) {
        try {
            const { data, error } = await supabase
                .from("workflow_events")
                .select("id")
                .eq("org_id", orgId)
                .in("entity_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) eventIds.add(id);
            }
        } catch (err) {
            if (isConnectivityFailure(err)) {
                console.error(`Cannot reach Supabase while listing workflow_events: ${errMessage(err)}`);
                process.exit(1);
            }
            logOptionalSkip("workflow_events", "select by entity_id", "entity_id", err);
            return { runIds: [], eventIds: [] };
        }
    }
    const eids = [...eventIds];
    if (!eids.length) return { runIds: [], eventIds: [] };
    const runIds = new Set<string>();
    for (const part of chunk(eids, 150)) {
        try {
            const { data, error } = await supabase.from("workflow_runs").select("id").eq("org_id", orgId).in("event_id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) runIds.add(id);
            }
        } catch (err) {
            if (isConnectivityFailure(err)) {
                console.error(`Cannot reach Supabase while listing workflow_runs: ${errMessage(err)}`);
                process.exit(1);
            }
            logOptionalSkip("workflow_runs", "select by event_id", "event_id", err);
            return { runIds: [], eventIds: eids };
        }
    }
    return { runIds: [...runIds], eventIds: eids };
}

async function deleteWorkflowStack(
    supabase: SupabaseAdmin,
    orgId: string,
    entityIds: string[],
    execute: boolean
): Promise<{
    workflow_action_runs: number;
    messages_outbox: number;
    workflow_runs: number;
    workflow_events: number;
}> {
    const { runIds, eventIds } = await collectWorkflowRunIds(supabase, orgId, entityIds);
    if (!execute) {
        let war = 0;
        for (const part of chunk(runIds, 150)) {
            war += await optionalCount("workflow_action_runs", "count", "workflow_run_id", () =>
                countByIn(supabase, "workflow_action_runs", "workflow_run_id", part, orgId)
            );
        }
        let mob = 0;
        for (const part of chunk(runIds, 150)) {
            mob += await optionalCount("messages_outbox", "count", "workflow_run_id", () =>
                countByIn(supabase, "messages_outbox", "workflow_run_id", part, orgId)
            );
        }
        return {
            workflow_action_runs: war,
            messages_outbox: mob,
            workflow_runs: runIds.length,
            workflow_events: eventIds.length,
        };
    }
    let workflow_action_runs = 0;
    for (const part of chunk(runIds, 150)) {
        workflow_action_runs += await optionalDelete("workflow_action_runs", "delete", "workflow_run_id", () =>
            deleteByInColumn(supabase, "workflow_action_runs", "workflow_run_id", part, orgId)
        );
    }
    let messages_outbox = 0;
    for (const part of chunk(runIds, 150)) {
        messages_outbox += await optionalDelete("messages_outbox", "delete", "workflow_run_id", () =>
            deleteByInColumn(supabase, "messages_outbox", "workflow_run_id", part, orgId)
        );
    }
    let workflow_runs = 0;
    for (const part of chunk(runIds, 150)) {
        workflow_runs += await optionalDelete("workflow_runs", "delete", "id", () =>
            deleteByInColumn(supabase, "workflow_runs", "id", part, orgId)
        );
    }
    let workflow_events = 0;
    for (const part of chunk(eventIds, 150)) {
        workflow_events += await optionalDelete("workflow_events", "delete", "id", () =>
            deleteByInColumn(supabase, "workflow_events", "id", part, orgId)
        );
    }
    return { workflow_action_runs, messages_outbox, workflow_runs, workflow_events };
}

async function countOrDeleteMessages(
    supabase: SupabaseAdmin,
    oppIds: string[],
    jobIds: string[],
    execute: boolean
): Promise<number> {
    let total = 0;
    for (const part of chunk(oppIds, 200)) {
        total += await optionalCount("messages", "count", "opportunity_id", async () => {
            const { count, error } = await supabase.from("messages").select("*", { count: "exact", head: true }).in("opportunity_id", part);
            if (error) throw error;
            return count ?? 0;
        });
    }
    for (const part of chunk(jobIds, 200)) {
        total += await optionalCount("messages", "count", "job_id", async () => {
            const { count, error } = await supabase.from("messages").select("*", { count: "exact", head: true }).in("job_id", part);
            if (error) throw error;
            return count ?? 0;
        });
    }
    if (!execute) return total;
    let deleted = 0;
    for (const part of chunk(oppIds, 200)) {
        deleted += await optionalDelete("messages", "delete", "opportunity_id", async () => {
            const { data, error } = await supabase.from("messages").delete().in("opportunity_id", part).select("id");
            if (error) throw error;
            return (data ?? []).length;
        });
    }
    for (const part of chunk(jobIds, 200)) {
        deleted += await optionalDelete("messages", "delete", "job_id", async () => {
            const { data, error } = await supabase.from("messages").delete().in("job_id", part).select("id");
            if (error) throw error;
            return (data ?? []).length;
        });
    }
    return deleted;
}

async function countOrDeleteActionLinks(
    supabase: SupabaseAdmin,
    orgId: string,
    entityIds: string[],
    execute: boolean
): Promise<number> {
    if (!entityIds.length) return 0;
    let total = 0;
    for (const part of chunk(entityIds, 200)) {
        total += await optionalCount("action_links", "count", "entity_id", async () => {
            const { count, error } = await supabase
                .from("action_links")
                .select("*", { count: "exact", head: true })
                .eq("org_id", orgId)
                .in("entity_id", part);
            if (error) throw error;
            return count ?? 0;
        });
    }
    if (!execute) return total;
    let deleted = 0;
    for (const part of chunk(entityIds, 200)) {
        deleted += await optionalDelete("action_links", "delete", "entity_id", async () => {
            const { data, error } = await supabase.from("action_links").delete().eq("org_id", orgId).in("entity_id", part).select("id");
            if (error) throw error;
            return (data ?? []).length;
        });
    }
    return deleted;
}

async function countOrDeleteDiscountRedemptions(
    supabase: SupabaseAdmin,
    oppIds: string[],
    jobIds: string[],
    execute: boolean
): Promise<number> {
    let total = 0;
    for (const part of chunk(oppIds, 200)) {
        total += await optionalCount("discount_redemptions", "count", "opportunity_id", async () => {
            const { count, error } = await supabase
                .from("discount_redemptions")
                .select("*", { count: "exact", head: true })
                .in("opportunity_id", part);
            if (error) throw error;
            return count ?? 0;
        });
    }
    for (const part of chunk(jobIds, 200)) {
        total += await optionalCount("discount_redemptions", "count", "job_id", async () => {
            const { count, error } = await supabase.from("discount_redemptions").select("*", { count: "exact", head: true }).in("job_id", part);
            if (error) throw error;
            return count ?? 0;
        });
    }
    if (!execute) return total;
    let deleted = 0;
    for (const part of chunk(oppIds, 200)) {
        deleted += await optionalDelete("discount_redemptions", "delete", "opportunity_id", async () => {
            const { data, error } = await supabase.from("discount_redemptions").delete().in("opportunity_id", part).select("id");
            if (error) throw error;
            return (data ?? []).length;
        });
    }
    for (const part of chunk(jobIds, 200)) {
        deleted += await optionalDelete("discount_redemptions", "delete", "job_id", async () => {
            const { data, error } = await supabase.from("discount_redemptions").delete().in("job_id", part).select("id");
            if (error) throw error;
            return (data ?? []).length;
        });
    }
    return deleted;
}

async function main(): Promise<void> {
    const argv = new Set(process.argv.slice(2));
    const wantsDryFlag = argv.has("--dry-run");
    const execute = argv.has("--execute");

    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run: VERCEL_ENV=production");
        process.exit(1);
    }

    const orgId = requireEnv("DEMO_RESET_ORG_ID");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    if (execute) {
        const confirm = process.env.DEMO_RESET_CONFIRM?.trim();
        if (confirm !== RESET_CONFIRM_VALUE) {
            console.error(`Refusing execute: set DEMO_RESET_CONFIRM=${RESET_CONFIRM_VALUE}`);
            process.exit(1);
        }
    }

    const mode = execute ? "EXECUTE (destructive)" : "DRY-RUN (counts only)";
    console.log(`\n=== resetStagingDemoData: ${mode} ===`);
    console.log(`org_id: ${orgId}`);
    if (wantsDryFlag && !execute) console.log("(explicit --dry-run)");
    if (!execute) {
        console.log("No rows deleted. Pass --execute and DEMO_RESET_CONFIRM to delete.\n");
    }

    const supabase = createAdminClient();
    const orDemo = demoMetadataOrFilter();

    const oppIds = await selectDemoOpportunityIds(supabase, orgId, orDemo);
    const demoCustomerIds = new Set<string>();
    for (const part of chunk(oppIds, 200)) {
        try {
            const { data, error } = await supabase.from("opportunities").select("customer_id").eq("org_id", orgId).in("id", part);
            if (error) throw error;
            for (const r of data ?? []) {
                const cid = (r as { customer_id?: string | null }).customer_id;
                if (cid) demoCustomerIds.add(cid);
            }
        } catch (err) {
            if (isConnectivityFailure(err)) {
                console.error(`Cannot reach Supabase while reading opportunity customer_id: ${errMessage(err)}`);
                process.exit(1);
            }
            logOptionalSkip("opportunities", "select customer_id", "id", err);
        }
    }
    try {
        const { data: demoCustRows, error: dcErr } = await supabase.from("customers").select("id").eq("org_id", orgId).or(orDemo);
        if (dcErr) throw dcErr;
        for (const r of demoCustRows ?? []) {
            const id = (r as { id?: string }).id;
            if (id) demoCustomerIds.add(id);
        }
    } catch (err) {
        if (isConnectivityFailure(err)) {
            console.error(`Cannot reach Supabase while listing demo customers: ${errMessage(err)}`);
            process.exit(1);
        }
        logOptionalSkip("customers", "select demo customer ids", undefined, err);
    }
    const customerIds = [...demoCustomerIds];
    const memberIds = await collectCustomerMemberIds(supabase, orgId, customerIds);

    const jobIds = await collectJobIdsForDemo(supabase, orgId, oppIds);
    const scheduleIds = await collectScheduleIdsForJobs(supabase, orgId, jobIds);
    const demoPersonIds = await selectDemoPersonIds(supabase, orgId, orDemo);
    const entityIdsForWorkflow = [...new Set([...oppIds, ...customerIds, ...jobIds])];

    const counts: Record<string, number> = {};

    counts.opportunity_customer_members = await deleteOppJoins(supabase, orgId, oppIds, false);
    counts.opportunity_persons = await deleteOpportunityPersons(supabase, orgId, oppIds, false);
    counts.opportunity_tags = await deleteOpportunityTags(supabase, oppIds, false);

    counts.discount_redemptions = await countOrDeleteDiscountRedemptions(supabase, oppIds, jobIds, false);

    counts.quotes = await countQuotesDemoScope(supabase, orgId, oppIds, orDemo);

    counts.messages = await countOrDeleteMessages(supabase, oppIds, jobIds, false);

    const wfDry = await deleteWorkflowStack(supabase, orgId, entityIdsForWorkflow, false);
    counts.workflow_action_runs = wfDry.workflow_action_runs;
    counts.messages_outbox = wfDry.messages_outbox;
    counts.workflow_runs = wfDry.workflow_runs;
    counts.workflow_events = wfDry.workflow_events;

    counts.schedule_tags = await optionalCount("schedule_tags", "count", "schedule_id", () =>
        scheduleIds.length ? countByInNoOrg(supabase, "schedule_tags", "schedule_id", scheduleIds) : Promise.resolve(0)
    );

    counts.payments = await optionalCount("payments", "count", "job_id", () => countByIn(supabase, "payments", "job_id", jobIds, orgId));
    counts.assignments = await optionalCount("assignments", "count", "job_id", () =>
        countByIn(supabase, "assignments", "job_id", jobIds, orgId)
    );
    counts.schedules = await optionalCount("schedules", "count", "job_id", () =>
        countByIn(supabase, "schedules", "job_id", jobIds, orgId)
    );

    counts.jobs = await optionalCount("jobs", "count", "id", () => countByIn(supabase, "jobs", "id", jobIds, orgId));

    counts.action_links = await countOrDeleteActionLinks(supabase, orgId, entityIdsForWorkflow, false);

    counts.opportunities = oppIds.length;

    counts.customer_tags = await optionalCount("customer_tags", "count", "customer_id", () =>
        customerIds.length ? countByInNoOrg(supabase, "customer_tags", "customer_id", customerIds) : Promise.resolve(0)
    );
    counts.customer_subscriptions = await optionalCount("customer_subscriptions", "count", "customer_id", () =>
        customerIds.length ? countByIn(supabase, "customer_subscriptions", "customer_id", customerIds, orgId) : Promise.resolve(0)
    );
    counts.customer_payment_methods = await optionalCount("customer_payment_methods", "count", "customer_id", () =>
        customerIds.length ? countByInNoOrg(supabase, "customer_payment_methods", "customer_id", customerIds) : Promise.resolve(0)
    );
    counts.customer_member_contacts = await countCustomerMemberContactsScope(supabase, orgId, customerIds, memberIds);

    counts.customer_members = await countCustomerMembersDemoScope(supabase, orgId, customerIds, orDemo);

    counts.customer_persons = await countCustomerPersonsDemoScope(supabase, orgId, customerIds, orDemo);

    counts.contacts = await optionalCount("contacts", "count metadata", undefined, () => countRows(supabase, "contacts", orgId, orDemo));
    counts.customers = await optionalCount("customers", "count metadata", undefined, () => countRows(supabase, "customers", orgId, orDemo));
    counts.persons = await optionalCount("persons", "count metadata", undefined, () => countRows(supabase, "persons", orgId, orDemo));

    counts.person_locations = await countPersonLocationsDemoScope(supabase, orgId, orDemo, demoPersonIds);
    counts.person_relationships = await countPersonRelationshipsForPersons(supabase, orgId, demoPersonIds);

    counts.locations = (await selectDemoLocationRows(supabase, orgId, orDemo)).length;
    counts.work_units = await optionalCount("work_units", "count metadata", undefined, () => countRows(supabase, "work_units", orgId, orDemo));
    counts.departments = await optionalCount("departments", "count metadata", undefined, () => countRows(supabase, "departments", orgId, orDemo));

    counts.documents = await optionalCount("documents", "count metadata", undefined, () => countRows(supabase, "documents", orgId, orDemo));

    console.log("\n--- Table-by-table scope (matching demo markers / FK-linked demo opportunities) ---\n");
    const order = [
        "opportunity_customer_members",
        "opportunity_persons",
        "opportunity_tags",
        "discount_redemptions",
        "quotes",
        "messages",
        "workflow_action_runs",
        "messages_outbox",
        "workflow_runs",
        "workflow_events",
        "schedule_tags",
        "payments",
        "assignments",
        "schedules",
        "jobs",
        "action_links",
        "opportunities",
        "customer_tags",
        "customer_subscriptions",
        "customer_payment_methods",
        "customer_member_contacts",
        "customer_members",
        "customer_persons",
        "contacts",
        "customers",
        "person_locations",
        "person_relationships",
        "persons",
        "locations",
        "work_units",
        "departments",
        "documents",
    ] as const;
    for (const k of order) {
        const v = counts[k];
        if (v !== undefined) console.log(`${k}: ${v}`);
    }

    if (!execute) {
        console.log("\nDry-run complete.\n");
        return;
    }

    // --- Execute deletes (same order as counts / FK safety) ---
    const deleted: Record<string, number> = {};

    deleted.opportunity_customer_members = await deleteOppJoins(supabase, orgId, oppIds, true);
    deleted.opportunity_persons = await deleteOpportunityPersons(supabase, orgId, oppIds, true);
    deleted.opportunity_tags = await deleteOpportunityTags(supabase, oppIds, true);

    deleted.discount_redemptions = await countOrDeleteDiscountRedemptions(supabase, oppIds, jobIds, true);

    deleted.quotes = await optionalDelete("quotes", "delete", "opportunity_id", () =>
        deleteByInColumn(supabase, "quotes", "opportunity_id", oppIds, orgId)
    );
    deleted.quotes += await optionalDelete("quotes", "delete metadata", undefined, () => deleteByOr(supabase, "quotes", orgId, orDemo));

    deleted.messages = await countOrDeleteMessages(supabase, oppIds, jobIds, true);

    const wfExec = await deleteWorkflowStack(supabase, orgId, entityIdsForWorkflow, true);
    deleted.workflow_action_runs = wfExec.workflow_action_runs;
    deleted.messages_outbox = wfExec.messages_outbox;
    deleted.workflow_runs = wfExec.workflow_runs;
    deleted.workflow_events = wfExec.workflow_events;

    deleted.schedule_tags = await optionalDelete("schedule_tags", "delete", "schedule_id", () =>
        scheduleIds.length ? deleteByInColumnNoOrg(supabase, "schedule_tags", "schedule_id", scheduleIds, "*") : Promise.resolve(0)
    );

    deleted.payments = await optionalDelete("payments", "delete", "job_id", () =>
        deleteByInColumn(supabase, "payments", "job_id", jobIds, orgId)
    );
    deleted.assignments = await optionalDelete("assignments", "delete", "job_id", () =>
        deleteByInColumn(supabase, "assignments", "job_id", jobIds, orgId)
    );
    deleted.schedules = await optionalDelete("schedules", "delete", "job_id", () =>
        deleteByInColumn(supabase, "schedules", "job_id", jobIds, orgId)
    );

    deleted.jobs = await optionalDelete("jobs", "delete", "id", () => deleteByInColumn(supabase, "jobs", "id", jobIds, orgId));

    deleted.action_links = await countOrDeleteActionLinks(supabase, orgId, entityIdsForWorkflow, true);

    deleted.opportunities = await optionalDelete("opportunities", "delete", "id", () =>
        deleteByInColumn(supabase, "opportunities", "id", oppIds, orgId)
    );

    deleted.customer_tags = await optionalDelete("customer_tags", "delete", "customer_id", () =>
        customerIds.length ? deleteByInColumnNoOrg(supabase, "customer_tags", "customer_id", customerIds, "*") : Promise.resolve(0)
    );
    deleted.customer_subscriptions = await optionalDelete("customer_subscriptions", "delete", "customer_id", () =>
        customerIds.length ? deleteByInColumn(supabase, "customer_subscriptions", "customer_id", customerIds, orgId) : Promise.resolve(0)
    );
    deleted.customer_payment_methods = await optionalDelete("customer_payment_methods", "delete", "customer_id", () =>
        customerIds.length ? deleteByInColumnNoOrg(supabase, "customer_payment_methods", "customer_id", customerIds, "*") : Promise.resolve(0)
    );
    deleted.customer_member_contacts = 0;
    for (const part of chunk(memberIds, 200)) {
        deleted.customer_member_contacts += await optionalDelete("customer_member_contacts", "delete", "customer_member_id", () =>
            deleteByInColumn(supabase, "customer_member_contacts", "customer_member_id", part, orgId)
        );
    }
    for (const part of chunk(customerIds, 200)) {
        deleted.customer_member_contacts += await optionalDelete("customer_member_contacts", "delete", "customer_id", () =>
            deleteByInColumn(supabase, "customer_member_contacts", "customer_id", part, orgId)
        );
    }

    deleted.customer_members = 0;
    for (const part of chunk(customerIds, 200)) {
        deleted.customer_members += await optionalDelete("customer_members", "delete", "customer_id", async () => {
            const { data, error } = await supabase.from("customer_members").delete().eq("org_id", orgId).in("customer_id", part).select("id");
            if (error) throw error;
            return (data ?? []).length;
        });
    }
    deleted.customer_members += await optionalDelete("customer_members", "delete metadata", undefined, () =>
        deleteByOr(supabase, "customer_members", orgId, orDemo)
    );

    deleted.customer_persons = 0;
    for (const part of chunk(customerIds, 200)) {
        deleted.customer_persons += await optionalDelete("customer_persons", "delete", "customer_id", async () => {
            const { data, error } = await supabase.from("customer_persons").delete().eq("org_id", orgId).in("customer_id", part).select("id");
            if (error) throw error;
            return (data ?? []).length;
        });
    }
    deleted.customer_persons += await optionalDelete("customer_persons", "delete metadata", undefined, () =>
        deleteByOr(supabase, "customer_persons", orgId, orDemo)
    );

    deleted.contacts = await optionalDelete("contacts", "delete metadata", undefined, () => deleteByOr(supabase, "contacts", orgId, orDemo));
    deleted.customers = await optionalDelete("customers", "delete metadata", undefined, () => deleteByOr(supabase, "customers", orgId, orDemo));

    deleted.person_locations = await optionalDelete("person_locations", "delete metadata", undefined, () => deleteByOr(supabase, "person_locations", orgId, orDemo));
    for (const part of chunk(demoPersonIds, 200)) {
        deleted.person_locations += await optionalDelete("person_locations", "delete", "person_id", () =>
            deleteByInColumn(supabase, "person_locations", "person_id", part, orgId)
        );
    }

    deleted.person_relationships = 0;
    for (const part of chunk(demoPersonIds, 150)) {
        deleted.person_relationships += await optionalDelete("person_relationships", "delete", "from_person_id", () =>
            deleteByInColumn(supabase, "person_relationships", "from_person_id", part, orgId)
        );
        deleted.person_relationships += await optionalDelete("person_relationships", "delete", "to_person_id", () =>
            deleteByInColumn(supabase, "person_relationships", "to_person_id", part, orgId)
        );
    }

    deleted.persons = await optionalDelete("persons", "delete metadata", undefined, () => deleteByOr(supabase, "persons", orgId, orDemo));

    deleted.locations = await deleteDemoLocations(supabase, orgId, orDemo, true);
    deleted.work_units = await optionalDelete("work_units", "delete metadata", undefined, () => deleteByOr(supabase, "work_units", orgId, orDemo));
    deleted.departments = await optionalDelete("departments", "delete metadata", undefined, () => deleteByOr(supabase, "departments", orgId, orDemo));

    deleted.documents = await optionalDelete("documents", "delete metadata", undefined, () => deleteByOr(supabase, "documents", orgId, orDemo));

    console.log("\n--- Deleted row counts ---\n");
    for (const k of order) {
        const v = deleted[k as keyof typeof deleted];
        if (v !== undefined) console.log(`${k}: ${v}`);
    }
    console.log("\nExecute complete.\n");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
