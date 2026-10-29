import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { loadCatalogChargeOptions } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveFinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/bulk-charge-targets?site_location_id=
 *
 * WHO A BULK CHARGE CAN BE APPLIED TO (W7-F021): the households the operator can see — the SAME
 * cohort Accounts lists, scoped by the route gate — each with its active children, because a charge
 * type's category decides whether it is billed to a household or to each child.
 *
 * Identity only: names and ids, no money and no write. The bulk charge itself is the canonical
 * `charge.add`, once per household; this route only says who can be chosen. `fin.read`.
 *
 * ── AND WHAT CAN BE CHARGED TO THEM ──
 *
 * `catalog` is the organisation's Catalog judged by the SAME rule the card's Add Charge and the
 * `charge.add` command use (`catalogChargeOptions`): one-time fees offerable, other types listed with
 * the flow that bills them, missing accounting blocked — on the ORGANISATION's business date (also
 * returned, so the surface defaults its service date to it rather than the browser's UTC day), over
 * the sites these households attend. Each target's own preview still judges its own subjects.
 */
export async function GET(request: NextRequest) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    try {
        const cohort = await resolveFinancialSubjectCohort(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: new URL(request.url).searchParams.get("site_location_id")?.trim() || null,
        });
        const customerIds = cohort.subjects.map((s) => s.customerId);
        const children = new Map<string, Array<{ customerMemberId: string; name: string }>>();
        for (let i = 0; i < customerIds.length; i += 200) {
            const { data, error } = await supabase
                .from("customer_members")
                .select("id, customer_id, display_name, first_name, last_name, is_active")
                .eq("org_id", ctx.orgId)
                .in("customer_id", customerIds.slice(i, i + 200));
            if (error) throw new Error(error.message);
            for (const m of (data ?? []) as Array<Record<string, unknown>>) {
                if (m.is_active === false) continue;
                const name =
                    String(m.display_name ?? "").trim()
                    || [String(m.first_name ?? "").trim(), String(m.last_name ?? "").trim()].filter(Boolean).join(" ")
                    || "Child";
                const list = children.get(String(m.customer_id)) ?? [];
                list.push({ customerMemberId: String(m.id), name });
                children.set(String(m.customer_id), list);
            }
        }
        const businessDate = await fetchOrgBusinessDate(supabase, ctx.orgId);
        const locationIds: Array<string | null> = [
            null,
            ...new Set(cohort.subjects.flatMap((s) => s.siteLocationIds ?? [])),
        ];
        const catalog = await loadCatalogChargeOptions(supabase, ctx.orgId, { asOf: businessDate, locationIds }).then(
            (options) => ({ ok: true as const, options }),
            (e: unknown) => ({ ok: false as const, options: [], error: e instanceof Error ? e.message : String(e) }),
        );
        return NextResponse.json({
            ok: true,
            businessDate,
            catalog,
            households: cohort.subjects
                .map((s) => ({
                    customerId: s.customerId,
                    householdName: s.householdName ?? "Household",
                    children: (children.get(s.customerId) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
                }))
                .sort((a, b) => a.householdName.localeCompare(b.householdName)),
            truncated: cohort.truncated,
        });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
