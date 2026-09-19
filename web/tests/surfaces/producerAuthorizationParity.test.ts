/**
 * MOVING A PROJECTION INTO ROOT PROVISIONING MUST NEVER BROADEN WHO MAY SEE IT.
 *
 * Producer convergence is an execution-LOCATION change. It is not a permission-model change. For the
 * same authenticated caller and the same subject, the old card endpoint's authorization decision and
 * the new root producer's authorization decision must be the SAME decision.
 *
 * Health is where that first has teeth. `/api/admin/health/card` deliberately does not treat route
 * admission as the boundary: an operator who works Attendance holds `requireAdminOrOps` and must not
 * receive allergies, conditions and medications. If the producer had simply invoked the domain owner
 * from root provisioning, it would either have bypassed that refusal or denied everyone.
 *
 * ── WHAT THIS PROVES, AND HOW ──
 *
 * The producer and the endpoint are driven through the SAME domain owner with the same inputs, and
 * their decisions compared. The domain owner is not mocked: mocking it would prove only that the
 * caller asked, and the question here is what the answer is.
 *
 * The strong claim is about the PAYLOAD, not the pixel: a refused producer must carry no health data
 * at all. A card that merely declines to render it still shipped it to a browser that can open a
 * network tab.
 */

import { resolveFinancialSubjectIdFromTruth } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateHealthAccess, HEALTH_VIEW_PERMISSION } from "@/lib/health/healthAccess";
import { projectFocusPanelCardProducers } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardProducers";
import { FINANCIALS_READ_PERMISSION_KEY } from "@/lib/financials/financialsPermissions";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

const MEMBER = "b247b8a3-7df7-4919-9309-698796b59c3b";
const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";

/** The canonical resolved authority, as a root route holds it in `gate.access`. */
const access = (permissionKeys: string[] | null): AdminAccessContextSuccess =>
    ({
        ok: true,
        userId: "user-1",
        orgId: ORG,
        roleKeys: ["ops"],
        permissionKeys,
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
    }) as unknown as AdminAccessContextSuccess;

const context = (memberId: string | null) =>
    ({
        participantScope: memberId ? { customerMemberId: memberId, displayName: "Child A" } : null,
        // `truth` is required by OperationalContext; the financial subject rule reads it.
        truth: {},
    }) as never;

/**
 * THE ENDPOINT'S DECISION, expressed exactly as the route expresses it.
 *
 * `route.ts` computes `permissionKeys = access.ok ? access.permissionKeys : null`, hands that to the
 * domain owner, and answers 403 when the VM comes back `permissionDenied`. That is the whole of its
 * authorization behaviour, and it is what the producer must match.
 */
function endpointDecision(permissionKeys: string[] | null): "allow" | "deny" {
    return evaluateHealthAccess({ permissionKeys }, HEALTH_VIEW_PERMISSION).allowed ? "allow" : "deny";
}

/** Run the real producers against a stubbed database, returning the health result. */
async function producerHealth(opts: {
    permissionKeys: string[] | null;
    memberId?: string | null;
    orgId?: string;
}) {
    const results = await projectFocusPanelCardProducers({
        supabase: stubSupabase() as never,
        orgId: opts.orgId ?? ORG,
        context: context(opts.memberId === undefined ? MEMBER : opts.memberId),
        financialSubjectId: resolveFinancialSubjectIdFromTruth(((context(opts.memberId === undefined ? MEMBER : opts.memberId)) as { truth?: Record<string, unknown> }).truth ?? {}),
        access: access(opts.permissionKeys),
    });
    return results.health;
}

/**
 * A database that answers every query with an empty set.
 *
 * The health owner's READS are not what is under test — its REFUSAL is, and that is decided before
 * any row is needed. An empty database keeps the test about authorization rather than about fixture
 * data, and it means an "allowed" result is a real traversal of the owner rather than a short circuit.
 */
function stubSupabase() {
    const thenable = {
        select: () => thenable,
        eq: () => thenable,
        in: () => thenable,
        order: () => thenable,
        limit: () => thenable,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return { from: () => thenable, rpc: async () => ({ data: null, error: null }) };
}

describe("the root Health producer cannot broaden the endpoint's authorization", () => {
    it("1. an authorized caller is allowed by BOTH", async () => {
        expect(endpointDecision([HEALTH_VIEW_PERMISSION])).toBe("allow");
        const health = await producerHealth({ permissionKeys: [HEALTH_VIEW_PERMISSION] });
        expect(health.state).not.toBe("forbidden");
    });

    it("2. a caller WITHOUT the health grant is denied by BOTH, and receives no data", async () => {
        expect(endpointDecision(["attendance.view"])).toBe("deny");
        const health = await producerHealth({ permissionKeys: ["attendance.view"] });
        expect(health.state).toBe("forbidden");
        // The payload claim: not merely unrendered — absent.
        expect(health.data).toBeNull();
    });

    it("3. a FAILED grant resolution denies — it is not an empty grant set", async () => {
        // `route.ts` turns `access.ok === false` into `permissionKeys: null`, and the resolver
        // refuses a non-array. Collapsing the two would make the failure OPEN.
        expect(endpointDecision(null)).toBe("deny");
        const health = await producerHealth({ permissionKeys: null });
        expect(health.state).toBe("forbidden");
        expect(health.data).toBeNull();
    });

    it("4. an empty grant set is denied, not defaulted", async () => {
        expect(endpointDecision([])).toBe("deny");
        expect((await producerHealth({ permissionKeys: [] })).state).toBe("forbidden");
    });

    it("5. a near-miss permission key does not satisfy the requirement", async () => {
        // Substring and prefix confusion is how a permission check quietly stops checking.
        for (const key of ["health", "health.viewer", "health.view.all", "healthview"]) {
            expect(endpointDecision([key]), key).toBe("deny");
            expect((await producerHealth({ permissionKeys: [key] })).state, key).toBe("forbidden");
        }
    });

    it("6. no scoped child yields `unavailable`, which is NOT a refusal", async () => {
        // A family with no scoped child has nothing to read for. Reporting that as `forbidden` would
        // tell the operator they lack a permission they actually hold.
        const health = await producerHealth({ permissionKeys: [HEALTH_VIEW_PERMISSION], memberId: null });
        expect(health.state).toBe("unavailable");
        expect(health.data).toBeNull();
    });

    it("7. a failed read is bounded, and never renders as a reassuring empty record", async () => {
        /*
         * A REALISTIC failure: the query builder is returned, and the READ rejects.
         *
         * A stub that threw synchronously from `from()` would be a different bug — it orphans the
         * sibling promises that were already started, before `Promise.allSettled` ever receives
         * them, and their rejections surface as unhandled. Real clients return a builder and fail at
         * await, which is the path the isolation actually has to survive.
         */
        const failing = {
            select: () => failing,
            eq: () => failing,
            in: () => failing,
            order: () => failing,
            limit: () => failing,
            maybeSingle: async () => {
                throw new Error("health_store_down");
            },
            single: async () => {
                throw new Error("health_store_down");
            },
            then: (_res: unknown, reject: (e: unknown) => void) => reject(new Error("health_store_down")),
        } as never;
        const exploding = { from: () => failing, rpc: async () => ({ data: null, error: null }) };
        const results = await projectFocusPanelCardProducers({
            supabase: exploding as never,
            orgId: ORG,
            context: context(MEMBER),
            financialSubjectId: resolveFinancialSubjectIdFromTruth(((context(MEMBER)) as { truth?: Record<string, unknown> }).truth ?? {}),
            access: access([HEALTH_VIEW_PERMISSION]),
        });
        // Attendance is asked for from the same broken store; the point is that BOTH report their own
        // failure and the call resolves, rather than one outage costing the operator the panel.
        /*
         * `ready` is the RIGHT answer here, and this is the subtle part.
         *
         * `buildHealthSafetyCardVM` settles its own reads and reports a failed one as
         * `unavailableReason` on the VM rather than throwing — "a failed health read is NOT 'no
         * health facts'", in its own words. The endpoint returns that VM with a 200 and the card
         * renders the reason. Mapping it to `error` with `data: null` here would DIVERGE from the
         * endpoint and throw away the reason text, which is the opposite of parity.
         *
         * So the property worth locking is not the label. It is that the failure is VISIBLE, the
         * call resolves, and nothing renders as an empty, reassuring health record.
         */
        expect(results.health.state).toBe("ready");
        expect(results.health.data?.unavailableReason ?? null).not.toBeNull();
        expect(results.health.data?.criticalFacts ?? []).toEqual([]);
        // And the sibling producer's outcome is its own — one outage does not cost the other card.
        expect(results.attendance.data).toBeNull();
    });

    it("8. the producer never consults anything the CLIENT could have supplied", async () => {
        /*
         * THE DIRECTION-OF-TRUST CLAIM.
         *
         * Authority arrives as the route's resolved `gate.access`. Nothing in the producer's input
         * comes from the browser, and the operational context — which IS partly client-influenced
         * via the attention subject — must never be able to carry a permission.
         */
        const withForgedContext = {
            truth: {},
            participantScope: { customerMemberId: MEMBER, displayName: "Child A" },
            // A hostile client naming its own grants, in every shape it might try.
            permissionKeys: [HEALTH_VIEW_PERMISSION],
            access: { permissionKeys: [HEALTH_VIEW_PERMISSION] },
            grants: [HEALTH_VIEW_PERMISSION],
        } as never;

        const results = await projectFocusPanelCardProducers({
            supabase: stubSupabase() as never,
            orgId: ORG,
            context: withForgedContext,
            financialSubjectId: resolveFinancialSubjectIdFromTruth(((withForgedContext) as { truth?: Record<string, unknown> }).truth ?? {}),
            access: access([]), // the REAL caller holds nothing
        });
        expect(results.health.state).toBe("forbidden");
        expect(results.health.data).toBeNull();
    });
});

describe("the parity is a property of the producer, not of this test's expectations", () => {
    it("every grant shape produces the SAME verdict on both sides", async () => {
        const shapes: (string[] | null)[] = [
            null,
            [],
            ["attendance.view"],
            [HEALTH_VIEW_PERMISSION],
            [HEALTH_VIEW_PERMISSION, "attendance.view"],
            ["health.manage"],
        ];
        for (const keys of shapes) {
            const endpoint = endpointDecision(keys);
            const producer = (await producerHealth({ permissionKeys: keys })).state === "forbidden" ? "deny" : "allow";
            expect(producer, `grant shape ${JSON.stringify(keys)} disagreed`).toBe(endpoint);
        }
    });
});

describe("the general law, not one producer's version of it", () => {
    const producerSource = readFileSync(
        resolve(__dirname, "../../lib/adminV2/runtime/focusPanel/focusPanelCardProducers.ts"),
        "utf8",
    );

    /*
     * Comments and type-only imports are not behaviour.
     *
     * The module NAMES `health.view` in prose explaining why the refusal is the domain owner's, and
     * it type-imports from a module whose PATH contains a resolver's name. Matching raw text would
     * fail on both and teach the next person to delete the explanation to get green.
     */
    const code = producerSource
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/^\s*import type[^;]+;/gm, "");

    it("consumes the caller's authority rather than resolving its own", () => {
        /*
         * ONE CANONICAL RESOLUTION, AT THE ROUTE.
         *
         * A producer that called `getAdminAccessContextCached()` itself would still be "authorized",
         * which is why this is easy to get wrong. But it would be a SECOND resolution of the caller's
         * authority, free to drift from the one the route admitted the request with — and a producer
         * that can resolve authority can also decide not to. The route resolves once and hands the
         * result down; producers consume it.
         */
        for (const resolver of [
            "getAdminAccessContextCached",
            "getAdminAccessContext",
            "loadAdminRouteGate",
            "loadAdminAccessBundle",
            "requireAdminOrOps",
            "getAdminAuthCached",
        ]) {
            // An INVOCATION, not a mention: `foo(` is the call, `foo` alone may be a path or prose.
            expect(code, `producers must not resolve authority themselves (${resolver})`).not.toContain(
                `${resolver}(`,
            );
        }
        // And it must actually take the resolved authority as an input.
        expect(producerSource).toContain("access: AdminAccessContextSuccess");
    });

    it("does not restate any permission requirement the domain owner owns", () => {
        /*
         * The refusal belongs to the domain owner, which the endpoint and the producer both call.
         * A producer that compared permission keys itself would be a second authorization model: two
         * places to change, one of which someone will forget.
         */
        expect(code).not.toContain("health.view");
        expect(code).not.toMatch(/permissionKeys\s*\.\s*includes/);
        expect(code).not.toContain("evaluateHealthAccess");
    });
});

/**
 * FINANCIALS AUTHORIZATION IS NOT HEALTH'S, and assuming it was is what the audit prevented.
 *
 * Health's domain owner evaluates the grant itself from the caller's resolved permission keys.
 * Financials refuses OUTSIDE its VM builder: `assertFinancialsReadAllowed` resolves the actor's
 * grants against the org with the service client and checks `fin.read` — a different key, a
 * different resolver, and a gate that runs BEFORE any figure is computed. `buildFinancialsCardVM`
 * takes no access argument at all, so calling it without that gate hands over the household balance
 * to anyone the route admitted.
 *
 * These drive the producer against a database that answers the GRANT query and nothing else, so the
 * verdict under test is the real one.
 */
describe("the root Financials producer cannot broaden its endpoint's authorization", () => {
    const HOUSEHOLD = "0658832a-48d6-4b80-beae-0b12d573fdf2";

    /** A client whose actor-grant read returns exactly these keys. */
    function supabaseGranting(keys: string[]) {
        const rows = keys.map((k) => ({ permission_key: k, key: k }));
        const builder: Record<string, unknown> = {};
        Object.assign(builder, {
            select: () => builder,
            eq: () => builder,
            in: () => builder,
            order: () => builder,
            limit: () => builder,
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
            then: (res: (v: unknown) => void) => res({ data: rows, error: null }),
        });
        return { from: () => builder, rpc: async () => ({ data: rows, error: null }) };
    }

    const financialsContext = {
        participantScope: { customerMemberId: MEMBER, displayName: "Child A" },
        truth: { "customer.id": HOUSEHOLD },
    } as never;

    async function financialsFor(keys: string[]) {
        const results = await projectFocusPanelCardProducers({
            supabase: supabaseGranting(keys) as never,
            orgId: ORG,
            context: financialsContext,
            financialSubjectId: resolveFinancialSubjectIdFromTruth(((financialsContext) as { truth?: Record<string, unknown> }).truth ?? {}),
            access: access(keys),
        });
        return results.financials;
    }

    it("uses a DIFFERENT permission key than Health — the two were never interchangeable", () => {
        expect(FINANCIALS_READ_PERMISSION_KEY).not.toBe(HEALTH_VIEW_PERMISSION);
        expect(FINANCIALS_READ_PERMISSION_KEY).toBe("fin.read");
    });

    it("refuses a caller who holds HEALTH access but not financial access", async () => {
        // The precise privilege-widening this migration could have caused: one producer lifecycle
        // must not mean one privilege level.
        const financials = await financialsFor([HEALTH_VIEW_PERMISSION]);
        expect(financials.state).toBe("forbidden");
        expect(financials.data).toBeNull();
    });

    it("refuses an empty grant set, and reveals no account", async () => {
        const financials = await financialsFor([]);
        expect(financials.state).toBe("forbidden");
        expect(financials.data).toBeNull();
    });

    it("does not read the ledger at all for a refused caller", async () => {
        /*
         * THE STRONGER CLAIM. A denied caller should not cause the household's charges to be read
         * and then thrown away: that is both a privacy surface and a cost. The gate runs first, and
         * the VM builder is never entered.
         */
        let ledgerReads = 0;
        const grantsOnly = supabaseGranting([]);
        const watched = {
            ...grantsOnly,
            from: (table: string) => {
                if (table !== "user_permission_grants" && table.includes("charge")) ledgerReads += 1;
                return grantsOnly.from();
            },
        };
        const results = await projectFocusPanelCardProducers({
            supabase: watched as never,
            orgId: ORG,
            context: financialsContext,
            financialSubjectId: resolveFinancialSubjectIdFromTruth(((financialsContext) as { truth?: Record<string, unknown> }).truth ?? {}),
            access: access([]),
        });
        expect(results.financials.state).toBe("forbidden");
        expect(ledgerReads).toBe(0);
    });

    it("reports `unavailable` — not a refusal — when there is no household to ask about", async () => {
        const results = await projectFocusPanelCardProducers({
            supabase: supabaseGranting([FINANCIALS_READ_PERMISSION_KEY]) as never,
            orgId: ORG,
            context: { participantScope: null, truth: {} } as never,
            financialSubjectId: resolveFinancialSubjectIdFromTruth((({ participantScope: null, truth: {} } as never) as { truth?: Record<string, unknown> }).truth ?? {}),
            access: access([FINANCIALS_READ_PERMISSION_KEY]),
        });
        expect(results.financials.state).toBe("unavailable");
        expect(results.financials.data).toBeNull();
    });

    it("a failed grant read REFUSES rather than falling through", async () => {
        /*
         * `assertFinancialsReadAllowed` rejects when the grant read fails, and the endpoint's route
         * never reaches the VM. The producer must not be the softer door by treating the failure as
         * "no opinion" and reading the ledger anyway.
         */
        const broken = {
            from: () => {
                const b: Record<string, unknown> = {};
                Object.assign(b, {
                    select: () => b,
                    eq: () => b,
                    in: () => b,
                    order: () => b,
                    limit: () => b,
                    maybeSingle: async () => {
                        throw new Error("grant_store_down");
                    },
                    single: async () => {
                        throw new Error("grant_store_down");
                    },
                    then: (_r: unknown, rej: (e: unknown) => void) => rej(new Error("grant_store_down")),
                });
                return b;
            },
            rpc: async () => {
                throw new Error("grant_store_down");
            },
        };
        const results = await projectFocusPanelCardProducers({
            supabase: broken as never,
            orgId: ORG,
            context: financialsContext,
            financialSubjectId: resolveFinancialSubjectIdFromTruth(((financialsContext) as { truth?: Record<string, unknown> }).truth ?? {}),
            access: access([FINANCIALS_READ_PERMISSION_KEY]),
        });
        expect(results.financials.state).not.toBe("ready");
        expect(results.financials.data).toBeNull();
    });
});

/**
 * DEEP DETAIL REMAINS LAZY.
 *
 * Measured on deployed staging before this bound: the Financials initial projection was 21,573 B, of
 * which `payments` alone was 14,738 B FOR TWO ROWS and `ledgerPeriods` a further 1,915 B — receipts,
 * refunds and the placed ledger, in BOTH frames, on every panel, for every operator, before anyone
 * asked to see them.
 *
 * The summary reads neither. Only the expanded ledger and the payment surfaces do, and those are
 * interactions that load the full model from the endpoint that always owned it.
 */
describe("the initial producer projections carry summaries, not ledgers", () => {
    const HOUSEHOLD = "0658832a-48d6-4b80-beae-0b12d573fdf2";

    it("Financials omits payments and ledger periods from the INITIAL answer", async () => {
        /*
         * The bound is a pure function, so it is tested as one.
         *
         * Driving it through the producer would need a caller the Financials gate ALLOWS, and that
         * gate reads actor grants through its own resolver with a row shape this suite does not
         * model — the authorization cases above are all refusals, which is what they were for. A
         * stub tuned until the gate said yes would be testing the stub.
         */
        const { boundInitialFinancials } = await import(
            "@/lib/adminV2/runtime/focusPanel/focusPanelCardProducers"
        );

        const full = {
            account: { customerId: HOUSEHOLD, label: "Kurzman" },
            period: { key: "2026-09", start: "2026-09-01", end: "2026-09-30", label: "September 2026" },
            reconciliation: { grossCents: 100, paymentsCents: 100, balanceCents: 0 },
            collectible: { outstandingCents: 0 },
            rows: [{ periodKey: "2026-09" }],
            payments: [{ id: "pay-1", amountCents: 100 }, { id: "pay-2", amountCents: 50 }],
            ledgerPeriods: [{ period: { key: "2026-08" }, rows: [{ id: "r1" }] }],
        } as never;

        const bounded = boundInitialFinancials(full) as unknown as Record<string, unknown>;

        expect(bounded.payments, "receipts and refunds rode the initial projection").toEqual([]);
        expect(bounded.ledgerPeriods, "the placed ledger rode the initial projection").toEqual([]);
        // The summary's own figures must survive the bound — trimming the answer is not the goal.
        expect(bounded.reconciliation).toEqual((full as unknown as Record<string, unknown>).reconciliation);
        expect(bounded.collectible).toEqual((full as unknown as Record<string, unknown>).collectible);
        expect(bounded.period).toEqual((full as unknown as Record<string, unknown>).period);
        // `rows` is deliberately kept: 1,676 B, and the summary filters it to the current period.
        expect(bounded.rows).toHaveLength(1);
    });
});
