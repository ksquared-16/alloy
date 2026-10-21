/**
 * ASSIGNMENT WRITE SITE AUTHORITY — which sites a command touches, resolved from authoritative rows.
 *
 * A restricted operator holds a real subset of sites. Hiding a record from them is not a boundary: a
 * command can be called by any caller (a card, BOS, automation, a direct API request), so the command
 * itself must refuse to write where its actor has no authority. This module answers, for one
 * `assignment.*` / `schedule.create` invocation, the set of sites the write would touch — read from the
 * database, never from the caller's word:
 *
 *   - an existing assignment row → that row's `site_location_id` (archive, set_time, delete/promote a
 *     proposed row, the row a replacement supersedes, the row a primary change promotes);
 *   - a committed child target → the enrollment agreement's site (the writer ignores a supplied site);
 *   - a proposed child or staff target → the supplied site IS the target the writer will use, so it is
 *     authorized as given;
 *   - a staff primary change → the target site AND every site where the person holds a live primary the
 *     writer may close;
 *   - a participation draft (no row) → the site of the child's enrollment participation it is cleared at.
 *
 * The verdict follows the Coverage doctrine (`staffCoverageAuthorization`): a missing scope is a trusted
 * internal path; `siteScope !== "restricted"` writes anywhere in the org; a restricted actor may write only
 * where EVERY touched site is held. Unresolvable references refuse a restricted actor (fail closed) and
 * are left to the writer's own not-found for an unrestricted one. Org scope needs no decision here: every
 * read is org-qualified, so a foreign id resolves to nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { isProposedDraftAssignmentId, customerMemberIdFromProposedDraftAssignmentId } from "@/lib/scheduling/projection/proposedDraftAssignmentId";

export type AssignmentWriteSiteResolution =
    | { kind: "sites"; sites: string[] }
    /** A referenced record does not resolve in this org. */
    | { kind: "unresolved"; reason: string };

export type AssignmentSiteVerdict =
    | { allowed: true }
    | { allowed: false; code: "site_out_of_scope" | "site_unresolved"; message: string };

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const ACTIVE_PRIMARY_EXCLUDED = ["ended", "canceled", "cancelled", "superseded", "archived"];

export function isSiteRestricted(accessScope: AdminAccessScopeDimensions | null | undefined): boolean {
    return Boolean(accessScope && accessScope.siteScope === "restricted");
}

export function assignmentSiteWriteVerdict(
    accessScope: AdminAccessScopeDimensions | null | undefined,
    resolution: AssignmentWriteSiteResolution,
): AssignmentSiteVerdict {
    if (!isSiteRestricted(accessScope)) return { allowed: true };
    if (resolution.kind === "unresolved") {
        return { allowed: false, code: "site_unresolved", message: "This assignment change cannot be authorized for your sites." };
    }
    const sites = [...new Set(resolution.sites.map((s) => s.trim()))];
    if (sites.length === 0 || sites.some((s) => !s)) {
        return { allowed: false, code: "site_unresolved", message: "This assignment change does not name a site you can be authorized for." };
    }
    const held = new Set((accessScope!.allowedSiteLocationIds ?? []).map(String));
    return sites.every((s) => held.has(s))
        ? { allowed: true }
        : { allowed: false, code: "site_out_of_scope", message: "You do not have access to that site, so this assignment cannot be changed there." };
}

async function rowSites(supabase: SupabaseClient, orgId: string, ids: string[]): Promise<string[] | null> {
    const wanted = [...new Set(ids.map(t).filter(Boolean))];
    if (wanted.length === 0) return [];
    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("id, site_location_id")
        .eq("org_id", orgId)
        .in("id", wanted);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; site_location_id: string | null }>;
    if (rows.length !== wanted.length) return null;
    return rows.map((r) => t(r.site_location_id));
}

async function agreementSite(supabase: SupabaseClient, orgId: string, agreementId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("site_location_id")
        .eq("org_id", orgId)
        .eq("id", agreementId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? t((data as { site_location_id: string | null }).site_location_id) : null;
}

async function staffLivePrimarySites(supabase: SupabaseClient, orgId: string, personId: string, onOrAfter: string): Promise<string[]> {
    let q = supabase
        .from("schedule_assignments")
        .select("site_location_id, end_date, status")
        .eq("org_id", orgId)
        .eq("subject_type", "staff")
        .eq("subject_person_id", personId)
        .eq("is_primary", true);
    if (onOrAfter) q = q.or(`end_date.is.null,end_date.gte.${onOrAfter}`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ site_location_id: string | null; status: string }>)
        .filter((r) => !ACTIVE_PRIMARY_EXCLUDED.includes(String(r.status)))
        .map((r) => t(r.site_location_id));
}

/** The site of the child's newest enrollment participation (`process_instances.metadata.location_id`). */
async function participationSite(supabase: SupabaseClient, orgId: string, memberId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from("process_instances")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", memberId)
        .order("created_at", { ascending: false })
        .limit(1);
    if (error) throw new Error(error.message);
    const meta = ((data ?? [])[0] as { metadata?: Record<string, unknown> | null } | undefined)?.metadata ?? null;
    return t(meta?.location_id) || null;
}

/** Combine the parts of one resolution: any unresolved part makes the whole unresolved. */
function sitesOf(parts: Array<string[] | string | null>, reason: string): AssignmentWriteSiteResolution {
    const sites: string[] = [];
    for (const p of parts) {
        if (p === null) return { kind: "unresolved", reason };
        if (Array.isArray(p)) sites.push(...p);
        else sites.push(p);
    }
    return { kind: "sites", sites };
}

/** The target of a create / replacement: the agreement's site when committed, otherwise the supplied site. */
async function targetSite(supabase: SupabaseClient, orgId: string, payload: Record<string, unknown>): Promise<string | null> {
    const agreementId = t(payload.enrollment_agreement_id);
    if (agreementId) return agreementSite(supabase, orgId, agreementId);
    return t(payload.site_location_id) || null;
}

export type AssignmentCommandSiteInput = {
    supabase: SupabaseClient;
    orgId: string;
    accessScope: AdminAccessScopeDimensions | null | undefined;
    actionKey: string;
    entityId: string;
    payload: Record<string, unknown>;
};

/** Every site the named command would write, read from authoritative rows. */
export async function resolveAssignmentCommandSites(input: AssignmentCommandSiteInput): Promise<AssignmentWriteSiteResolution> {
    const { supabase, orgId, payload, entityId } = input;
    switch (input.actionKey) {
        case "assignment.create":
        case "assignment.change_room": {
            const supersedes =
                input.actionKey === "assignment.change_room"
                    ? t(payload.supersedes_assignment_id) || t(payload.assignment_id)
                    : t(payload.supersedes_assignment_id);
            return sitesOf(
                [await targetSite(supabase, orgId, payload), supersedes ? await rowSites(supabase, orgId, [supersedes]) : []],
                "The assignment's site or the assignment it replaces could not be resolved.",
            );
        }
        case "assignment.set_primary": {
            const subjectType = t(payload.subject_type);
            const promote = t(payload.promote_assignment_id);
            const promoted = promote ? await rowSites(supabase, orgId, [promote]) : [];
            if (subjectType === "child") {
                const agreementId = t(payload.enrollment_agreement_id);
                return sitesOf([agreementId ? await agreementSite(supabase, orgId, agreementId) : null, promoted], "The enrollment agreement could not be resolved.");
            }
            const personId = t(payload.person_id) || entityId;
            const closes = personId ? await staffLivePrimarySites(supabase, orgId, personId, t(payload.effective_date)) : [];
            return sitesOf([t(payload.site_location_id) || null, promoted, closes], "The staff primary's site could not be resolved.");
        }
        case "assignment.archive":
        case "assignment.set_time":
            return sitesOf([await rowSites(supabase, orgId, [t(payload.assignment_id) || entityId])], "The assignment could not be resolved.");
        case "assignment.promote_proposed": {
            const agreementId = t(payload.enrollment_agreement_id);
            return sitesOf(
                [await rowSites(supabase, orgId, [t(payload.assignment_id) || entityId]), agreementId ? await agreementSite(supabase, orgId, agreementId) : []],
                "The proposed assignment or its agreement could not be resolved.",
            );
        }
        case "assignment.delete_proposed": {
            const assignmentId = t(payload.assignment_id) || entityId;
            if (isProposedDraftAssignmentId(assignmentId)) {
                const memberId = customerMemberIdFromProposedDraftAssignmentId(assignmentId) || t(entityId);
                if (!memberId) return { kind: "unresolved", reason: "The child for this proposed schedule could not be resolved." };
                // The draft lives on the child's enrollment participation and is cleared AT its site (the
                // same lookup `applyChildParticipationEdit` makes). Record reachability is not site authority:
                // a child is reachable through its household's case, which may sit at another site.
                const site = await participationSite(supabase, orgId, memberId);
                return sitesOf([site], "The proposed schedule's site could not be resolved.");
            }
            return sitesOf([await rowSites(supabase, orgId, [assignmentId])], "The proposed assignment could not be resolved.");
        }
        case "schedule.create": {
            const agreementId = t(payload.enrollment_agreement_id);
            return sitesOf([agreementId ? await agreementSite(supabase, orgId, agreementId) : null], "The enrollment agreement could not be resolved.");
        }
        default:
            return { kind: "unresolved", reason: `No site authority is declared for ${input.actionKey}.` };
    }
}

/** Resolve and decide in one call. Unrestricted actors are never charged the reads. */
export async function authorizeAssignmentCommandSites(input: AssignmentCommandSiteInput): Promise<AssignmentSiteVerdict> {
    if (!isSiteRestricted(input.accessScope)) return { allowed: true };
    return assignmentSiteWriteVerdict(input.accessScope, await resolveAssignmentCommandSites(input));
}
