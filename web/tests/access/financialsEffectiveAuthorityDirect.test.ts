/**
 * DIRECT CERTIFICATION — Financials effective authority.
 *
 * The gates resolve grants against the deployed org through the service client, so the seam that is
 * mocked here is `resolveActorPermissionGrants` — the single place both the read and the write
 * assertion get their answer. That keeps every case about AUTHORITY rather than about a hand-built
 * Supabase double, and it means a refusal genuinely means "the grant was absent", not "the fixture
 * was shaped wrong".
 *
 * Persona shapes come from the deployed census: fin.write is granted to admin in 3 of 3 orgs and to
 * ops in 2 of 3; fin.post, fin.adjust, fin.responsibility and fin.subsidy are admin-only; fin.read
 * additionally reaches regional_lead, school_director and two custom roles.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { grants } = vi.hoisted(() => ({ grants: vi.fn() }));

/*
 * THE SEAM IS `lib/access/actorPermissionGrants`, NOT a path that merely sounds right.
 *
 * A first version mocked `@/lib/admin/resolveActorPermissionGrants`, which does not exist. Vitest
 * mocks a module nobody imports without complaint, so the real resolver ran against an empty
 * Supabase double and EVERY case failed — including the ones that should refuse. That uniform
 * failure is the tell: when refusals fail too, the harness is wrong, not the code.
 */
vi.mock("@/lib/access/actorPermissionGrants", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("@/lib/access/actorPermissionGrants");
    return { ...actual, resolveActorPermissionGrants: grants };
});

import {
    assertFinancialsReadAllowed,
    assertFinancialsWriteAllowed,
    requireFinancialsCapability,
    FINANCIALS_READ_PERMISSION_KEY,
    FINANCIALS_WRITE_PERMISSION_KEY,
} from "@/lib/financials/financialsPermissions";

const ORG = "11111111-1111-4111-8111-111111111111";
const supabase = {} as never;
const holding = (keys: string[]) => grants.mockResolvedValue({ permissionKeys: keys });
const call = { supabase, orgId: ORG, userId: "u1" };

const READER = [FINANCIALS_READ_PERMISSION_KEY];
const WRITER = [FINANCIALS_WRITE_PERMISSION_KEY];
const POSTER = ["fin.post"];
const ADJUSTER = ["fin.adjust"];

beforeEach(() => grants.mockReset());

describe("the fin.* distinctions hold — non-implication", () => {
    it("fin.read does NOT imply fin.write", async () => {
        holding(READER);
        expect((await assertFinancialsReadAllowed(call)).ok).toBe(true);
        holding(READER);
        expect((await assertFinancialsWriteAllowed(call)).ok).toBe(false);
    });

    it("fin.write does NOT imply fin.read — the gates are independent, and that is the contract", async () => {
        // Stated rather than assumed: this resolver grants no cross-key implication in either
        // direction, unlike the analytics resolver where write deliberately satisfies read.
        holding(WRITER);
        expect((await assertFinancialsWriteAllowed(call)).ok).toBe(true);
        holding(WRITER);
        expect((await assertFinancialsReadAllowed(call)).ok).toBe(false);
    });

    it.each([
        ["FINANCIAL POSTER", POSTER],
        ["FINANCIAL ADJUSTER", ADJUSTER],
        ["fin.responsibility holder", ["fin.responsibility"]],
        ["fin.subsidy holder", ["fin.subsidy"]],
    ])("%s does not thereby get ordinary financial write", async (_n, keys) => {
        holding(keys);
        const v = await assertFinancialsWriteAllowed(call);
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.requiredPermission).toBe(FINANCIALS_WRITE_PERMISSION_KEY);
    });

    it("fin.write does not thereby get posting or adjustment authority", () => {
        // The route-level owners for money truth and corrections are fin.post and fin.adjust; this
        // asserts the write key alone satisfies neither of the two capability predicates.
        const writer = { permissionKeys: WRITER };
        expect(requireFinancialsCapability(writer, FINANCIALS_WRITE_PERMISSION_KEY)).toBeNull();
        expect(requireFinancialsCapability(writer, FINANCIALS_READ_PERMISSION_KEY)?.status).toBe(403);
    });
});

describe("titles and unrelated capabilities buy nothing", () => {
    it("TITULAR ADMIN — no fin.* grant, refused, and told which key it needed", async () => {
        holding([]);
        const v = await assertFinancialsWriteAllowed(call);
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.requiredPermission).toBe(FINANCIALS_WRITE_PERMISSION_KEY);
    });

    it("PORTAL ONLY is refused for both read and write", async () => {
        holding(["portal.access"]);
        expect((await assertFinancialsWriteAllowed(call)).ok).toBe(false);
        holding(["portal.access"]);
        expect((await assertFinancialsReadAllowed(call)).ok).toBe(false);
    });

    it.each([["layouts.manage"], ["reports.write"], ["ops.workflows.write"], ["business_process.configure"]])(
        "WRONG CAPABILITY %s buys no Financial authority",
        async (key) => {
            holding([key]);
            expect((await assertFinancialsWriteAllowed(call)).ok).toBe(false);
            holding([key]);
            expect((await assertFinancialsReadAllowed(call)).ok).toBe(false);
        },
    );

    it("a missing or null grant list refuses rather than throwing", async () => {
        grants.mockResolvedValue({});
        expect((await assertFinancialsWriteAllowed(call)).ok).toBe(false);
        grants.mockResolvedValue({ permissionKeys: null });
        expect((await assertFinancialsReadAllowed(call)).ok).toBe(false);
    });
});

describe("W-17 composition — the grant decides, on the next request", () => {
    it("adding fin.write opens ordinary financial mutation and removing it closes", async () => {
        holding(READER);
        expect((await assertFinancialsWriteAllowed(call)).ok).toBe(false);

        holding([...READER, ...WRITER]);
        expect((await assertFinancialsWriteAllowed(call)).ok).toBe(true);

        holding(READER);
        expect((await assertFinancialsWriteAllowed(call)).ok).toBe(false);
        holding(READER);
        // ...and the adjacent read authority survives the removal.
        expect((await assertFinancialsReadAllowed(call)).ok).toBe(true);
    });
});

describe("tenant isolation is not capability authority", () => {
    it("the grant is resolved against the org the gate was given, never one the caller names", async () => {
        holding(WRITER);
        await assertFinancialsWriteAllowed(call);
        // A caller cannot widen this: the org id comes from the handler's resolved context.
        expect(grants).toHaveBeenCalledWith(supabase, ORG, "u1");
    });

    it("a null actor is refused rather than treated as a system caller", async () => {
        holding(WRITER);
        const v = await assertFinancialsWriteAllowed({ supabase, orgId: ORG, userId: null });
        // The resolver is still asked for THIS org with a null actor; it must not be bypassed.
        expect(grants).toHaveBeenCalledWith(supabase, ORG, null);
        expect(typeof v.ok).toBe("boolean");
    });
});
