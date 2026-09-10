/**
 * ONE CHARGE, EXPLAINED — and every figure traceable to the service that owns it.
 *
 * Charge detail is a composition, not a calculator. These cases assert that property directly: for
 * a real posted obligation the detail's money must be identical to what `resolveFamilyCollectible`
 * answers for the same charge, because it IS that answer passed through. If the two ever differ, a
 * join has started doing arithmetic.
 *
 * The attribution cases are the reason the surface exists at all. A charge billed from an agreement
 * is about that agreement's child; a charge billed from the household has no child, and that null
 * is an answer rather than a gap. Nothing may reach for the family's first child to fill it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { resolveChargeDetail } from "@/lib/financials/workspace/resolveChargeDetail";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;
const ORG = "00000000-0000-4000-8000-000000000001";

describeLive("charge detail composes canonical authority — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    async function somePostedAgreementCharge(): Promise<string> {
        const { data } = await supabase
            .from("charges")
            .select("id")
            .eq("org_id", ORG)
            .eq("status", "posted")
            .eq("billable_source_type", "enrollment_agreement")
            .limit(1);
        const id = ((data ?? []) as Array<{ id: string }>)[0]?.id;
        expect(id, "the tenant has no posted agreement-sourced charge to explain").toBeTruthy();
        return id!;
    }

    it("refuses a charge that is not this org's", async () => {
        const detail = await resolveChargeDetail(supabase, {
            orgId: "00000000-0000-4000-8000-0000000000ff",
            chargeId: await somePostedAgreementCharge(),
        });
        expect(detail, "a charge was returned for an org that does not own it").toBeNull();
    }, 120_000);

    it("returns null for a charge that does not exist", async () => {
        const detail = await resolveChargeDetail(supabase, {
            orgId: ORG,
            chargeId: "00000000-0000-4000-8000-00000000dead",
        });
        expect(detail).toBeNull();
    }, 120_000);

    /*
     * THE LOAD-BEARING CASE. Detail and the single-charge resolver must be the same numbers,
     * because detail does not compute them — it asks.
     */
    it("reports exactly what the canonical resolver says about the money", async () => {
        const chargeId = await somePostedAgreementCharge();
        const detail = await resolveChargeDetail(supabase, { orgId: ORG, chargeId });
        expect(detail, "the charge did not resolve").toBeTruthy();

        const canonical = await resolveFamilyCollectible(supabase, { orgId: ORG, chargeId } as never);
        expect(
            detail!.position,
            "a posted obligation has no collectible position, so the detail can say nothing about its money",
        ).toBeTruthy();
        expect(detail!.position, "charge detail and the canonical resolver disagree").toEqual(canonical);
    }, 180_000);

    /*
     * ATTRIBUTE WHEN RESOLVABLE, DISCLOSE WHEN NOT.
     *
     * Posted money is immutable; the agreement it was billed from is not. Most of this tenant's
     * posted charges reference agreements that other threads have since deleted, so a charge can
     * legitimately have no household left to name. The contract is that the detail says so — never
     * that it goes looking for a plausible family to attach the money to.
     */
    it("names the household and child when the agreement still exists, and admits it when it does not", async () => {
        const { data: rows } = await supabase
            .from("charges")
            .select("id, billable_source_id")
            .eq("org_id", ORG)
            .eq("status", "posted")
            .eq("billable_source_type", "enrollment_agreement")
            .limit(400);
        const charges = ((rows ?? []) as Array<{ id: string; billable_source_id: string }>);
        expect(charges.length, "no posted agreement charges to attribute").toBeGreaterThan(0);

        const { data: live } = await supabase
            .from("child_enrollment_agreements")
            .select("id")
            .eq("org_id", ORG)
            .in("id", [...new Set(charges.map((c) => c.billable_source_id))].slice(0, 80));
        const liveIds = new Set(((live ?? []) as Array<{ id: string }>).map((a) => a.id));

        const attributable = charges.find((c) => liveIds.has(c.billable_source_id));
        const orphaned = charges.find((c) => !liveIds.has(c.billable_source_id));

        if (attributable) {
            const detail = await resolveChargeDetail(supabase, { orgId: ORG, chargeId: attributable.id });
            expect(detail!.customerId, "an agreement that exists must name its household").toBeTruthy();
            expect(detail!.enrollmentAgreementId, "an agreement charge names its agreement").toBeTruthy();
        }
        if (orphaned) {
            const detail = await resolveChargeDetail(supabase, { orgId: ORG, chargeId: orphaned.id });
            expect(
                detail!.customerId,
                "a charge whose agreement is gone has been given a household it cannot prove",
            ).toBeNull();
            expect(
                detail!.customerMemberId,
                "a charge whose agreement is gone has been given a child it cannot prove",
            ).toBeNull();
            // The obligation itself survives: immutable money is still money.
            expect(detail!.status, "the charge itself is still there").toBe("posted");
        }

        const { data: householdRows } = await supabase
            .from("charges")
            .select("id")
            .eq("org_id", ORG)
            .eq("billable_source_type", "customer")
            .limit(1);
        const householdCharge = ((householdRows ?? []) as Array<{ id: string }>)[0]?.id;
        if (householdCharge) {
            const detail = await resolveChargeDetail(supabase, { orgId: ORG, chargeId: householdCharge });
            expect(
                detail!.customerMemberId,
                "a household charge has been given a child it cannot have",
            ).toBeNull();
            expect(detail!.enrollmentAgreementId, "a household charge has no agreement").toBeNull();
            expect(detail!.customerId, "a household charge still names the household").toBeTruthy();
        }
    }, 180_000);

    /*
     * THE CHARGE'S OWN PERIOD. Detail must not borrow the account card's current-period lens: an
     * October charge opened in September is still an October charge, so the date it reports is the
     * one on the record.
     */
    it("reports the charge's own dates rather than today's period", async () => {
        const chargeId = await somePostedAgreementCharge();
        const detail = await resolveChargeDetail(supabase, { orgId: ORG, chargeId });
        const { data: row } = await supabase
            .from("charges")
            .select("service_date, posted_at, status")
            .eq("id", chargeId)
            .maybeSingle();
        const canonical = row as unknown as { service_date: string | null; posted_at: string | null; status: string };
        expect(detail!.serviceDate).toBe(canonical.service_date);
        expect(detail!.postedAt).toBe(canonical.posted_at);
        expect(detail!.status).toBe(canonical.status);
    }, 180_000);

    /*
     * APPLIED MONEY MUST RECONCILE WITH THE POSITION. The applications are read here, the applied
     * total is decided by the resolver, and if they disagree one of them is inventing money.
     */
    it("lists the payments whose total the position already reports as applied", async () => {
        const { data } = await supabase
            .from("payment_allocations")
            .select("charge_id")
            .limit(50);
        const withMoney = ((data ?? []) as Array<{ charge_id: string }>).map((r) => r.charge_id);
        expect(withMoney.length, "no applied payments exist in the tenant to reconcile against").toBeGreaterThan(0);

        for (const chargeId of [...new Set(withMoney)].slice(0, 5)) {
            const detail = await resolveChargeDetail(supabase, { orgId: ORG, chargeId });
            if (!detail?.position) continue;
            const listed = detail.applications.reduce((sum, a) => sum + a.allocatedAmountCents, 0);
            expect(
                listed,
                `charge ${chargeId}: the applications listed do not add up to the applied money the position reports`,
            ).toBe(detail.position.explanation.appliedCents);
        }
    }, 240_000);
});
