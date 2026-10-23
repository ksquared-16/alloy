/**
 * Route-layer form of `financialReadScope` (BP V2 D4): resolve the caller's site rights from the
 * request's access context and answer the 404 a non-existent record answers when the financial read
 * is out of scope. One call per detail route; the decision itself lives in `financialReadScope`.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    financialItemReadable,
    financialReadScopeFromAccess,
    financialSourceReadable,
    householdFinancialsReadable,
    type FinancialItemTable,
} from "@/lib/financials/workspace/financialReadScope";

export type FinancialReadTarget =
    | { item: FinancialItemTable; id: string }
    | { source: { billable_source_type?: unknown; billable_source_id?: unknown } }
    | { household: { customerId?: string | null; customerMemberId?: string | null; opportunityCustomerMemberId?: string | null } };

/** Null when the read may proceed; otherwise the response to return. */
export async function refuseOutOfScopeFinancialRead(
    supabase: SupabaseClient,
    orgId: string,
    target: FinancialReadTarget,
): Promise<NextResponse | null> {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const scope = financialReadScopeFromAccess(access);
    const verdict =
        "item" in target
            ? await financialItemReadable(supabase, { orgId, scope, table: target.item, id: target.id })
            : "source" in target
              ? await financialSourceReadable(supabase, { orgId, scope, source: target.source })
              : await householdFinancialsReadable(supabase, { orgId, scope, ...target.household });
    return verdict === "readable" || verdict === "not_governed" ? null : NextResponse.json({ error: "Not found" }, { status: 404 });
}
