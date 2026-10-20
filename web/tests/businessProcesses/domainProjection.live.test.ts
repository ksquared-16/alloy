/**
 * BP V2 Slice 2 — LIVE: the two registered projections over REAL data on the local certification stack
 * (Northwind fixture org). Read-only by construction (the adapters only SELECT); nothing is written.
 *
 * Runs only when BPV2_LIVE_SUPABASE_URL / BPV2_LIVE_SERVICE_KEY are set. Writes its measurements to
 * BPV2_LIVE_EVIDENCE (JSON) so they can be compared against an independent SQL count.
 */

import { writeFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import { loadCurrentAssignments } from "@/lib/businessProcesses/projections/currentAssignmentsProjection";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const STRANGER = "99999999-9999-4999-8999-999999999999";
const live = Boolean(URL_ && KEY);

describe.skipIf(!live)("live — registered projections over real certification data", () => {
    const supabase = live ? createClient(URL_!, KEY!, { auth: { persistSession: false } }) : (null as never);
    const evidence: Record<string, unknown> = { org: ORG, at: new Date().toISOString() };
    const ALL = { siteScope: "all" as const, allowedSiteLocationIds: [] as string[] };

    it("Assignments: child and staff-person rows, one per subject, total === rows; restricted scope narrows", async () => {
        const c = await loadDomainProjectionCohort(supabase, { domain: "assignments", projectionKey: "current_assignments", orgId: ORG, userId: ADMIN, scope: ALL });
        expect(c.status).toBe("ok");
        if (c.status !== "ok") return;
        expect(c.total).toBe(c.rows.length);
        expect(new Set(c.rows.map((r) => `${r.subject.type}:${r.subject.id}`)).size).toBe(c.rows.length);
        expect(c.rows.every((r) => r.subject.type === "child" || r.subject.type === "person")).toBe(true);
        const sites = [...new Set(c.rows.map((r) => r.siteLocationId).filter(Boolean))] as string[];
        const oneSite = sites[0] ?? null;
        const restricted = oneSite
            ? await loadDomainProjectionCohort(supabase, { domain: "assignments", projectionKey: "current_assignments", orgId: ORG, userId: ADMIN, scope: { siteScope: "restricted", allowedSiteLocationIds: [oneSite] } })
            : null;
        if (restricted && restricted.status === "ok") {
            expect(restricted.rows.every((r) => r.siteLocationId === oneSite)).toBe(true);
            expect(restricted.rows.length).toBeLessThanOrEqual(c.rows.length);
        }
        // Small page size: the same cohort through many pages.
        const paged = await loadCurrentAssignments(supabase, { orgId: ORG, userId: ADMIN, scope: ALL }, { pageSize: 13 });
        expect(paged.ok && paged.rows.length).toBe(c.rows.length);
        evidence.assignments = {
            total: c.total,
            truncated: c.truncated,
            by_grain: { child: c.rows.filter((r) => r.subject.type === "child").length, person: c.rows.filter((r) => r.subject.type === "person").length },
            source_facts: c.rows.reduce((n, r) => n + r.source.count, 0),
            restricted_site: oneSite,
            restricted_total: restricted && restricted.status === "ok" ? restricted.total : null,
            paged_13_total: paged.ok ? paged.rows.length : null,
            sample: c.rows.slice(0, 3).map((r) => ({ subject: r.subject, source: r.source })),
        };
    });

    it("Billing: household rows behind fin.read; financial identity kept apart from the household", async () => {
        const allowed = await loadDomainProjectionCohort(supabase, { domain: "billing", projectionKey: "charges_needing_review", orgId: ORG, userId: ADMIN, scope: ALL });
        const denied = await loadDomainProjectionCohort(supabase, { domain: "billing", projectionKey: "charges_needing_review", orgId: ORG, userId: STRANGER, scope: ALL });
        expect(denied).toMatchObject({ status: "refused", code: "projection_forbidden" });
        evidence.billing_denied = denied;
        expect(allowed.status).toBe("ok");
        if (allowed.status !== "ok") return;
        expect(allowed.rows.every((r) => r.subject.type === "household" && r.source.kind === "charge" && r.source.id !== r.subject.id)).toBe(true);
        evidence.billing = {
            total: allowed.total,
            truncated: allowed.truncated,
            source_facts: allowed.rows.reduce((n, r) => n + r.source.count, 0),
            sample: allowed.rows.slice(0, 3).map((r) => ({ subject: r.subject, source: r.source })),
        };
        if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
    });
});
