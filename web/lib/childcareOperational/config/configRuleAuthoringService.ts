/**
 * Operational config-rule authoring (Phase 3 write side) — versioned,
 * effective-dated writes for the L1 Locations operational rules exposed
 * read-only in Batch 0: capacity rules, ratio rules (+ tiers), operating
 * windows, and schedule/eligibility rules.
 *
 * Doctrine (identical to rate authoring — one discipline, many domains):
 *   * Never overwrite operational configuration truth. "Edit" = create a new
 *     version effective on a chosen date; the prior row's effective_end is closed
 *     the day before. Mirrors supersedeChildPlacement / rateAuthoringService.
 *   * Effective dating is the version mechanism. These tables have no status /
 *     supersedes / is_active column, so the prior-version link lives in
 *     `metadata.supersedes_id`; lifecycle status is DERIVED (effectiveDatedVersioning).
 *   * Ratio tiers have no own effective dates — they version WITH their parent
 *     ratio rule (a new ratio version gets its own fresh set of tier rows).
 *   * Server-only and role-gated at the route layer (admin/ops). No migration:
 *     the schema already carries effective dating + metadata and RLS already
 *     permits scoped writes.
 *
 * Nothing here writes expectations, attendance, charges, ledger, or GL — it only
 * authors L1 configuration that the pure resolvers (resolveConfigRule, etc.) read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    assertValidIsoDate,
    compareIsoDates,
    validateEndOnOrAfterStart,
} from "@/lib/childcareOperational/effectiveDating";
import { planSupersede } from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import {
    CAPACITY_KINDS,
    CONFIG_RULE_SCOPE_TYPES,
    type CapacityKind,
    type ChildcareCapacityRuleRow,
    type ChildcareOperatingWindowRow,
    type ChildcareRatioRuleRow,
    type ChildcareRatioRuleTierRow,
    type ChildcareScheduleRuleRow,
    type ConfigRuleScopeType,
} from "@/lib/childcareOperational/config/configRuleTypes";

const CAPACITY = "childcare_capacity_rules";
const RATIO = "childcare_ratio_rules";
const TIERS = "childcare_ratio_rule_tiers";
const WINDOWS = "childcare_operating_windows";
const SCHEDULE = "childcare_schedule_rules";

type Code = OperationalEnrollmentServiceError["code"];

function fail(code: Code, message: string, details?: Record<string, unknown>): never {
    throw new OperationalEnrollmentServiceError(code, message, details);
}

function asMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function lineageOriginOf(metadata: Record<string, unknown>, ownId: string): string {
    const origin = metadata.lineage_origin_id;
    return typeof origin === "string" && origin.length > 0 ? origin : ownId;
}

// ---------------------------------------------------------------------------
// Shared scope + effective-date validation (mirrors the DB CHECK + scope shape)
// ---------------------------------------------------------------------------

type ScopeColumns = {
    scope_type: ConfigRuleScopeType;
    site_location_id: string | null;
    program_category_id: string | null;
    room_location_id: string | null;
};

type ScopeInput = {
    scopeType: string;
    siteLocationId?: string | null;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
};

function buildScopeColumns(input: ScopeInput): ScopeColumns {
    const scopeType = input.scopeType as ConfigRuleScopeType;
    if (!CONFIG_RULE_SCOPE_TYPES.includes(scopeType)) {
        fail("invalid_input", `scopeType must be one of ${CONFIG_RULE_SCOPE_TYPES.join(", ")}`);
    }
    const site = trimOrNull(input.siteLocationId);
    const program = trimOrNull(input.programCategoryId);
    const room = trimOrNull(input.roomLocationId);
    const shape: Record<ConfigRuleScopeType, ScopeColumns> = {
        org: { scope_type: "org", site_location_id: null, program_category_id: null, room_location_id: null },
        site: { scope_type: "site", site_location_id: site, program_category_id: null, room_location_id: null },
        program: { scope_type: "program", site_location_id: null, program_category_id: program, room_location_id: null },
        room: { scope_type: "room", site_location_id: null, program_category_id: null, room_location_id: room },
    };
    const cols = shape[scopeType];
    if (scopeType === "site" && !cols.site_location_id) fail("invalid_input", "site scope requires siteLocationId");
    if (scopeType === "program" && !cols.program_category_id) fail("invalid_input", "program scope requires programCategoryId");
    if (scopeType === "room" && !cols.room_location_id) fail("invalid_input", "room scope requires roomLocationId");
    return cols;
}

function sameScope(a: ScopeColumns, b: ScopeColumns): boolean {
    return (
        a.scope_type === b.scope_type &&
        (a.site_location_id ?? null) === (b.site_location_id ?? null) &&
        (a.program_category_id ?? null) === (b.program_category_id ?? null) &&
        (a.room_location_id ?? null) === (b.room_location_id ?? null)
    );
}

function requireEffectiveStart(value: unknown): string {
    const v = trimOrNull(value);
    if (!v) fail("invalid_input", "effectiveStart is required");
    assertValidIsoDate(v, "effectiveStart");
    return v;
}

function optionalEffectiveEnd(value: unknown, effectiveStart: string): string | null {
    const v = trimOrNull(value);
    if (v == null) return null;
    assertValidIsoDate(v, "effectiveEnd");
    const rangeError = validateEndOnOrAfterStart(effectiveStart, v);
    if (rangeError) fail("validation_failed", rangeError.message);
    return v;
}

// ---------------------------------------------------------------------------
// Generic effective-dated row engine (create/supersede/retire/void). Each rule
// type supplies its value columns + a lineage predicate; versioning invariants
// (close prior, lineage metadata, reopen-on-void) live here once.
// ---------------------------------------------------------------------------

type RowLike = {
    id: string;
    effective_start: string;
    effective_end: string | null;
    metadata: Record<string, unknown>;
};

async function getRowById<T extends RowLike>(
    supabase: SupabaseClient,
    table: string,
    orgId: string,
    id: string,
): Promise<T> {
    const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) fail("db_error", error.message);
    if (!data) fail("not_found", `${table} row not found`, { id });
    return data as T;
}

async function listRowsByOrg<T>(supabase: SupabaseClient, table: string, orgId: string): Promise<T[]> {
    const { data, error } = await supabase.from(table).select("*").eq("org_id", orgId);
    if (error) fail("db_error", error.message);
    return (data ?? []) as T[];
}

async function insertRow<T>(supabase: SupabaseClient, table: string, row: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.from(table).insert(row).select("*").single();
    if (error || !data) fail("db_error", error?.message ?? `${table} insert failed`);
    return data as T;
}

async function closePriorRow(
    supabase: SupabaseClient,
    table: string,
    orgId: string,
    id: string,
    closeDate: string,
    actor: string | null,
): Promise<void> {
    const { error } = await supabase
        .from(table)
        .update({ effective_end: closeDate, updated_by: actor })
        .eq("org_id", orgId)
        .eq("id", id);
    if (error) fail("db_error", error.message);
}

export type VoidResult = { voided: true; id: string; reopenedPriorId: string | null };

/**
 * Generic supersede: insert a new version carrying value columns forward (with
 * overrides), close the prior row the day before, and link the lineage. The
 * caller supplies the carried/override value columns and an optional afterInsert
 * (used by ratio rules to (re)create child tiers under the new version).
 */
async function supersedeRow<T extends RowLike>(
    supabase: SupabaseClient,
    args: {
        table: string;
        orgId: string;
        priorId: string;
        newStart: string;
        actor: string | null;
        valueColumns: (prior: T) => Record<string, unknown>;
        afterInsert?: (newId: string, prior: T) => Promise<void>;
    },
): Promise<{ row: T; priorId: string; priorCloseDate: string }> {
    const prior = await getRowById<T>(supabase, args.table, args.orgId, args.priorId);
    const plan = planSupersede({
        priorStart: prior.effective_start,
        priorEnd: prior.effective_end,
        newStart: args.newStart,
    });
    if (!plan.ok) fail(plan.error.code, plan.error.message);
    const closeDate = plan.closeDate;

    const newRow = {
        org_id: args.orgId,
        ...args.valueColumns(prior),
        effective_start: args.newStart,
        effective_end: null,
        source_key: (prior as RowLike & { source_key?: string }).source_key ?? "config",
        metadata: {
            ...asMetadata(prior.metadata),
            lineage_origin_id: lineageOriginOf(asMetadata(prior.metadata), prior.id),
            supersedes_id: prior.id,
        },
        created_by: args.actor,
        updated_by: args.actor,
    };
    const inserted = await insertRow<T>(supabase, args.table, newRow);
    if (args.afterInsert) await args.afterInsert(inserted.id, prior);
    await closePriorRow(supabase, args.table, args.orgId, prior.id, closeDate, args.actor);
    return { row: inserted, priorId: prior.id, priorCloseDate: closeDate };
}

/** Generic retire: close the effective window (non-destructive; no is_active). */
async function retireRow<T extends RowLike>(
    supabase: SupabaseClient,
    args: { table: string; orgId: string; id: string; effectiveEnd: string; actor: string | null },
): Promise<T> {
    const prior = await getRowById<T>(supabase, args.table, args.orgId, args.id);
    const end = trimOrNull(args.effectiveEnd);
    if (!end) fail("invalid_input", "effectiveEnd is required to retire a rule");
    assertValidIsoDate(end, "effectiveEnd");
    const rangeError = validateEndOnOrAfterStart(prior.effective_start, end);
    if (rangeError) fail("validation_failed", rangeError.message);

    const { data, error } = await supabase
        .from(args.table)
        .update({ effective_end: end, updated_by: args.actor })
        .eq("org_id", args.orgId)
        .eq("id", args.id)
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? `${args.table} retire failed`);
    return data as T;
}

/**
 * Generic void: hard-delete a not-yet-started version and reopen its predecessor.
 * Refused once a version was ever effective. `sameLineage` scopes the
 * "no later sibling" guard to the row's logical lineage. `beforeDelete` lets
 * ratio rules remove child tiers explicitly (defense-in-depth beyond CASCADE).
 */
async function voidScheduledRow<T extends RowLike>(
    supabase: SupabaseClient,
    args: {
        table: string;
        orgId: string;
        id: string;
        todayYmd: string;
        actor: string | null;
        sameLineage: (a: T, b: T) => boolean;
        beforeDelete?: (row: T) => Promise<void>;
    },
): Promise<VoidResult> {
    const row = await getRowById<T>(supabase, args.table, args.orgId, args.id);
    assertValidIsoDate(args.todayYmd, "todayYmd");
    if (compareIsoDates(row.effective_start, args.todayYmd) <= 0) {
        fail("invalid_state", "Only a scheduled (future) version can be voided; retire an active version instead");
    }
    const all = await listRowsByOrg<T>(supabase, args.table, args.orgId);
    const hasLater = all.some(
        (o) => o.id !== row.id && args.sameLineage(o, row) && compareIsoDates(o.effective_start, row.effective_start) > 0,
    );
    if (hasLater) fail("invalid_state", "Cannot void a version that has a later version");

    const supersedesId = asMetadata(row.metadata).supersedes_id;
    let reopenedPriorId: string | null = null;
    if (typeof supersedesId === "string" && supersedesId.length > 0) {
        const { error } = await supabase
            .from(args.table)
            .update({ effective_end: null, updated_by: args.actor })
            .eq("org_id", args.orgId)
            .eq("id", supersedesId);
        if (error) fail("db_error", error.message);
        reopenedPriorId = supersedesId;
    }

    if (args.beforeDelete) await args.beforeDelete(row);
    const { error: deleteError } = await supabase
        .from(args.table)
        .delete()
        .eq("org_id", args.orgId)
        .eq("id", args.id);
    if (deleteError) fail("db_error", deleteError.message);
    return { voided: true, id: args.id, reopenedPriorId };
}

// ===========================================================================
// Capacity rules
// ===========================================================================

function requireCapacityKind(value: unknown): CapacityKind {
    if (typeof value !== "string" || !(CAPACITY_KINDS as readonly string[]).includes(value)) {
        fail("invalid_input", `capacityKind must be one of ${CAPACITY_KINDS.join(", ")}`);
    }
    return value as CapacityKind;
}

function requireNonNegInt(value: unknown, field: string): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(n) || n < 0) fail("invalid_input", `${field} must be a non-negative integer`);
    return n;
}

export type CreateCapacityRuleInput = ScopeInput & {
    orgId: string;
    ageGroupKey?: string | null;
    capacityKind: string;
    capacity: number;
    effectiveStart: string;
    effectiveEnd?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export async function createCapacityRule(
    supabase: SupabaseClient,
    input: CreateCapacityRuleInput,
): Promise<ChildcareCapacityRuleRow> {
    const scope = buildScopeColumns(input);
    const effectiveStart = requireEffectiveStart(input.effectiveStart);
    const effectiveEnd = optionalEffectiveEnd(input.effectiveEnd, effectiveStart);
    const actor = trimOrNull(input.actorUserId);
    return insertRow<ChildcareCapacityRuleRow>(supabase, CAPACITY, {
        org_id: input.orgId,
        ...scope,
        age_group_key: trimOrNull(input.ageGroupKey),
        capacity_kind: requireCapacityKind(input.capacityKind),
        capacity: requireNonNegInt(input.capacity, "capacity"),
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
        source_key: "config",
        metadata: asMetadata(input.metadata),
        created_by: actor,
        updated_by: actor,
    });
}

export type CapacityVersionInput = {
    orgId: string;
    priorId: string;
    effectiveStart: string;
    capacity?: number | null;
    capacityKind?: string | null;
    actorUserId?: string | null;
};

export async function createCapacityRuleVersion(supabase: SupabaseClient, input: CapacityVersionInput) {
    return supersedeRow<ChildcareCapacityRuleRow>(supabase, {
        table: CAPACITY,
        orgId: input.orgId,
        priorId: input.priorId,
        newStart: requireEffectiveStart(input.effectiveStart),
        actor: trimOrNull(input.actorUserId),
        valueColumns: (prior) => ({
            scope_type: prior.scope_type,
            site_location_id: prior.site_location_id,
            program_category_id: prior.program_category_id,
            room_location_id: prior.room_location_id,
            age_group_key: prior.age_group_key,
            capacity_kind: input.capacityKind != null ? requireCapacityKind(input.capacityKind) : prior.capacity_kind,
            capacity: input.capacity != null ? requireNonNegInt(input.capacity, "capacity") : prior.capacity,
        }),
    });
}

export function retireCapacityRule(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; effectiveEnd: string; actorUserId?: string | null },
) {
    return retireRow<ChildcareCapacityRuleRow>(supabase, {
        table: CAPACITY,
        orgId: input.orgId,
        id: input.id,
        effectiveEnd: input.effectiveEnd,
        actor: trimOrNull(input.actorUserId),
    });
}

export function voidScheduledCapacityRule(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; todayYmd: string; actorUserId?: string | null },
) {
    return voidScheduledRow<ChildcareCapacityRuleRow>(supabase, {
        table: CAPACITY,
        orgId: input.orgId,
        id: input.id,
        todayYmd: input.todayYmd,
        actor: trimOrNull(input.actorUserId),
        sameLineage: (a, b) =>
            sameScope(a, b) &&
            (a.age_group_key ?? null) === (b.age_group_key ?? null) &&
            a.capacity_kind === b.capacity_kind,
    });
}

// ===========================================================================
// Ratio rules (+ tiers) — tiers version WITH the parent rule
// ===========================================================================

export type RatioTierInput = { maxChildren: number; requiredStaff: number; sortOrder?: number };

function normalizeTiers(tiers: readonly RatioTierInput[] | undefined): {
    max_children: number;
    required_staff: number;
    sort_order: number;
}[] {
    if (!tiers || tiers.length === 0) fail("invalid_input", "ratio rule requires at least one tier");
    const seen = new Set<number>();
    return tiers.map((t, i) => {
        const max = requireNonNegInt(t.maxChildren, "maxChildren");
        const staff = requireNonNegInt(t.requiredStaff, "requiredStaff");
        if (max <= 0) fail("invalid_input", "maxChildren must be > 0");
        if (staff <= 0) fail("invalid_input", "requiredStaff must be > 0");
        if (seen.has(max)) fail("invalid_input", `duplicate tier max_children: ${max}`);
        seen.add(max);
        return { max_children: max, required_staff: staff, sort_order: t.sortOrder ?? (i + 1) * 100 };
    });
}

async function insertTiers(
    supabase: SupabaseClient,
    orgId: string,
    ratioRuleId: string,
    tiers: { max_children: number; required_staff: number; sort_order: number }[],
): Promise<void> {
    const rows = tiers.map((t) => ({ org_id: orgId, ratio_rule_id: ratioRuleId, ...t, metadata: {} }));
    const { error } = await supabase.from(TIERS).insert(rows);
    if (error) fail("db_error", error.message);
}

async function listTiersForRule(
    supabase: SupabaseClient,
    orgId: string,
    ratioRuleId: string,
): Promise<ChildcareRatioRuleTierRow[]> {
    const { data, error } = await supabase
        .from(TIERS)
        .select("*")
        .eq("org_id", orgId)
        .eq("ratio_rule_id", ratioRuleId);
    if (error) fail("db_error", error.message);
    return (data ?? []) as ChildcareRatioRuleTierRow[];
}

export type CreateRatioRuleInput = ScopeInput & {
    orgId: string;
    ageGroupKey?: string | null;
    jurisdictionKey?: string | null;
    tiers: RatioTierInput[];
    effectiveStart: string;
    effectiveEnd?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export async function createRatioRule(
    supabase: SupabaseClient,
    input: CreateRatioRuleInput,
): Promise<{ rule: ChildcareRatioRuleRow; tierCount: number }> {
    const scope = buildScopeColumns(input);
    const effectiveStart = requireEffectiveStart(input.effectiveStart);
    const effectiveEnd = optionalEffectiveEnd(input.effectiveEnd, effectiveStart);
    const tiers = normalizeTiers(input.tiers);
    const actor = trimOrNull(input.actorUserId);

    const rule = await insertRow<ChildcareRatioRuleRow>(supabase, RATIO, {
        org_id: input.orgId,
        ...scope,
        age_group_key: trimOrNull(input.ageGroupKey),
        jurisdiction_key: trimOrNull(input.jurisdictionKey),
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
        source_key: "config",
        metadata: asMetadata(input.metadata),
        created_by: actor,
        updated_by: actor,
    });
    await insertTiers(supabase, input.orgId, rule.id, tiers);
    return { rule, tierCount: tiers.length };
}

export type RatioVersionInput = {
    orgId: string;
    priorId: string;
    effectiveStart: string;
    jurisdictionKey?: string | null;
    /** New tier set; when omitted the prior version's tiers are carried forward. */
    tiers?: RatioTierInput[];
    actorUserId?: string | null;
};

export async function createRatioRuleVersion(
    supabase: SupabaseClient,
    input: RatioVersionInput,
): Promise<{ row: ChildcareRatioRuleRow; priorId: string; priorCloseDate: string; tierCount: number }> {
    const orgId = input.orgId;
    let tierCount = 0;
    const result = await supersedeRow<ChildcareRatioRuleRow>(supabase, {
        table: RATIO,
        orgId,
        priorId: input.priorId,
        newStart: requireEffectiveStart(input.effectiveStart),
        actor: trimOrNull(input.actorUserId),
        valueColumns: (prior) => ({
            scope_type: prior.scope_type,
            site_location_id: prior.site_location_id,
            program_category_id: prior.program_category_id,
            room_location_id: prior.room_location_id,
            age_group_key: prior.age_group_key,
            jurisdiction_key:
                input.jurisdictionKey !== undefined ? trimOrNull(input.jurisdictionKey) : prior.jurisdiction_key,
        }),
        afterInsert: async (newId, prior) => {
            let tiers: { max_children: number; required_staff: number; sort_order: number }[];
            if (input.tiers && input.tiers.length > 0) {
                tiers = normalizeTiers(input.tiers);
            } else {
                const priorTiers = await listTiersForRule(supabase, orgId, prior.id);
                if (priorTiers.length === 0) fail("invalid_state", "prior ratio rule has no tiers to carry forward");
                tiers = priorTiers
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((t) => ({ max_children: t.max_children, required_staff: t.required_staff, sort_order: t.sort_order }));
            }
            tierCount = tiers.length;
            await insertTiers(supabase, orgId, newId, tiers);
        },
    });
    return { ...result, tierCount };
}

export function retireRatioRule(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; effectiveEnd: string; actorUserId?: string | null },
) {
    return retireRow<ChildcareRatioRuleRow>(supabase, {
        table: RATIO,
        orgId: input.orgId,
        id: input.id,
        effectiveEnd: input.effectiveEnd,
        actor: trimOrNull(input.actorUserId),
    });
}

export function voidScheduledRatioRule(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; todayYmd: string; actorUserId?: string | null },
) {
    const orgId = input.orgId;
    return voidScheduledRow<ChildcareRatioRuleRow>(supabase, {
        table: RATIO,
        orgId,
        id: input.id,
        todayYmd: input.todayYmd,
        actor: trimOrNull(input.actorUserId),
        sameLineage: (a, b) =>
            sameScope(a, b) &&
            (a.age_group_key ?? null) === (b.age_group_key ?? null) &&
            (a.jurisdiction_key ?? null) === (b.jurisdiction_key ?? null),
        beforeDelete: async (row) => {
            // Explicit tier cleanup (FK is ON DELETE CASCADE too; voiding stays self-contained).
            const { error } = await supabase.from(TIERS).delete().eq("org_id", orgId).eq("ratio_rule_id", row.id);
            if (error) fail("db_error", error.message);
        },
    });
}

// ===========================================================================
// Operating windows
// ===========================================================================

function normalizeTime(value: unknown, field: string): string {
    const v = trimOrNull(value);
    if (!v) fail("invalid_input", `${field} is required`);
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
    if (!m) fail("invalid_input", `${field} must be HH:MM or HH:MM:SS`);
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = m[3] ? Number(m[3]) : 0;
    if (hh > 23 || mm > 59 || ss > 59) fail("invalid_input", `${field} is not a valid time`);
    return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

function requireWeekday(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 6) fail("invalid_input", "weekday must be an integer 0-6 (Sunday=0)");
    return n;
}

export type CreateOperatingWindowInput = ScopeInput & {
    orgId: string;
    weekday: number;
    openTime: string;
    closeTime: string;
    effectiveStart: string;
    effectiveEnd?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

export async function createOperatingWindow(
    supabase: SupabaseClient,
    input: CreateOperatingWindowInput,
): Promise<ChildcareOperatingWindowRow> {
    const scope = buildScopeColumns(input);
    const effectiveStart = requireEffectiveStart(input.effectiveStart);
    const effectiveEnd = optionalEffectiveEnd(input.effectiveEnd, effectiveStart);
    const open = normalizeTime(input.openTime, "openTime");
    const close = normalizeTime(input.closeTime, "closeTime");
    if (close <= open) fail("validation_failed", "closeTime must be after openTime");
    const actor = trimOrNull(input.actorUserId);
    return insertRow<ChildcareOperatingWindowRow>(supabase, WINDOWS, {
        org_id: input.orgId,
        ...scope,
        weekday: requireWeekday(input.weekday),
        open_time: open,
        close_time: close,
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
        source_key: "config",
        metadata: asMetadata(input.metadata),
        created_by: actor,
        updated_by: actor,
    });
}

export type OperatingWindowVersionInput = {
    orgId: string;
    priorId: string;
    effectiveStart: string;
    openTime?: string | null;
    closeTime?: string | null;
    actorUserId?: string | null;
};

export async function createOperatingWindowVersion(supabase: SupabaseClient, input: OperatingWindowVersionInput) {
    return supersedeRow<ChildcareOperatingWindowRow>(supabase, {
        table: WINDOWS,
        orgId: input.orgId,
        priorId: input.priorId,
        newStart: requireEffectiveStart(input.effectiveStart),
        actor: trimOrNull(input.actorUserId),
        valueColumns: (prior) => {
            const open = input.openTime != null ? normalizeTime(input.openTime, "openTime") : prior.open_time;
            const close = input.closeTime != null ? normalizeTime(input.closeTime, "closeTime") : prior.close_time;
            if (close <= open) fail("validation_failed", "closeTime must be after openTime");
            return {
                scope_type: prior.scope_type,
                site_location_id: prior.site_location_id,
                program_category_id: prior.program_category_id,
                room_location_id: prior.room_location_id,
                weekday: prior.weekday,
                open_time: open,
                close_time: close,
            };
        },
    });
}

export function retireOperatingWindow(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; effectiveEnd: string; actorUserId?: string | null },
) {
    return retireRow<ChildcareOperatingWindowRow>(supabase, {
        table: WINDOWS,
        orgId: input.orgId,
        id: input.id,
        effectiveEnd: input.effectiveEnd,
        actor: trimOrNull(input.actorUserId),
    });
}

export function voidScheduledOperatingWindow(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; todayYmd: string; actorUserId?: string | null },
) {
    return voidScheduledRow<ChildcareOperatingWindowRow>(supabase, {
        table: WINDOWS,
        orgId: input.orgId,
        id: input.id,
        todayYmd: input.todayYmd,
        actor: trimOrNull(input.actorUserId),
        sameLineage: (a, b) => sameScope(a, b) && a.weekday === b.weekday,
    });
}

// ===========================================================================
// Schedule / eligibility rules
// ===========================================================================

function optionalStringArray(value: unknown): string[] | null {
    if (value == null) return null;
    if (!Array.isArray(value)) fail("invalid_input", "expected an array of strings");
    const out = value.map((v) => String(v).trim()).filter((v) => v.length > 0);
    return out.length > 0 ? out : null;
}

function optionalDays(value: unknown, field: string): number | null {
    if (value == null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 7) fail("invalid_input", `${field} must be an integer 0-7`);
    return n;
}

export type CreateScheduleRuleInput = ScopeInput & {
    orgId: string;
    ageGroupKey?: string | null;
    eligibleScheduleTypeKeys?: string[] | null;
    eligibleAgeGroupKeys?: string[] | null;
    minDaysPerWeek?: number | null;
    maxDaysPerWeek?: number | null;
    effectiveStart: string;
    effectiveEnd?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
};

function validateDaysOrder(min: number | null, max: number | null): void {
    if (min != null && max != null && max < min) {
        fail("validation_failed", "maxDaysPerWeek must be >= minDaysPerWeek");
    }
}

export async function createScheduleRule(
    supabase: SupabaseClient,
    input: CreateScheduleRuleInput,
): Promise<ChildcareScheduleRuleRow> {
    const scope = buildScopeColumns(input);
    const effectiveStart = requireEffectiveStart(input.effectiveStart);
    const effectiveEnd = optionalEffectiveEnd(input.effectiveEnd, effectiveStart);
    const min = optionalDays(input.minDaysPerWeek, "minDaysPerWeek");
    const max = optionalDays(input.maxDaysPerWeek, "maxDaysPerWeek");
    validateDaysOrder(min, max);
    const actor = trimOrNull(input.actorUserId);
    return insertRow<ChildcareScheduleRuleRow>(supabase, SCHEDULE, {
        org_id: input.orgId,
        ...scope,
        age_group_key: trimOrNull(input.ageGroupKey),
        eligible_schedule_type_keys: optionalStringArray(input.eligibleScheduleTypeKeys),
        eligible_age_group_keys: optionalStringArray(input.eligibleAgeGroupKeys),
        min_days_per_week: min,
        max_days_per_week: max,
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
        source_key: "config",
        metadata: asMetadata(input.metadata),
        created_by: actor,
        updated_by: actor,
    });
}

export type ScheduleRuleVersionInput = {
    orgId: string;
    priorId: string;
    effectiveStart: string;
    eligibleScheduleTypeKeys?: string[] | null;
    eligibleAgeGroupKeys?: string[] | null;
    minDaysPerWeek?: number | null;
    maxDaysPerWeek?: number | null;
    actorUserId?: string | null;
};

export async function createScheduleRuleVersion(supabase: SupabaseClient, input: ScheduleRuleVersionInput) {
    return supersedeRow<ChildcareScheduleRuleRow>(supabase, {
        table: SCHEDULE,
        orgId: input.orgId,
        priorId: input.priorId,
        newStart: requireEffectiveStart(input.effectiveStart),
        actor: trimOrNull(input.actorUserId),
        valueColumns: (prior) => {
            const min =
                input.minDaysPerWeek !== undefined ? optionalDays(input.minDaysPerWeek, "minDaysPerWeek") : prior.min_days_per_week;
            const max =
                input.maxDaysPerWeek !== undefined ? optionalDays(input.maxDaysPerWeek, "maxDaysPerWeek") : prior.max_days_per_week;
            validateDaysOrder(min, max);
            return {
                scope_type: prior.scope_type,
                site_location_id: prior.site_location_id,
                program_category_id: prior.program_category_id,
                room_location_id: prior.room_location_id,
                age_group_key: prior.age_group_key,
                eligible_schedule_type_keys:
                    input.eligibleScheduleTypeKeys !== undefined
                        ? optionalStringArray(input.eligibleScheduleTypeKeys)
                        : prior.eligible_schedule_type_keys,
                eligible_age_group_keys:
                    input.eligibleAgeGroupKeys !== undefined
                        ? optionalStringArray(input.eligibleAgeGroupKeys)
                        : prior.eligible_age_group_keys,
                min_days_per_week: min,
                max_days_per_week: max,
            };
        },
    });
}

export function retireScheduleRule(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; effectiveEnd: string; actorUserId?: string | null },
) {
    return retireRow<ChildcareScheduleRuleRow>(supabase, {
        table: SCHEDULE,
        orgId: input.orgId,
        id: input.id,
        effectiveEnd: input.effectiveEnd,
        actor: trimOrNull(input.actorUserId),
    });
}

export function voidScheduledScheduleRule(
    supabase: SupabaseClient,
    input: { orgId: string; id: string; todayYmd: string; actorUserId?: string | null },
) {
    return voidScheduledRow<ChildcareScheduleRuleRow>(supabase, {
        table: SCHEDULE,
        orgId: input.orgId,
        id: input.id,
        todayYmd: input.todayYmd,
        actor: trimOrNull(input.actorUserId),
        sameLineage: (a, b) => sameScope(a, b) && (a.age_group_key ?? null) === (b.age_group_key ?? null),
    });
}
