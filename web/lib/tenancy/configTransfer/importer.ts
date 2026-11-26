/**
 * Re-author a reviewed configuration export into a named org through the app's own write paths (briefing M8;
 * P3 R1). Never a row copy: every row is written fresh, with the target org's id and new ids, by the same library
 * code and the same Supabase data-API calls the admin surfaces use, so the database's constraints, triggers and
 * guards run as they do for the app:
 *
 *   sites, rooms          the admin locations route's checks: `assertTopologyMutationSafe`,
 *                         `validateSpaceUsesConfiguration`; then its insert (location numbers from the allocator)
 *   household role types  the admin role-type route's insert (`is_system` false, empty metadata)
 *   enrollment process    a builder-owned department as the admin departments route creates one, with
 *                         `ensureLifecycleDepartmentWorkspaceAccess`; then the business-process write boundary:
 *                         `openDraft` → `saveDraft` → `validateBusinessProcessForPublish` → `recordDraftValidation` →
 *                         `publishDraft` (the publish RPC); then the publish route's follow-ups
 *                         (`ensureHostsForPublishedProjections`, `ensureEnrollmentOpportunityDrawerOverride`) and the
 *                         work-unit repair (`repairLifecycleWorkUnits`) that derives the lane work units
 *
 * Idempotent: the plan matches every item to the target by its natural key (site label; room label within its
 * site; role-type key; department key) and writes only what is absent. An item that is present but differs is
 * reported and left alone — the import never updates or deletes. The multi-step kind resumes: a department whose
 * process is not yet published, or whose lane work units are missing, is planned `complete` and finished by the
 * same calls.
 *
 * Blocked before any write: lane work units the export names but the target org cannot derive. The work-unit repair
 * takes each lane's status filters from the org's opportunity status definitions assigned to that stage (P3 C14's
 * control plane, not on the allowlist); with none, it refuses the stage, and it would do so after the department
 * and its process were already written. The plan reads the same status definitions first and marks the item
 * `blocked`, which `apply` refuses as a whole.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import {
    loadPublishedConfiguration,
    openDraft,
    publishDraft,
    recordDraftValidation,
    saveDraft,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { normalizeBusinessProcessPayloadRequirements } from "@/lib/businessProcesses/configuration/normalizePublishedStageRequirements";
import { ensureHostsForPublishedProjections } from "@/lib/businessProcesses/projections/domainProjectionHost";
import { ensureEnrollmentOpportunityDrawerOverride } from "@/lib/admin/enrollmentDrawerOverrideProvisioning";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { stageSavedStatusKeys } from "@/lib/lifecycle/lifecycleActivationStep3";
import { statusKeysForBuilderStageQueueSync } from "@/lib/lifecycle/lifecycleStageWorkUnitQueueSync";
import { repairLifecycleWorkUnits } from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import { ensureLifecycleDepartmentWorkspaceAccess } from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";
import { newBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import { parseLifecycleBuilderV1, serializeLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { assertTopologyMutationSafe } from "@/lib/location/topologyMutationAuthority";
import { validateSpaceUsesConfiguration } from "@/lib/location/validateSpaceUses";

import type { EnrollmentProcessItem, ExportFile, RoleTypeItem, RoomItem, SiteItem } from "./exportFile";

export type PlanAction = "create" | "present" | "present_differs" | "complete" | "blocked";
export type PlanStep = { kind: string; ref: string; action: PlanAction; detail: string };

type Obj = Record<string, unknown>;
type TargetState = {
    sites: Obj[];
    rooms: Obj[];
    roleTypes: Obj[];
    departments: Obj[];
};

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return (res.data ?? ([] as unknown)) as T;
}

/** Deterministic JSON: keys sorted at every level, so two equal documents compare equal. */
export function canonicalJson(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
    if (v && typeof v === "object") {
        // As JSON.stringify: a key whose value is undefined is absent, so a document read back from the database
        // and the same document built in memory compare equal.
        const keys = Object.keys(v as Obj).filter((k) => (v as Obj)[k] !== undefined).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Obj)[k])}`).join(",")}}`;
    }
    return JSON.stringify(v ?? null);
}

/** The builder document a one-process department publishes, round-tripped through the app's own parser. */
export function builderForProcess(process: Obj): Obj {
    const parsed = parseLifecycleBuilderV1({ version: 1, active_process_id: process.id, processes: [process] });
    if (!parsed) throw new Error("the exported process does not parse as lifecycle_builder_v1");
    return serializeLifecycleBuilderV1(parsed);
}

function activeProcessOf(payload: Obj | null): Obj | null {
    const procs = Array.isArray(payload?.processes) ? (payload!.processes as Obj[]) : [];
    return procs.find((p) => p.id === payload?.active_process_id) ?? null;
}

async function readTarget(supabase: SupabaseClient, orgId: string): Promise<TargetState> {
    const [locs, roleTypes, departments] = await Promise.all([
        supabase
            .from("locations")
            .select("id, label, location_type, parent_location_id, unit_role, is_active, address1, address2, city, state, postal_code, country, metadata")
            .eq("org_id", orgId)
            .in("location_type", ["site", "unit"])
            .is("customer_id", null),
        supabase.from("customer_person_role_types").select("id, key, label, description, sort_order, is_active").eq("org_id", orgId),
        supabase.from("departments").select("id, key, name").eq("org_id", orgId),
    ]);
    const l = must(locs, "locations") as Obj[];
    return {
        sites: l.filter((x) => x.location_type === "site"),
        rooms: l.filter((x) => x.location_type === "unit"),
        roleTypes: must(roleTypes, "customer_person_role_types") as Obj[],
        departments: must(departments, "departments") as Obj[],
    };
}

const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

function diffFields(item: Obj, row: Obj, fields: string[]): string[] {
    return fields.filter((f) => !same(item[f], row[f]));
}

/** Where two JSON documents differ, as paths (`stages[2].label`). For the operator, not for logic. */
export function differingPaths(a: unknown, b: unknown, path = "", out: string[] = []): string[] {
    if (same(a, b)) return out;
    const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        a.forEach((x, i) => differingPaths(x, b[i], `${path}[${i}]`, out));
    } else if (isObj(a) && isObj(b)) {
        for (const k of [...new Set([...Object.keys(a as Obj), ...Object.keys(b as Obj)])].sort()) {
            differingPaths((a as Obj)[k], (b as Obj)[k], path ? `${path}.${k}` : k, out);
        }
    } else out.push(path || "(root)");
    return out;
}

const blockedDetail = (lanes: string[]) =>
    `the org has no opportunity statuses assigned to the stages of ${lanes.join(", ")}, so the work-unit repair cannot ` +
    "derive those lanes (P3 C14 status definitions are not transferred); remove derived_work_unit_keys from the reviewed " +
    "file, or provide the statuses first";

const findSite = (st: TargetState, label: string) => st.sites.find((s) => s.label === label);

export async function planImport(supabase: SupabaseClient, orgId: string, file: ExportFile): Promise<PlanStep[]> {
    const st = await readTarget(supabase, orgId);
    const steps: PlanStep[] = [];
    const siteLabel = new Map((file.kinds.sites ?? []).map((s) => [s.ref, s.label]));

    for (const s of file.kinds.sites ?? []) {
        const row = findSite(st, s.label);
        if (!row) steps.push({ kind: "sites", ref: s.ref, action: "create", detail: `site "${s.label}"` });
        else {
            const d = diffFields(s as unknown as Obj, row, ["is_active", "address1", "address2", "city", "state", "postal_code", "country", "metadata"]);
            steps.push({ kind: "sites", ref: s.ref, action: d.length ? "present_differs" : "present", detail: d.length ? `differs: ${d.join(", ")}` : `site "${s.label}"` });
        }
    }
    for (const r of file.kinds.rooms ?? []) {
        const site = findSite(st, siteLabel.get(r.site_ref)!);
        const row = site ? st.rooms.find((x) => x.parent_location_id === site.id && x.label === r.label) : undefined;
        if (!row) steps.push({ kind: "rooms", ref: r.ref, action: "create", detail: `room "${r.label}" at ${siteLabel.get(r.site_ref)}` });
        else {
            const d = diffFields(r as unknown as Obj, row, ["unit_role", "is_active", "metadata"]);
            steps.push({ kind: "rooms", ref: r.ref, action: d.length ? "present_differs" : "present", detail: d.length ? `differs: ${d.join(", ")}` : `room "${r.label}"` });
        }
    }
    for (const t of file.kinds.household_role_types ?? []) {
        const row = st.roleTypes.find((x) => x.key === t.key);
        if (!row) steps.push({ kind: "household_role_types", ref: t.ref, action: "create", detail: `role type ${t.key}` });
        else {
            const d = diffFields(t as unknown as Obj, row, ["label", "description", "sort_order", "is_active"]);
            steps.push({ kind: "household_role_types", ref: t.ref, action: d.length ? "present_differs" : "present", detail: d.length ? `differs: ${d.join(", ")}` : `role type ${t.key}` });
        }
    }
    for (const e of file.kinds.enrollment_process ?? []) {
        const dept = st.departments.find((d) => d.key === e.department.key);
        if (!dept) {
            const stages = Array.isArray(e.process.stages) ? e.process.stages.length : 0;
            const unfiltered = await lanesWithoutStatusFilters(supabase, orgId, e);
            if (unfiltered.length) {
                steps.push({ kind: "enrollment_process", ref: e.ref, action: "blocked", detail: blockedDetail(unfiltered) });
                continue;
            }
            steps.push({ kind: "enrollment_process", ref: e.ref, action: "create", detail: `department ${e.department.key} "${e.department.name}", publish process ${String(e.process.key)} (${stages} stages), derive work units` });
            continue;
        }
        const published = await loadPublishedConfiguration(supabase, { orgId, departmentId: String(dept.id) });
        const live = activeProcessOf(published);
        // Publish materializes stage requirements an older process lacks (D-90); compare like with like.
        const { data: deptRow } = await supabase.from("departments").select("metadata").eq("id", String(dept.id)).maybeSingle();
        const wanted = activeProcessOf(
            normalizeBusinessProcessPayloadRequirements({
                payload: builderForProcess(e.process as Obj),
                departmentMetadata: ((deptRow as Obj | null)?.metadata as Record<string, unknown> | null) ?? null,
            }).payload as Obj,
        );
        const missing = await missingLaneWorkUnits(supabase, orgId, String(dept.id), e.derived_work_unit_keys);
        const unfiltered = missing.length ? (await lanesWithoutStatusFilters(supabase, orgId, e)).filter((k) => missing.includes(k)) : [];
        if (unfiltered.length) {
            steps.push({ kind: "enrollment_process", ref: e.ref, action: "blocked", detail: blockedDetail(unfiltered) });
            continue;
        }
        if (!live) {
            steps.push({ kind: "enrollment_process", ref: e.ref, action: "complete", detail: `department ${e.department.key} exists with no published process; publish it and derive work units` });
            continue;
        }
        if (!same(live, wanted)) {
            const at = differingPaths(live, wanted).slice(0, 6).join(", ");
            steps.push({ kind: "enrollment_process", ref: e.ref, action: "present_differs", detail: `department ${e.department.key} exists with a different published process (at ${at})` });
            continue;
        }
        steps.push(
            missing.length
                ? { kind: "enrollment_process", ref: e.ref, action: "complete", detail: `department ${e.department.key}: process published; derive missing work units ${missing.join(", ")}` }
                : { kind: "enrollment_process", ref: e.ref, action: "present", detail: `department ${e.department.key}: the published process equals the export` },
        );
    }
    return steps;
}

const LANE_PREFIX = "lifecycle_wu_";

/**
 * The lanes the work-unit repair would refuse in this org: those whose stage has no status filters, computed as the
 * repair computes them (`repairLifecycleWorkUnits`: effective opportunity status definitions → the stage's saved
 * status keys → the queue's filter keys).
 */
export async function lanesWithoutStatusFilters(supabase: SupabaseClient, orgId: string, e: EnrollmentProcessItem): Promise<string[]> {
    if (!e.derived_work_unit_keys.length) return [];
    const stageKeys = (Array.isArray(e.process.stages) ? (e.process.stages as Obj[]) : []).map((st) => String(st.key));
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const payload = buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        })),
        stageKeys.length ? stageKeys : undefined,
    );
    return e.derived_work_unit_keys.filter((key) => {
        const stageKey = key.startsWith(LANE_PREFIX) ? key.slice(LANE_PREFIX.length) : key;
        return statusKeysForBuilderStageQueueSync(stageKey, stageSavedStatusKeys(payload, stageKey)).length === 0;
    });
}

export async function missingLaneWorkUnits(supabase: SupabaseClient, orgId: string, departmentId: string, keys: readonly string[]): Promise<string[]> {
    const rows = must(
        await supabase.from("work_units").select("key, is_active").eq("org_id", orgId).eq("department_id", departmentId),
        "work_units",
    ) as Array<{ key: string; is_active: boolean | null }>;
    const active = new Set(rows.filter((w) => w.is_active !== false).map((w) => w.key));
    return keys.filter((k) => !active.has(k));
}

export type ApplyContext = { supabase: SupabaseClient; orgId: string; actorUserId: string; say: (line: string) => void };

async function createSite(ctx: ApplyContext, s: SiteItem): Promise<void> {
    const topology = await assertTopologyMutationSafe(ctx.supabase, ctx.orgId, {
        candidate: { id: null, locationType: "site", unitRole: null, parentLocationId: null },
    });
    if (!topology.ok) throw new Error(`site "${s.label}": ${topology.message}`);
    const { error } = await ctx.supabase.from("locations").insert({
        org_id: ctx.orgId,
        customer_id: null,
        vendor_id: null,
        label: s.label,
        location_type: "site",
        parent_location_id: null,
        unit_role: null,
        is_primary: false,
        is_active: s.is_active,
        address1: s.address1,
        address2: s.address2,
        city: s.city,
        state: s.state,
        postal_code: s.postal_code,
        country: s.country,
        metadata: s.metadata,
    });
    if (error) throw new Error(`site "${s.label}": ${error.message}`);
}

async function createRoom(ctx: ApplyContext, r: RoomItem, siteId: string): Promise<void> {
    const topology = await assertTopologyMutationSafe(ctx.supabase, ctx.orgId, {
        candidate: { id: null, locationType: "unit", unitRole: r.unit_role, parentLocationId: siteId },
    });
    if (!topology.ok) throw new Error(`room "${r.label}": ${topology.message}`);
    const uses = await validateSpaceUsesConfiguration(ctx.supabase, ctx.orgId, { locationType: "unit", unitRole: r.unit_role, metadata: r.metadata });
    if (!uses.ok) throw new Error(`room "${r.label}": ${uses.message}`);
    const { error } = await ctx.supabase.from("locations").insert({
        org_id: ctx.orgId,
        customer_id: null,
        vendor_id: null,
        label: r.label,
        location_type: "unit",
        parent_location_id: siteId,
        unit_role: r.unit_role,
        is_primary: false,
        is_active: r.is_active,
        metadata: r.metadata,
    });
    if (error) throw new Error(`room "${r.label}": ${error.message}`);
}

async function createRoleType(ctx: ApplyContext, t: RoleTypeItem): Promise<void> {
    const { error } = await ctx.supabase.from("customer_person_role_types").insert({
        org_id: ctx.orgId,
        key: t.key,
        label: t.label,
        description: t.description,
        sort_order: t.sort_order ?? 100,
        is_system: false,
        is_active: t.is_active,
        metadata: {},
    });
    if (error) throw new Error(`role type ${t.key}: ${error.message}`);
}

/** Create (or finish) the lifecycle department: department, published process, follow-ups, lane work units. */
async function ensureEnrollmentProcess(ctx: ApplyContext, e: EnrollmentProcessItem): Promise<void> {
    const { supabase, orgId, actorUserId } = ctx;
    const existing = must(await supabase.from("departments").select("id").eq("org_id", orgId).eq("key", e.department.key), "departments") as Obj[];
    const departmentId = existing.length ? String(existing[0].id) : await createDepartment(ctx, e);
    const scope = { orgId, departmentId };
    if (!activeProcessOf(await loadPublishedConfiguration(supabase, scope))) {
        const builder = parseLifecycleBuilderV1(builderForProcess(e.process as Obj))!;
        await openDraft(supabase, { ...scope, actorUserId });
        const draft = await saveDraft(supabase, { ...scope, builder, actorUserId });
        const validation = validateBusinessProcessForPublish(draft.payload);
        await recordDraftValidation(supabase, { ...scope, validationErrors: validation.errors, actorUserId });
        if (validation.errors.length) {
            throw new Error(`process ${String(e.process.key)} fails publish validation: ${JSON.stringify(validation.errors).slice(0, 800)}`);
        }
        const published = await publishDraft(supabase, { ...scope, actorUserId });
        ctx.say(`    published revision ${published.revisionNumber} (${published.revisionId})${validation.warnings.length ? `, ${validation.warnings.length} warning(s)` : ""}`);
    }
    const payload = await loadPublishedConfiguration(supabase, scope);
    const hosts = await ensureHostsForPublishedProjections(supabase, { ...scope, publishedPayload: payload });
    for (const h of hosts) if (!h.ok) throw new Error(`projection host for ${h.processKey}: ${h.error}`);
    const drawer = await ensureEnrollmentOpportunityDrawerOverride(supabase, { orgId, publishedPayload: payload });
    ctx.say(`    opportunity drawer override: ${drawer.status}`);
    if (drawer.status === "blocked" || drawer.status === "failed") throw new Error(`opportunity drawer override ${drawer.status}: ${JSON.stringify(drawer)}`);
    // P3 C2: lane work units come from the app's work-unit repair, not from data. The export names the source's
    // `lifecycle_wu_<stage>` keys; with none named there is nothing to derive, and the repair is not asked.
    if (!e.derived_work_unit_keys.length) {
        ctx.say("    work units: the export names no lane work units; none derived");
        return;
    }
    const repair = await repairLifecycleWorkUnits(supabase, orgId, departmentId);
    if (!repair.ok) throw new Error(`work-unit repair: ${repair.error}`);
    ctx.say(`    work units: ${repair.work_units.map((w) => w.key).join(", ") || "none"}`);
    const missing = await missingLaneWorkUnits(supabase, orgId, departmentId, e.derived_work_unit_keys);
    if (missing.length) throw new Error(`work-unit repair did not derive ${missing.join(", ")}`);
}

async function createDepartment(ctx: ApplyContext, e: EnrollmentProcessItem): Promise<string> {
    const { supabase, orgId, actorUserId } = ctx;
    const { data: dept, error } = await supabase
        .from("departments")
        .insert({
            org_id: orgId,
            key: e.department.key,
            name: e.department.name,
            description: e.department.description,
            sort_order: e.department.sort_order ?? 0,
            is_active: true,
            metadata: newBuilderOwnedDepartmentMetadata(actorUserId),
            updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (error || !dept) throw new Error(`department ${e.department.key}: ${error?.message ?? "no row"}`);
    const departmentId = String((dept as Obj).id);
    const access = await ensureLifecycleDepartmentWorkspaceAccess({ supabase, orgId, departmentId, currentUserId: actorUserId });
    if (!access.ok) throw new Error(`department ${e.department.key} workspace access: ${"error" in access ? String(access.error) : "refused"}`);
    return departmentId;
}

/**
 * Write every `create` and `complete` step, in dependency order (sites, rooms, role types, process).
 * Present items are skipped. Stops at the first failure; what was written before it is named by the steps already
 * printed, and a re-run resumes from there.
 */
export async function applyImport(ctx: ApplyContext, file: ExportFile, steps: PlanStep[]): Promise<{ created: number }> {
    const creates = new Set(steps.filter((s) => s.action === "create" || s.action === "complete").map((s) => s.ref));
    const siteLabel = new Map((file.kinds.sites ?? []).map((s) => [s.ref, s.label]));
    const siteIdByLabel = async () => {
        const st = await readTarget(ctx.supabase, ctx.orgId);
        return new Map(st.sites.map((s) => [String(s.label), String(s.id)]));
    };
    let created = 0;
    const done = (ref: string) => {
        created += 1;
        ctx.say(`  written ${ref}`);
    };
    for (const s of file.kinds.sites ?? []) {
        if (!creates.has(s.ref)) continue;
        await createSite(ctx, s);
        done(s.ref);
    }
    const ids = await siteIdByLabel();
    for (const r of file.kinds.rooms ?? []) {
        if (!creates.has(r.ref)) continue;
        await createRoom(ctx, r, ids.get(siteLabel.get(r.site_ref)!)!);
        done(r.ref);
    }
    for (const t of file.kinds.household_role_types ?? []) {
        if (!creates.has(t.ref)) continue;
        await createRoleType(ctx, t);
        done(t.ref);
    }
    for (const e of file.kinds.enrollment_process ?? []) {
        if (!creates.has(e.ref)) continue;
        await ensureEnrollmentProcess(ctx, e);
        done(e.ref);
    }
    return { created };
}
