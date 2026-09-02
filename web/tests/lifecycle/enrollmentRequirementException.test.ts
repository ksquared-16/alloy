/**
 * The governed requirement exception — "this exact requirement is legitimately excepted".
 *
 * The properties that make it a governed record rather than a shortcut are pinned here: it is not
 * evidence, it is authorized by a permission and not a role name, it is idempotent under retry, and
 * revoking it puts the requirement back.
 */

import { describe, expect, it } from "vitest";

import { evaluateEnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import {
    activeRequirementExceptionsByRequirementId,
    evaluateRequirementExceptionAuthority,
    REQUIREMENT_EXCEPTION_MANAGE_PERMISSION,
    validateRequirementExceptionRequest,
    type RequirementExceptionRecord,
} from "@/lib/enrollment/completion/requirementException";
import {
    grantRequirementException,
    loadActiveRequirementExceptions,
    revokeRequirementException,
} from "@/lib/enrollment/completion/requirementExceptionService";
import type { EnrollmentRequirementProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";

const IDENTITY = {
    orgId: "org-1",
    participationId: "ocm-1",
    stageKey: "enrolling",
    requirementId: "immunization",
};

const record = (over: Partial<RequirementExceptionRecord> = {}): RequirementExceptionRecord => ({
    id: "exc-1",
    org_id: IDENTITY.orgId,
    enrollment_participation_id: IDENTITY.participationId,
    stage_key: IDENTITY.stageKey,
    requirement_id: IDENTITY.requirementId,
    disposition: "excepted",
    reason: "Medical exemption on file with the state.",
    state: "active",
    approved_by: "user-admin",
    approved_at: "2026-09-01T00:00:00.000Z",
    ...over,
});

const HOLDS = { permissionKeys: [REQUIREMENT_EXCEPTION_MANAGE_PERMISSION], userId: "user-admin" };

/**
 * A chainable Supabase double that records every write it is asked to make.
 *
 * `select(...)` is awaitable AND has `maybeSingle()`, because the service uses both shapes: the
 * loader awaits a filtered select, the single-row reads do not.
 */
function fakeClient(options: {
    activeRows?: RequirementExceptionRecord[];
    selectError?: { message: string; code?: string } | null;
    insertError?: { message: string; code?: string } | null;
    insertReturns?: RequirementExceptionRecord | null;
    updateReturns?: RequirementExceptionRecord | null;
}) {
    const writes: { op: string; payload: Record<string, unknown> }[] = [];
    const rows = options.activeRows ?? [];

    const builder = (op: string, payload?: Record<string, unknown>) => {
        const node: Record<string, unknown> = {};
        const self = () => node;
        node.eq = self;
        node.in = self;
        node.select = self;
        node.maybeSingle = async () => {
            if (op === "select") {
                if (options.selectError) return { data: null, error: options.selectError };
                return { data: rows[0] ?? null, error: null };
            }
            if (op === "insert") {
                if (options.insertError) return { data: null, error: options.insertError };
                return { data: options.insertReturns ?? record(), error: null };
            }
            return { data: options.updateReturns ?? null, error: null };
        };
        // Awaiting the builder itself is the loader's shape.
        node.then = (resolve: (v: unknown) => unknown) =>
            resolve(options.selectError ? { data: null, error: options.selectError } : { data: rows, error: null });
        if (payload) writes.push({ op, payload });
        return node;
    };

    return {
        writes,
        client: {
            from: () => ({
                select: () => builder("select"),
                insert: (payload: Record<string, unknown>) => builder("insert", payload),
                update: (payload: Record<string, unknown>) => builder("update", payload),
            }),
        } as never,
    };
}

describe("authority is a permission, not a job title", () => {
    it("admits exactly the holder of the manage permission", () => {
        expect(evaluateRequirementExceptionAuthority(HOLDS).allowed).toBe(true);
    });

    it("refuses a caller holding other permissions, however senior the role sounds", () => {
        const decision = evaluateRequirementExceptionAuthority({ permissionKeys: ["health.manage", "crm.customers"] });
        expect(decision.allowed).toBe(false);
    });

    it("DENIES when the grant read failed, because null is not an empty grant set", () => {
        // W-43: collapsing these makes a failure read as OPEN on every surface that gates on it.
        const decision = evaluateRequirementExceptionAuthority({ permissionKeys: null });
        expect(decision.allowed).toBe(false);
    });

    it("names the permission and never what is outstanding", () => {
        const decision = evaluateRequirementExceptionAuthority({ permissionKeys: [] });
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) {
            expect(decision.refusal.detail).toBe("You do not have permission to except an Enrollment requirement.");
        }
    });
});

describe("a decision needs a subject, a requirement, a reason and an author", () => {
    it("refuses without a stated reason", () => {
        const result = validateRequirementExceptionRequest({ identity: IDENTITY, reason: "  ", actorUserId: "u1" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal.code).toBe("missing_reason");
    });

    it("refuses without an author", () => {
        const result = validateRequirementExceptionRequest({ identity: IDENTITY, reason: "why", actorUserId: null });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal.code).toBe("missing_actor");
    });

    it("refuses without the exact requirement", () => {
        const result = validateRequirementExceptionRequest({
            identity: { ...IDENTITY, requirementId: "" },
            reason: "why",
            actorUserId: "u1",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal.code).toBe("missing_requirement");
    });
});

describe("identity is (participation, stage, requirement)", () => {
    it("ignores an exception granted against a different stage", () => {
        // `requirement_id` is stable only WITHIN a stage, so a same-named requirement elsewhere is
        // a different requirement and must keep blocking.
        const map = activeRequirementExceptionsByRequirementId([record({ stage_key: "applied" })], "enrolling");
        expect(map).toEqual({});
    });

    it("ignores revoked and superseded rows", () => {
        const map = activeRequirementExceptionsByRequirementId(
            [record({ id: "a", state: "revoked" }), record({ id: "b", state: "superseded" })],
            "enrolling",
        );
        expect(map).toEqual({});
    });
});

describe("the write seam", () => {
    it("refuses without the permission AND writes nothing", async () => {
        const { client, writes } = fakeClient({});
        const outcome = await grantRequirementException(client, {
            actor: { permissionKeys: [], userId: "user-ops" },
            identity: IDENTITY,
            reason: "Medical exemption on file.",
        });
        expect(outcome.ok).toBe(false);
        // The refusal is worthless if the row was already written.
        expect(writes).toHaveLength(0);
    });

    it("records the exception, and never a form submission", async () => {
        const { client, writes } = fakeClient({ insertReturns: record() });
        const outcome = await grantRequirementException(client, {
            actor: HOLDS,
            identity: IDENTITY,
            reason: "Medical exemption on file with the state.",
        });
        expect(outcome.ok && outcome.changed).toBe(true);
        expect(writes[0]!.payload).toMatchObject({
            disposition: "excepted",
            state: "active",
            requirement_id: "immunization",
            stage_key: "enrolling",
            approved_by: "user-admin",
        });
        // The whole point: no evidence is fabricated anywhere in this path.
        expect(JSON.stringify(writes)).not.toContain("submission");
    });

    it("is idempotent — a repeat grant returns the standing decision and writes nothing", async () => {
        const { client, writes } = fakeClient({ activeRows: [record()] });
        const outcome = await grantRequirementException(client, {
            actor: HOLDS,
            identity: IDENTITY,
            reason: "Medical exemption on file with the state.",
        });
        expect(outcome.ok).toBe(true);
        if (outcome.ok) expect(outcome.changed).toBe(false);
        expect(writes).toHaveLength(0);
    });

    it("treats a lost insert race as the standing decision, not a failure", async () => {
        // The partial unique index is what makes retry safe; losing to it is an ordinary outcome.
        const { client } = fakeClient({ activeRows: [], insertError: { message: "duplicate key", code: "23505" } });
        const raced = fakeClient({ activeRows: [record()] });
        // First read finds nothing, the insert loses, and the re-read finds the winner.
        let reads = 0;
        const client2 = {
            from: () => ({
                select: () => {
                    reads += 1;
                    return reads === 1
                        ? (client as unknown as { from: () => { select: () => unknown } }).from().select()
                        : (raced.client as unknown as { from: () => { select: () => unknown } }).from().select();
                },
                insert: (payload: Record<string, unknown>) =>
                    (client as unknown as { from: () => { insert: (p: Record<string, unknown>) => unknown } })
                        .from()
                        .insert(payload),
            }),
        } as never;
        const outcome = await grantRequirementException(client2, {
            actor: HOLDS,
            identity: IDENTITY,
            reason: "Medical exemption on file with the state.",
        });
        expect(outcome.ok).toBe(true);
        if (outcome.ok) expect(outcome.changed).toBe(false);
    });

    it("revokes with an author and a time, and a second revoke is a no-op", async () => {
        const revoked = record({ state: "revoked", revoked_by: "user-admin", revoked_at: "2026-09-02T00:00:00.000Z" });
        const first = fakeClient({ activeRows: [record()], updateReturns: revoked });
        const outcome = await revokeRequirementException(first.client, { actor: HOLDS, identity: IDENTITY });
        expect(outcome.ok && outcome.changed).toBe(true);
        expect(first.writes[0]!.payload).toMatchObject({ state: "revoked", revoked_by: "user-admin" });

        const again = fakeClient({ activeRows: [] });
        const second = await revokeRequirementException(again.client, { actor: HOLDS, identity: IDENTITY });
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.changed).toBe(false);
        expect(again.writes).toHaveLength(0);
    });

    it("returns NO exceptions when the read fails, so a database problem can only block harder", async () => {
        const { client } = fakeClient({ selectError: { message: "connection reset" } });
        const map = await loadActiveRequirementExceptions(client, {
            orgId: IDENTITY.orgId,
            participationId: IDENTITY.participationId,
            stageKey: IDENTITY.stageKey,
        });
        expect(map).toEqual({});
    });
});

describe("what an exception does to sufficiency", () => {
    const req = (over: Partial<EnrollmentRequirementProgress> & { requirement_id: string }): EnrollmentRequirementProgress =>
        ({
            kind: "form",
            artifact: { kind: "form", id: `fd_${over.requirement_id}` },
            level: "required",
            status: "outstanding",
            ...over,
        }) as EnrollmentRequirementProgress;

    const requirements = [req({ requirement_id: "immunization" }), req({ requirement_id: "handbook", status: "satisfied" })];

    it("makes EXACTLY that requirement non-blocking, and leaves its status alone", () => {
        const exceptions = activeRequirementExceptionsByRequirementId([record()], "enrolling");
        const result = evaluateEnrollmentCompletionSufficiency({ progress: { requirements }, exceptions });
        expect(result.eligible).toBe(true);
        const excepted = result.requirements.find((r) => r.requirement_id === "immunization")!;
        expect(excepted.disposition).toBe("excepted");
        // Visibly excepted, NOT dressed up as submitted — the distinction the record exists for.
        expect(excepted.status).toBe("outstanding");
        expect(excepted.exception?.reason).toBe("Medical exemption on file with the state.");
    });

    it("does not reach a second requirement", () => {
        const exceptions = activeRequirementExceptionsByRequirementId([record()], "enrolling");
        const result = evaluateEnrollmentCompletionSufficiency({
            progress: { requirements: [...requirements, req({ requirement_id: "cis" })] },
            exceptions,
        });
        expect(result.eligible).toBe(false);
        expect(result.blocking.map((b) => b.requirement_id)).toEqual(["cis"]);
    });

    it("blocks again once revoked, while the requirement is still outstanding", () => {
        const exceptions = activeRequirementExceptionsByRequirementId([record({ state: "revoked" })], "enrolling");
        const result = evaluateEnrollmentCompletionSufficiency({ progress: { requirements }, exceptions });
        expect(result.eligible).toBe(false);
        expect(result.blocking.map((b) => b.requirement_id)).toEqual(["immunization"]);
    });
});
