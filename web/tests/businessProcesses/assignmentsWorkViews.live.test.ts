/**
 * BP V2 Slice 3 — LIVE: the five Assignments projections over real local-certification data (Northwind),
 * all sites and each site, plus a selection outside a restricted actor's sites. Read-only. Writes its
 * measurements to BPV2_LIVE_EVIDENCE for comparison against independent SQL.
 */
import { writeFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import type { DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const ORG = "00000000-0000-4000-8000-000000000001";
const SITES = ["00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000000011"];
const KEYS = ["current_assignments", "assignments_ending_soon", "assignments_upcoming_changes", "schedule_gaps", "assignments_proposed_incomplete"];
const live = Boolean(URL_ && KEY);

describe.skipIf(!live)("live — five Assignments projections over real certification data", () => {
    it("each projection: total === rows (people), facts counted apart, location narrows rows and totals together", async () => {
        const supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const evidence: Record<string, unknown> = { org: ORG, today: await resolveOperationalEnrollmentTodayYmd(supabase, ORG), at: new Date().toISOString(), views: {} };
        for (const key of KEYS) {
            const run = async (scope: DomainProjectionScope) =>
                loadDomainProjectionCohort(supabase, { domain: "assignments", projectionKey: key, orgId: ORG, userId: null, scope });
            const all = await run({ siteScope: "all", allowedSiteLocationIds: [] });
            if (all.status !== "ok") {
                (evidence.views as Record<string, unknown>)[key] = { refused: all };
                if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
            }
            expect(all.status).toBe("ok");
            if (all.status !== "ok") continue;
            expect(all.total).toBe(all.rows.length);
            expect(new Set(all.rows.map((r) => `${r.subject.type}:${r.subject.id}`)).size).toBe(all.rows.length);
            const perSite: Record<string, unknown> = {};
            let sum = 0;
            for (const site of SITES) {
                const s = await run({ siteScope: "all", allowedSiteLocationIds: [], selectedSiteId: site });
                expect(s.status).toBe("ok");
                if (s.status !== "ok") continue;
                expect(s.rows.every((r) => r.siteLocationId === site)).toBe(true);
                expect(s.total).toBe(s.rows.length);
                sum += s.rows.length;
                perSite[site] = { total: s.total, facts: s.factTotal };
            }
            const outside = await run({ siteScope: "restricted", allowedSiteLocationIds: [SITES[0]!], selectedSiteId: SITES[1] });
            expect(outside.status === "ok" && outside.total).toBe(0);
            (evidence.views as Record<string, unknown>)[key] = {
                total: all.total,
                facts: all.factTotal,
                truncated: all.truncated,
                by_grain: { child: all.rows.filter((r) => r.subject.type === "child").length, person: all.rows.filter((r) => r.subject.type === "person").length },
                per_site: perSite,
                per_site_sum: sum,
                outside_selection_total: outside.status === "ok" ? outside.total : null,
                sample: all.rows.slice(0, 4).map((r) => ({ subject: r.subject, source: { kind: r.source.kind, id: r.source.id, count: r.source.count }, reason: r.detail?.reason, site: r.detail?.siteLabel, room: r.detail?.roomLabel, type: r.detail?.assignmentTypeLabel, start: r.detail?.startDate, end: r.detail?.endDate })),
            };
        }
        if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
    }, 120_000);
});
