import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { ORG_ID_FINANCIALS } from "@/lib/financials";
import { balanceCentsForAccountType } from "@/lib/financials";
import type { GlAccountType } from "@/lib/financials";

export const dynamic = "force-dynamic";

type AccountRow = { id: string; code: string; name: string; type: GlAccountType };
type LineRow = { account_id: string; debit_cents: number; credit_cents: number };
type EntryRow = { id: string; entry_date: string };

/**
 * GET /api/admin/financials/statements
 * Query: period=pl|bs, start (ISO date), end (ISO date), as_of (ISO date for BS)
 * P&L: start/end required. Balance Sheet: as_of required.
 */
export async function GET(request: NextRequest) {
    const supabase = createAdminClient();
    const orgId = ORG_ID_FINANCIALS;
    const { searchParams } = request.nextUrl;
    const period = searchParams.get("period") || "pl";
    const start = searchParams.get("start") || "";
    const end = searchParams.get("end") || "";
    const asOf = searchParams.get("as_of") || "";

    const { data: accounts } = await supabase
        .from("gl_accounts")
        .select("id, code, name, type")
        .eq("org_id", orgId)
        .eq("is_active", true);
    const accountList = (accounts ?? []) as AccountRow[];
    const accountById = new Map(accountList.map((a) => [a.id, a]));

    if (period === "pl") {
        if (!start || !end) {
            return NextResponse.json({ error: "start and end required for P&L" }, { status: 400 });
        }
        const { data: entries } = await supabase
            .from("gl_journal_entries")
            .select("id")
            .eq("org_id", orgId)
            .gte("entry_date", start)
            .lte("entry_date", end)
            .eq("status", "posted");
        const entryIds = (entries ?? []).map((e) => (e as { id: string }).id);
        if (entryIds.length === 0) {
            return NextResponse.json({
                period: "pl",
                start,
                end,
                revenue: [],
                expenses: [],
                totalRevenueCents: 0,
                totalExpensesCents: 0,
                netIncomeCents: 0,
            });
        }
        const { data: lines } = await supabase
            .from("gl_journal_lines")
            .select("account_id, debit_cents, credit_cents")
            .eq("org_id", orgId)
            .in("entry_id", entryIds);
        const lineList = (lines ?? []) as LineRow[];

        const byAccount = new Map<string, { debitCents: number; creditCents: number }>();
        for (const line of lineList) {
            const cur = byAccount.get(line.account_id) ?? { debitCents: 0, creditCents: 0 };
            cur.debitCents += Number(line.debit_cents) || 0;
            cur.creditCents += Number(line.credit_cents) || 0;
            byAccount.set(line.account_id, cur);
        }

        const revenue: { code: string; name: string; amountCents: number }[] = [];
        const expenses: { code: string; name: string; amountCents: number }[] = [];
        let totalRevenueCents = 0;
        let totalExpensesCents = 0;

        for (const [accId, tot] of byAccount) {
            const acc = accountById.get(accId);
            if (!acc) continue;
            const amountCents = balanceCentsForAccountType(acc.type, tot.debitCents, tot.creditCents);
            if (acc.type === "revenue") {
                revenue.push({ code: acc.code, name: acc.name, amountCents });
                totalRevenueCents += amountCents;
            } else if (acc.type === "expense") {
                expenses.push({ code: acc.code, name: acc.name, amountCents });
                totalExpensesCents += amountCents;
            }
        }

        const netIncomeCents = totalRevenueCents - totalExpensesCents;

        return NextResponse.json({
            period: "pl",
            start,
            end,
            revenue,
            expenses,
            totalRevenueCents,
            totalExpensesCents,
            netIncomeCents,
        });
    }

    if (period === "bs") {
        if (!asOf) {
            return NextResponse.json({ error: "as_of required for Balance Sheet" }, { status: 400 });
        }
        const { data: entries } = await supabase
            .from("gl_journal_entries")
            .select("id")
            .eq("org_id", orgId)
            .lte("entry_date", asOf)
            .eq("status", "posted");
        const entryIds = (entries ?? []).map((e) => (e as { id: string }).id);
        const byAccount = new Map<string, { debitCents: number; creditCents: number }>();

        if (entryIds.length > 0) {
            const { data: lines } = await supabase
                .from("gl_journal_lines")
                .select("account_id, debit_cents, credit_cents")
                .eq("org_id", orgId)
                .in("entry_id", entryIds);
            const lineList = (lines ?? []) as LineRow[];
            for (const line of lineList) {
                const cur = byAccount.get(line.account_id) ?? { debitCents: 0, creditCents: 0 };
                cur.debitCents += Number(line.debit_cents) || 0;
                cur.creditCents += Number(line.credit_cents) || 0;
                byAccount.set(line.account_id, cur);
            }
        }

        const assets: { code: string; name: string; balanceCents: number }[] = [];
        const liabilities: { code: string; name: string; balanceCents: number }[] = [];
        const equity: { code: string; name: string; balanceCents: number }[] = [];
        let totalAssetsCents = 0;
        let totalLiabilitiesCents = 0;
        let totalEquityCents = 0;

        for (const [accId, tot] of byAccount) {
            const acc = accountById.get(accId);
            if (!acc) continue;
            const balanceCents = balanceCentsForAccountType(acc.type, tot.debitCents, tot.creditCents);
            if (acc.type === "asset") {
                assets.push({ code: acc.code, name: acc.name, balanceCents });
                totalAssetsCents += balanceCents;
            } else if (acc.type === "liability") {
                liabilities.push({ code: acc.code, name: acc.name, balanceCents });
                totalLiabilitiesCents += balanceCents;
            } else if (acc.type === "equity") {
                equity.push({ code: acc.code, name: acc.name, balanceCents });
                totalEquityCents += balanceCents;
            }
        }

        const totalLPlusECents = totalLiabilitiesCents + totalEquityCents;
        const diffCents = totalAssetsCents - totalLPlusECents;
        const balanced = Math.abs(diffCents) < 1;

        return NextResponse.json({
            period: "bs",
            as_of: asOf,
            assets,
            liabilities,
            equity,
            totalAssetsCents,
            totalLiabilitiesCents,
            totalEquityCents,
            totalLiabilitiesPlusEquityCents: totalLPlusECents,
            differenceCents: diffCents,
            balanced,
        });
    }

    return NextResponse.json({ error: "period must be pl or bs" }, { status: 400 });
}
