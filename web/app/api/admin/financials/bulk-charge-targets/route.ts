import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { loadCatalogChargeOptionsForSubjects } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import { chargeSitesByChild, householdChargeSubjectKey } from "@/lib/financials/catalogCharges/chargeSubjectSite";
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
 * returned, so the surface defaults its service date to it rather than the browser's UTC day). Each
 * household and each child is judged at the one site ITS charge is for — the household at none, a
 * child at the site of the agreement `charge.add` writes against (`chargeSitesByChild`) — and
 * `unavailableForSubjects` names the targets an item would be refused for, so the surface refuses a
 * row before sending it, with the command's reason. Each target's own preview still judges it.
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
        /*
         * Every child's agreements NEWEST FIRST, read by member as `charge.add` reads them, so each
         * child's site is the one its charge would be for.
         */
        const childIds = [...children.values()].flat().map((c) => c.customerMemberId);
        const agreements: Array<Record<string, unknown>> = [];
        for (let i = 0; i < childIds.length; i += 200) {
            const { data, error } = await supabase
                .from("child_enrollment_agreements")
                .select("id, customer_member_id, status, site_location_id, created_at")
                .eq("org_id", ctx.orgId)
                .in("customer_member_id", childIds.slice(i, i + 200))
                .order("created_at", { ascending: false });
            if (error) throw new Error(error.message);
            agreements.push(...((data ?? []) as Array<Record<string, unknown>>));
        }
        const text = (v: unknown) => (v == null ? "" : String(v).trim());
        const sites = chargeSitesByChild(
            agreements.map((r) => ({
                id: text(r.id),
                customer_member_id: text(r.customer_member_id),
                status: text(r.status),
                site_location_id: text(r.site_location_id) || null,
            })),
            childIds,
        );
        const subjects = [
            ...customerIds.map((id) => ({ key: householdChargeSubjectKey(id), locationId: null })),
            ...childIds.map((id) => ({ key: id, locationId: sites.get(id) ?? null })),
        ];
        const businessDate = await fetchOrgBusinessDate(supabase, ctx.orgId);
        const catalog = await loadCatalogChargeOptionsForSubjects(supabase, ctx.orgId, { asOf: businessDate, subjects }).then(
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
