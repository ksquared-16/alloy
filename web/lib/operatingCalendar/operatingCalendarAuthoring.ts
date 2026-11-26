/**
 * Authoring an Operating Calendar entry: authority, zone, lineage checks, then
 * the ONE ledger intake. Nothing here writes outside `author_operational_expectation`.
 *
 * ── AUTHORITY ──
 *
 * An Operating Calendar entry changes when a location operates — for Attendance,
 * Tours and every future consumer — so it is organization settings authority
 * (`settings.manage`), not Tours or Attendance authority. The scope adds to it:
 *
 *   organization default  → `settings.manage` AND unrestricted site scope
 *   location entry        → `settings.manage` AND that site inside the caller's scope
 *
 * A location-scoped administrator therefore sees an inherited organization entry
 * but cannot edit it; they can add a location exception for their own site.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchOperationalTimezoneForOrg } from "@/lib/admin/timezoneContract";
import { resolveLocationTimezone } from "@/lib/location/timezoneResolution";
import { locationAllowedUnderSiteScope, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import type { AuthoringGateway } from "@/lib/operationalExpectations/intake/authoringGateway";
import type { AuthoringInput, AuthoringResult } from "@/lib/operationalExpectations/intake/authoringTypes";
import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { primaryExpectationSubjectId } from "@/lib/operationalExpectations/query/expectationSubjectRef";
import {
    completeExpectationLineages,
    EXPECTATION_SELECT,
} from "@/lib/operationalExpectations/query/supabaseExpectationQueryGateway";
import {
    effectForPredicate,
    OPERATING_CALENDAR_PURPOSE,
    OPERATING_CALENDAR_SUBJECT_KINDS,
    type OperatingCalendarEntryDraft,
    type OperatingCalendarParams,
    type OperatingCalendarScope,
} from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import {
    checkWallTimesExist,
    createCalendarEntry,
    reviseCalendarEntry,
    withdrawCalendarEntry,
} from "@/lib/operatingCalendar/operatingCalendarCommands";
import { localDateOf } from "@/lib/operatingCalendar/operatingCalendarTime";
import { hasOperatingCalendarCapability } from "@/lib/access/operatingCalendarAuthority";

export type CalendarAccess = {
    permissionKeys?: readonly string[] | null;
    dim: AdminAccessScopeDimensions;
};

/** May this caller author at this scope? Organization needs unrestricted site scope. */
export async function canAuthorCalendarScope(
    supabase: SupabaseClient,
    orgId: string,
    access: CalendarAccess,
    scope: OperatingCalendarScope,
    siteId: string | null,
): Promise<boolean> {
    if (!hasOperatingCalendarCapability(access)) return false;
    if (scope === "organization") return access.dim.siteScope === "all";
    if (!siteId) return false;
    return locationAllowedUnderSiteScope(supabase, orgId, access.dim, siteId);
}

export type CalendarAuthoringAction = "create" | "revise" | "withdraw" | "restore";

export type CalendarAuthoringRefusal = { status: "refused"; httpStatus: 400 | 403 | 404 | 409; code: string; message: string; field?: string };

export type PreparedCalendarAct = {
    status: "prepared";
    input: AuthoringInput;
    draft: OperatingCalendarEntryDraft;
    timezone: string;
    siteId: string | null;
    /** The lineage root, for a revision. Null on create. */
    lineageRootId: string | null;
    /** The dates the entry covered before this act (a revision can shrink or move them). */
    priorFromDate: string | null;
    priorToDate: string | null;
};

function refuse(httpStatus: CalendarAuthoringRefusal["httpStatus"], code: string, message: string, field?: string): CalendarAuthoringRefusal {
    return { status: "refused", httpStatus, code, message, field };
}

/** The site row behind a location entry: same org, a site, not archived. */
async function loadSite(supabase: SupabaseClient, orgId: string, locationId: string) {
    const { data, error } = await supabase
        .from("locations")
        .select("id, label, location_type, archived_at")
        .eq("org_id", orgId)
        .eq("id", locationId)
        .maybeSingle();
    if (error) throw new Error(`operating calendar: location read failed: ${error.message}`);
    return data as { id: string; label: string | null; location_type: string | null; archived_at: string | null } | null;
}

/** The zone an entry's dates are in. Never UTC by default, never the browser's. */
async function zoneForScope(
    supabase: SupabaseClient,
    orgId: string,
    scope: OperatingCalendarScope,
    siteId: string | null,
): Promise<string | null> {
    if (scope === "organization") {
        const org = await fetchOperationalTimezoneForOrg(supabase, orgId);
        return org.source === "utc_fallback" ? null : org.iana;
    }
    const tz = await resolveLocationTimezone(supabase, orgId, String(siteId));
    return tz.status === "resolved" ? tz.timezone : null;
}

function draftFromParams(
    params: Partial<OperatingCalendarParams>,
    scope: OperatingCalendarScope,
    siteId: string | null,
): OperatingCalendarEntryDraft {
    return {
        scope,
        locationId: scope === "location" ? siteId : null,
        name: String(params.name ?? ""),
        designation: (params.designation ?? "other") as OperatingCalendarEntryDraft["designation"],
        effect: (params.effect ?? "none") as OperatingCalendarEntryDraft["effect"],
        fromDate: String(params.from_date ?? ""),
        toDate: String(params.to_date ?? ""),
        startTime: params.start_time ?? null,
        endTime: params.end_time ?? null,
        reasonKey: (params.reason_key ?? null) as OperatingCalendarEntryDraft["reasonKey"],
        note: params.note ?? null,
    };
}

function paramsOf(row: ExpectationQueryRow): Partial<OperatingCalendarParams> {
    const p = (row.condition as Record<string, unknown> | null)?.params;
    return p && typeof p === "object" ? (p as Partial<OperatingCalendarParams>) : {};
}

function predicateOf(row: ExpectationQueryRow): string {
    const c = (row.condition ?? {}) as Record<string, unknown>;
    return String(c.predicateShape ?? c.predicate_shape ?? "");
}

/** Load an entry's lineage, in this org, by any of its act ids. */
export async function loadCalendarLineage(
    supabase: SupabaseClient,
    orgId: string,
    entryId: string,
): Promise<ExpectationQueryRow[] | null> {
    const { data, error } = await supabase
        .from("operational_expectations")
        .select(EXPECTATION_SELECT)
        .eq("org_id", orgId)
        .eq("id", entryId)
        .maybeSingle();
    if (error) throw new Error(`operating calendar: entry read failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as ExpectationQueryRow;
    const c = (row.condition ?? {}) as Record<string, unknown>;
    if ((c.typeKey ?? c.type_key) !== OPERATING_CALENDAR_PURPOSE) return null;
    const rows = await completeExpectationLineages(supabase, orgId, [row]);
    return rows.sort((a, b) => Date.parse(a.authored_at) - Date.parse(b.authored_at) || (a.id < b.id ? -1 : 1));
}

/**
 * Build the act an operator asked for, after every check that can refuse it.
 * Writes nothing. The same preparation backs the impact preview and the commit,
 * so the preview shows exactly what the commit will author.
 */
export async function prepareCalendarAct(params: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    access: CalendarAccess;
    action: CalendarAuthoringAction;
    /** Required for create and revise. */
    draft?: OperatingCalendarEntryDraft | null;
    /** The act being changed — must be its lineage's latest act. Required unless create. */
    entryId?: string | null;
    idempotencyKey: string;
}): Promise<PreparedCalendarAct | CalendarAuthoringRefusal> {
    const { supabase, orgId, action } = params;

    let lineage: ExpectationQueryRow[] | null = null;
    let latest: ExpectationQueryRow | null = null;
    if (action !== "create") {
        if (!params.entryId) return refuse(400, "missing_entry", "Name the entry to change.", "entry_id");
        lineage = await loadCalendarLineage(supabase, orgId, params.entryId);
        if (!lineage || lineage.length === 0) return refuse(404, "entry_not_found", "That calendar entry does not exist.");
        latest = lineage[lineage.length - 1]!;
        if (latest.id !== params.entryId) {
            return refuse(409, "entry_changed", "This entry changed since it was opened. Reload and try again.");
        }
    }

    // Scope is fixed for a lineage: the ledger refuses a revision about another subject.
    let scope: OperatingCalendarScope;
    let siteId: string | null;
    if (latest) {
        scope = latest.subject_kind === OPERATING_CALENDAR_SUBJECT_KINDS.organization ? "organization" : "location";
        siteId = scope === "location" ? primaryExpectationSubjectId(latest.subject_ref) : null;
        if (params.draft && (params.draft.scope !== scope || (scope === "location" && params.draft.locationId !== siteId))) {
            return refuse(409, "scope_fixed", "An entry keeps its scope. Withdraw it and add a new one instead.", "scope");
        }
    } else {
        if (!params.draft) return refuse(400, "missing_entry", "Describe the entry.");
        scope = params.draft.scope;
        siteId = params.draft.locationId;
    }

    if (scope === "location") {
        const site = await loadSite(supabase, orgId, String(siteId));
        if (!site) return refuse(404, "location_not_found", "That location does not exist.");
        if (site.location_type !== "site") {
            return refuse(400, "not_a_site", "Calendar entries belong to a location (site), not a room or address.", "location_id");
        }
        if (site.archived_at && action === "create") return refuse(409, "location_archived", "That location is archived.");
    }

    if (!(await canAuthorCalendarScope(supabase, orgId, params.access, scope, siteId))) {
        return refuse(
            403,
            "forbidden",
            scope === "organization"
                ? "Changing organization calendar defaults needs organization settings access for every location."
                : "Changing this location's calendar needs organization settings access for this location.",
        );
    }

    const timezone = await zoneForScope(supabase, orgId, scope, siteId);
    if (!timezone) {
        return refuse(
            409,
            "timezone_unresolved",
            scope === "organization"
                ? "Set the organization's time zone before adding organization calendar entries."
                : "Set this location's time zone (or the organization's) before adding calendar entries.",
        );
    }

    const common = { idempotencyKey: params.idempotencyKey, actorUserId: params.actorUserId, orgId, timezone };
    let draft: OperatingCalendarEntryDraft;
    let input: AuthoringInput;

    if (action === "create") {
        draft = params.draft!;
        input = createCalendarEntry(draft, common);
    } else {
        const prior = latest!;
        const priorEffect = effectForPredicate(predicateOf(prior));
        const priorZone = String(paramsOf(prior).timezone || timezone);
        const predecessor = { id: prior.id, frameFromDate: localDateOf(new Date(prior.valid_from), priorZone) };
        if (action === "revise") {
            if (priorEffect === "withdrawn") {
                return refuse(409, "entry_withdrawn", "This entry was withdrawn. Restore it before editing.");
            }
            if (!params.draft) return refuse(400, "missing_entry", "Describe the change.");
            draft = params.draft;
            input = reviseCalendarEntry(draft, common, predecessor);
        } else if (action === "withdraw") {
            if (priorEffect === "withdrawn") return refuse(409, "entry_withdrawn", "This entry is already withdrawn.");
            draft = draftFromParams(paramsOf(prior), scope, siteId);
            input = withdrawCalendarEntry(draft, common, predecessor);
        } else {
            if (priorEffect !== "withdrawn") return refuse(409, "entry_active", "This entry is already in effect.");
            draft = draftFromParams(paramsOf(prior), scope, siteId);
            input = reviseCalendarEntry(draft, common, predecessor);
        }
    }

    const dst = checkWallTimesExist(draft, timezone);
    if (dst) return refuse(400, "time_does_not_exist", dst.message, dst.field);

    return {
        status: "prepared",
        input,
        draft,
        timezone,
        siteId,
        lineageRootId: latest ? latest.lineage_root_id ?? latest.id : null,
        priorFromDate: latest ? String(paramsOf(latest).from_date ?? "") || null : null,
        priorToDate: latest ? String(paramsOf(latest).to_date ?? "") || null : null,
    };
}

/** Commit a prepared act through the one ledger intake. */
export async function commitCalendarAct(
    prepared: PreparedCalendarAct,
    ctx: { orgId: string; actorUserId: string },
    gateway?: AuthoringGateway,
): Promise<AuthoringResult> {
    return authorOperationalExpectation(
        prepared.input,
        { orgId: ctx.orgId, actorUserId: ctx.actorUserId, actorLabel: null, actorAuthenticated: true },
        gateway ?? createSupabaseAuthoringGateway(createAdminClient(), OPERATING_CALENDAR_PURPOSE),
    );
}

/**
 * The act as a ledger row that was never written — for the impact preview only.
 * It resolves exactly as the committed row will, because it IS the same tuple.
 */
export function hypotheticalRowFor(prepared: PreparedCalendarAct, orgId: string): ExpectationQueryRow {
    const i = prepared.input;
    const id = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
    const subject = i.subjects[0]!;
    return {
        id,
        org_id: orgId,
        lineage_root_id: prepared.lineageRootId,
        supersedes_expectation_id: i.predecessorId ?? null,
        verb: i.verb,
        transition_type: i.verb === "revise" ? "revision" : null,
        modality: i.modality,
        author_class: "human",
        authority_key: i.authority.authorityKey,
        standing: "proposed",
        subject_kind: subject.kind,
        subject_ref: i.subjects,
        condition: i.condition as unknown as Record<string, unknown>,
        valid_from: i.temporalFrame.validFrom,
        valid_to: i.temporalFrame.validTo ?? null,
        authored_at: new Date(Date.now() + 1000).toISOString(),
    };
}
