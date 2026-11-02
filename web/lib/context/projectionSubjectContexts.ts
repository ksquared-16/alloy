/**
 * DOMAIN-PROJECTION MEMBERSHIP FOR ONE SUBJECT — Billing and Assignments as process contexts.
 *
 * A `domain_projection` process has no participations and no stages, so `buildSubjectProcessContexts`
 * — which reads `process_instances` — can never see it, and the subject's record offered no way into
 * Billing or Assignments at all. That is an integration gap, not a licence to invent participations:
 * nothing here writes or fabricates a row.
 *
 * ── NO SECOND RESOLVER ──
 *
 * Membership is read from THE cohort reader (`loadDomainProjectionCohort`) — the same one a Work View's
 * counts and rows read, so a destination offered here is a row that view will render. It already applies
 * the domain's own capability gate (Billing needs `fin.read`; a refusal is `projection_forbidden`) and the
 * site scope. Which grains a projection holds is the published catalog's (`DOMAIN_PROJECTION_CATALOG`);
 * where its views are hosted is the projection host key. This module only asks "is THIS subject a row".
 *
 * ── GRAIN: THE PROCESS'S OWN CHILD GRAIN, ELSE THE CHILD'S OWN FAMILY ──
 *
 * A process that declares a child grain on any of its projections (Assignments) is matched at child
 * grain only — a child absent from those cohorts is absent, and its household is never substituted.
 * A process that declares none (Billing is household-only) is matched at the child's OWN household:
 * the one `customer_members` row belongs to, never another family. No household ⇒ no membership.
 *
 * ── NOTHING PROVEN, NOTHING SHOWN ──
 *
 * A context is emitted only with at least one membership. Naming "Billing" for a child the operator
 * cannot see in any Billing view would itself disclose something, and a projection process has no
 * stage to fall back on, so there is nothing truthful to offer without a row.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { DOMAIN_PROJECTION_CATALOG } from "@/lib/businessProcesses/projections/domainProjectionCatalog";
import { domainProjectionHostWorkUnitKey } from "@/lib/businessProcesses/projections/domainProjectionHost";
import { domainProjectionRowId } from "@/lib/businessProcesses/projections/domainProjectionIdentity";
import {
    domainProjectionScopeFromAccess,
    loadDomainProjectionCohort,
} from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionSubjectType } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import type { SubjectContext, SubjectOperationalMembershipRef } from "@/lib/context/subjectContextTypes";
import type { ProcessProjectionDomain } from "@/lib/lifecycle/processModelV1";
import type {
    SearchConfiguredProcess,
    SearchProcessConfiguration,
} from "@/lib/search/searchProcessConfiguration";

/** The child whose record is open. `householdId` is its own `customer_members.customer_id`. */
export type ProjectionChildSubject = { memberId: string; householdId: string | null };

/** The row this subject would be in a projection of this process, or null when it can be none. */
export type ProjectionMembershipTarget = { type: Extract<DomainProjectionSubjectType, "child" | "household">; id: string };

/** Durable host entity type per projection grain — what the Focus Panel composes for that row. */
const HOST_ENTITY_TYPE: Record<ProjectionMembershipTarget["type"], string> = {
    child: "customer_members",
    household: "customers",
};

/** Does any projection this process's visible views name declare a CHILD grain? */
export function projectionProcessOffersChildGrain(process: SearchConfiguredProcess, domain: ProcessProjectionDomain): boolean {
    return projectionViews(process, domain).some((v) => v.subjectTypes.includes("child"));
}

/** Which row identity the child is matched as for this process — child grain, else its own household. */
export function projectionMembershipTarget(
    process: SearchConfiguredProcess,
    domain: ProcessProjectionDomain,
    subject: ProjectionChildSubject,
): ProjectionMembershipTarget | null {
    const memberId = subject.memberId.trim();
    if (!memberId) return null;
    if (projectionProcessOffersChildGrain(process, domain)) return { type: "child", id: memberId };
    const householdId = (subject.householdId ?? "").trim();
    return householdId ? { type: "household", id: householdId } : null;
}

/** The process's visible views that name a registered projection, with that projection's grains. */
function projectionViews(process: SearchConfiguredProcess, domain: ProcessProjectionDomain) {
    const catalog = DOMAIN_PROJECTION_CATALOG[domain] ?? [];
    const out: Array<{ id: string; label: string; projectionKey: string; subjectTypes: readonly DomainProjectionSubjectType[] }> = [];
    for (const view of process.work_views) {
        if (view.visible_in_runtime === false) continue;
        const projectionKey = String((view as { projection_key?: unknown }).projection_key ?? "").trim();
        const entry = catalog.find((c) => c.key === projectionKey);
        if (!entry) continue;
        out.push({ id: view.id, label: String(view.label ?? "").trim() || entry.label, projectionKey, subjectTypes: entry.subjectTypes });
    }
    return out;
}

/**
 * Every domain-projection process context this child holds, for the record host.
 *
 * Cohorts are read once per projection key and in parallel; a refused or failed cohort contributes
 * nothing (never an error the record has to carry — a context is enrichment).
 */
export async function loadProjectionSubjectContexts(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null;
    dimensions: AdminAccessScopeDimensions;
    processConfig: SearchProcessConfiguration;
    subject: ProjectionChildSubject;
    loadCohort?: typeof loadDomainProjectionCohort;
}): Promise<SubjectContext[]> {
    const loadCohort = params.loadCohort ?? loadDomainProjectionCohort;
    const scope = domainProjectionScopeFromAccess(params.dimensions);
    const contexts: SubjectContext[] = [];

    for (const process of params.processConfig.byKey.values()) {
        const domain = process.projection_domain ?? null;
        if (!domain || !process.operator_has_access) continue;
        const target = projectionMembershipTarget(process, domain, params.subject);
        if (!target) continue;
        const targetRowId = domainProjectionRowId({ subject: target });

        // Only views whose projection can hold this grain are read at all.
        const views = projectionViews(process, domain).filter((v) => v.subjectTypes.includes(target.type));
        const cohorts = new Map<string, ReturnType<typeof loadCohort>>();
        const settled = await Promise.all(
            views.map(async (view) => {
                let pending = cohorts.get(view.projectionKey);
                if (!pending) {
                    pending = loadCohort(params.supabase, {
                        domain,
                        projectionKey: view.projectionKey,
                        orgId: params.orgId,
                        userId: params.userId,
                        scope,
                    }).catch(() => ({ status: "refused", code: "projection_unavailable", message: "" }) as const);
                    cohorts.set(view.projectionKey, pending);
                }
                const cohort = await pending;
                if (cohort.status !== "ok") return null;
                return cohort.rows.some((r) => domainProjectionRowId(r) === targetRowId) ? view : null;
            }),
        );

        const memberships: SubjectOperationalMembershipRef[] = settled
            .filter((v): v is NonNullable<typeof v> => Boolean(v))
            .map((view) => ({
                work_view_id: view.id,
                label: view.label,
                row_grain: target.type === "child" ? "child" : "family",
                host_work_unit_key: domainProjectionHostWorkUnitKey(process.department_id),
                host_entity_id: target.id,
                host_entity_type: HOST_ENTITY_TYPE[target.type],
                // The projection's own row identity — what the projection answer selects on.
                operational_member_id: targetRowId,
            }));
        if (!memberships.length) continue;

        contexts.push({
            kind: "process",
            key: process.key,
            label: process.label,
            detail: memberships.map((m) => m.label).join(" · "),
            operational_memberships: memberships,
            projection_domain: domain,
        });
    }
    return contexts;
}
