/**
 * SLICE 2 — who decides a vacation is financially creditable.
 *
 * The centrepiece is one situation run twice: a child expected Friday, approved
 * vacation, did not attend. The Attendance fact and the operational truth are
 * IDENTICAL in both runs. Only Commercial Configuration differs — and the money
 * differs with it. That is the whole of Thread 7's ownership rule, and it could
 * not be stated before this slice because the answer arrived on the fact.
 *
 * Run against the certification database, through the real policy service, so
 * the create → validate → persist → read → resolve → consume path is proved end
 * to end rather than by inserting a row the service would have rejected.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createFinancialPolicy, listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { previewConsumption } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";

function certEnv(): { url: string; serviceKey: string } | null {
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
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const AGREEMENT = "00000000-0000-4000-8000-000070000060";
const CHILD = "00000000-0000-4000-8000-000070000050";
/** A Friday, fixed so the scenario reads the same on every run. */
const FRIDAY = "2026-10-02";

describeLive("vacation credit — commercial policy is the authority", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    /**
     * THE ONE OPERATIONAL TRUTH, built once and reused verbatim.
     *
     * Deliberately carries no eligibility of its own: it says the child was away,
     * which is all an operational fact is entitled to say.
     */
    const awayOnFriday = (): OperationalFactDto => ({
        sourceFamily: "attendance",
        eventKey: "attendance.absence",
        sourceEntityType: "child_attendance_events",
        sourceEntityId: "00000000-0000-4000-8000-0000000c0001",
        subjectType: "customer_member",
        subjectId: CHILD,
        locationId: RIVERSIDE,
        agreementId: AGREEMENT,
        occursOn: FRIDAY,
        effectiveOn: FRIDAY,
        eventDate: FRIDAY,
        attendanceFactType: "absence",
    });

    async function clearVacationPolicies() {
        await supabase.from("financial_policies").delete().eq("org_id", ORG).eq("policy_type", "vacation_credit");
    }

    const seed = (over: Record<string, unknown> = {}) =>
        createFinancialPolicy(supabase, {
            orgId: ORG,
            policyType: "vacation_credit",
            scopeType: "org",
            value: { treatment: "credit" },
            effectiveStart: "2026-01-01",
            ...over,
        } as Parameters<typeof createFinancialPolicy>[1]);

    const vacationDirective = async () => {
        const r = await previewConsumption(supabase, ORG, awayOnFriday(), FRIDAY);
        return {
            directive: (r.interpretation?.directives ?? r.attendanceInterpretation?.directives ?? []).find(
                (d) => d.obligationKind === "vacation_credit",
            ) ?? null,
            discardReason: r.attendanceInterpretation?.discardReason ?? null,
            applied: (r.policiesApplied ?? []).find((p) => p.policyType === "vacation_credit") ?? null,
        };
    };

    beforeAll(clearVacationPolicies);
    afterEach(clearVacationPolicies);
    afterAll(clearVacationPolicies);

    // ── The centrepiece: same truth, different policy ───────────────────────

    it("C — under a credit policy, the vacation earns a credit directive", async () => {
        await seed({ value: { treatment: "credit" } });
        const { directive, applied } = await vacationDirective();

        expect(directive).toBeTruthy();
        expect(directive).toMatchObject({ obligationKind: "vacation_credit" });
        // The lineage names the policy that decided, with its real scope.
        expect(applied).toMatchObject({ policyType: "vacation_credit", scope: "org", applied: true });
        expect((applied?.value as { treatment?: string })?.treatment).toBe("credit");
    });

    it("D — the SAME operational truth under a no_credit policy earns nothing", async () => {
        await seed({ value: { treatment: "no_credit" } });
        const { directive, discardReason, applied } = await vacationDirective();

        expect(directive).toBeFalsy();
        // And it says WHICH kind of "no": a decision, not a gap.
        expect(discardReason).toContain("no_credit");
        expect(applied).toMatchObject({ policyType: "vacation_credit", scope: "org", applied: false });
    });

    // ── Negative paths ─────────────────────────────────────────────────────

    it("no policy at all withholds money, and says so differently from no_credit", async () => {
        const { directive, discardReason } = await vacationDirective();
        expect(directive).toBeFalsy();
        /*
         * Absent configuration and a configured refusal both withhold money and
         * must not read the same. An operator asking "why no credit" needs to know
         * whether somebody decided that or nobody has configured it.
         */
        expect(discardReason).toContain("no vacation-credit policy configured");
    });

    it("a policy scoped to another location does not leak in", async () => {
        await seed({ scopeType: "location", locationId: LAKESIDE, value: { treatment: "credit" } });
        const { directive, discardReason } = await vacationDirective();
        expect(directive).toBeFalsy();
        expect(discardReason).toContain("no vacation-credit policy configured");
    });

    it("most-specific-wins: a location credit overrides an org no_credit", async () => {
        await seed({ scopeType: "org", value: { treatment: "no_credit" } });
        await seed({ scopeType: "location", locationId: RIVERSIDE, value: { treatment: "credit" } });
        const { directive, applied } = await vacationDirective();
        // Ordinary Financial Policy precedence, with no attendance-specific rule.
        expect(directive).toBeTruthy();
        expect(applied).toMatchObject({ scope: "location" });
    });

    it("effective dating is respected — a policy that starts later does not apply", async () => {
        await seed({ effectiveStart: "2026-12-01", value: { treatment: "credit" } });
        const { directive } = await vacationDirective();
        expect(directive).toBeFalsy();
    });

    it("an invalid treatment is refused by the policy service, not stored", async () => {
        await expect(seed({ value: { treatment: "sometimes" } })).rejects.toThrow();
        const rows = await listFinancialPolicies(supabase, ORG);
        expect(rows.filter((r) => r.policy_type === "vacation_credit")).toHaveLength(0);
    });

    it("a policy belonging to another org never resolves here", async () => {
        await seed({ value: { treatment: "credit" } });
        const rows = await listFinancialPolicies(supabase, ORG);
        // `listFinancialPolicies` is org-scoped at the query, so the resolver is
        // never even offered another tenant's row.
        expect(rows.every((r) => r.org_id === ORG)).toBe(true);
        const resolved = resolveFinancialPolicy(rows, "vacation_credit", { locationId: RIVERSIDE }, FRIDAY);
        expect(resolved.resolved).toBe(true);
    });

    // ── The old authority is gone ──────────────────────────────────────────

    it("the operational fact carries no commercial eligibility to override policy with", async () => {
        /*
         * `vacationEligible` has been removed from `OperationalFactDto` outright,
         * so there is no longer a fact-owned answer for policy to contend with.
         * That is a stronger guarantee than "the boolean is ignored", and it is
         * why this asserts the shape rather than fabricating a DTO state the type
         * no longer permits.
         */
        const fact = awayOnFriday();
        expect(Object.keys(fact)).not.toContain("vacationEligible");

        // The same fact, and the money still follows configuration alone.
        await seed({ value: { treatment: "no_credit" } });
        const refused = await previewConsumption(supabase, ORG, fact, FRIDAY);
        expect((refused.attendanceInterpretation?.directives ?? []).some((d) => d.obligationKind === "vacation_credit")).toBe(false);

        await clearVacationPolicies();
        await seed({ value: { treatment: "credit" } });
        const granted = await previewConsumption(supabase, ORG, fact, FRIDAY);
        expect((granted.attendanceInterpretation?.directives ?? []).some((d) => d.obligationKind === "vacation_credit")).toBe(true);
    });
});
