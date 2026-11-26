/**
 * BP V2 Slice 2 — the HOST work unit of a domain-projection process.
 *
 * Every Work View is addressed through a canonical location — (host work unit, base lane, view) — which
 * routing, the totals endpoint and the provisioning answer all key on. A projection department has no
 * stages, so it has no lifecycle work unit to host its views. This is that host: one row per projection
 * department, written idempotently by publication.
 *
 * It deliberately carries an EMPTY `queue_definition`. It is not a lane source: its rows and counts come
 * only from the registered projection branch. Every legacy reader that loads queue definitions fails to
 * load this one and skips it or refuses explicitly — nothing can read it as an empty opportunity lane.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Key prefix of a projection host. The key carries the department id because the provisioning answer
 * resolves a work unit by KEY across the whole org (`maybeSingle`): two projection departments sharing
 * one key would make both unreachable. `uq_work_units_department_key` alone does not prevent that.
 */
export const DOMAIN_PROJECTION_HOST_WORK_UNIT_KEY_PREFIX = "domain_projection_host_" as const;

export function domainProjectionHostWorkUnitKey(departmentId: string): string {
    return `${DOMAIN_PROJECTION_HOST_WORK_UNIT_KEY_PREFIX}${departmentId.replace(/-/g, "").toLowerCase()}`;
}
/** The base lane every projection view is located on. Never a QueueService lane. */
export const DOMAIN_PROJECTION_BASE_QUEUE_KEY = "projection" as const;

export function isDomainProjectionHostWorkUnit(row: { key?: string | null } | null | undefined): boolean {
    return String(row?.key ?? "").trim().startsWith(DOMAIN_PROJECTION_HOST_WORK_UNIT_KEY_PREFIX);
}

/**
 * Ensure the projection department's host exists and is active. Idempotent on
 * `uq_work_units_department_key (department_id, key)`. Writes nothing when it already exists.
 */
export async function ensureDomainProjectionHostWorkUnit(
    supabase: SupabaseClient,
    args: { orgId: string; departmentId: string; processName: string; domain: string },
): Promise<{ ok: true; created: boolean; workUnitId: string } | { ok: false; error: string }> {
    const { data: existing, error: readErr } = await supabase
        .from("work_units")
        .select("id, is_active")
        .eq("org_id", args.orgId)
        .eq("department_id", args.departmentId)
        .eq("key", domainProjectionHostWorkUnitKey(args.departmentId))
        .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (existing) {
        const row = existing as { id: string; is_active: boolean | null };
        if (row.is_active === false) {
            const { error } = await supabase
                .from("work_units")
                .update({ is_active: true, updated_at: new Date().toISOString() })
                .eq("id", row.id)
                .eq("org_id", args.orgId);
            if (error) return { ok: false, error: error.message };
        }
        return { ok: true, created: false, workUnitId: row.id };
    }
    const { data: created, error: insErr } = await supabase
        .from("work_units")
        .insert({
            org_id: args.orgId,
            department_id: args.departmentId,
            key: domainProjectionHostWorkUnitKey(args.departmentId),
            name: args.processName.trim() || "Process",
            description: `Host for ${args.domain} Work Views (domain projection).`,
            sort_order: 0,
            is_active: true,
            queue_definition: {},
            metadata: { domain_projection_host: { domain: args.domain } },
            updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, created: true, workUnitId: String((created as { id: string }).id) };
}

/**
 * After a publication: every active domain-projection process that now publishes Work Views gets its
 * host. Runs on the PUBLISHED payload (what runtime will read), never on a draft. A staged lifecycle,
 * or a projection without views, writes nothing.
 */
export async function ensureHostsForPublishedProjections(
    supabase: SupabaseClient,
    args: { orgId: string; departmentId: string; publishedPayload: unknown },
): Promise<Array<{ processKey: string; ok: boolean; created?: boolean; error?: string }>> {
    const { parseLifecycleBuilderV1 } = await import("@/lib/lifecycle/lifecycleBuilderConfig");
    const { isDomainProjectionModel, resolveProcessModel } = await import("@/lib/lifecycle/processModelV1");
    const builder = parseLifecycleBuilderV1(args.publishedPayload);
    const out: Array<{ processKey: string; ok: boolean; created?: boolean; error?: string }> = [];
    for (const process of builder?.processes ?? []) {
        if (!process.is_active) continue;
        const model = resolveProcessModel(process);
        if (!isDomainProjectionModel(model) || !(process.work_views_v1?.length)) continue;
        const r = await ensureDomainProjectionHostWorkUnit(supabase, {
            orgId: args.orgId,
            departmentId: args.departmentId,
            processName: process.name,
            domain: model.domain,
        });
        out.push(r.ok ? { processKey: process.key, ok: true, created: r.created } : { processKey: process.key, ok: false, error: r.error });
    }
    return out;
}
