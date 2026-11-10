/**
 * W-C1 (migration 20261222090000): the service layer that passes an audit binding to the four effect functions.
 *
 * Proven here with a recording RPC fake:
 *   - with a binding, every call carries p_audit_event_id and the actor facts; without one (staff routes), neither key
 *     is sent, so staff calls are byte-for-byte what they were (T7, TS half);
 *   - before the migration is applied, PostgREST answers PGRST202 and nothing ran: exactly one retry with the legacy
 *     arguments; no retry without a binding, and none for any other error (a real refusal is never repeated);
 *   - audit_event_mismatch maps to AUDIT_EVENT_MISMATCH (the routes answer 503 AUDIT_UNAVAILABLE);
 *   - the actor facts match what recordDocumentAudit writes, for an application, a system process and a staff user.
 * The SQL contract itself (match, unique binding, no write on mismatch, legacy signatures gone) is the rollback
 * invariant certification/invariants/documents-w-c1-audit-linkage.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { auditActorFacts, isRpcSignatureMissing, withAudit } from "@/lib/documents/documentAudit";
import { linkDocumentSubject, unlinkDocumentSubject } from "@/lib/documents/documentSubjects";
import { reviewDocumentVersion, setDocumentVersionValidity } from "@/lib/documents/review/documentReviewService";

const ORG = "0a000000-0000-4000-8000-0000000000c1";
const DOC = "d0000000-0000-4000-8000-0000000000c1";
const VER = "e0000000-0000-4000-8000-0000000000c1";
const SUBJ = "cb000000-0000-4000-8000-0000000000c1";
const BINDING = { eventId: "evt-7", actor: { actor_kind: "application", actor_application_id: "app-1", actor_installation_id: "inst-1" } };

type Reply = { data: unknown; error: { code?: string; message: string } | null };
function fake(replies: Reply[]) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
        rpc: async (fn: string, args: Record<string, unknown>) => {
            calls.push({ fn, args });
            return replies.shift() ?? { data: {}, error: null };
        },
    } as unknown as SupabaseClient;
    return { client, calls };
}
const OK_REVIEW: Reply = { data: { event_id: "e", review_status: "accepted", previous_review_status: null, rereview: false }, error: null };
const OK_VALIDITY: Reply = { data: { changed: true, effective_on: "2026-11-01", expires_on: "2027-10-31" }, error: null };
const MISSING: Reply = { data: null, error: { code: "PGRST202", message: "Could not find the function public.document_review_version in the schema cache" } };

const effects = [
    {
        name: "review",
        run: (c: SupabaseClient, audit?: typeof BINDING) =>
            reviewDocumentVersion(c, { orgId: ORG, documentId: DOC, versionId: VER, decision: "accepted", reason: null, actorUserId: null, rereview: false, audit }),
        ok: OK_REVIEW,
    },
    {
        name: "validity",
        run: (c: SupabaseClient, audit?: typeof BINDING) =>
            setDocumentVersionValidity(c, { orgId: ORG, documentId: DOC, versionId: VER, effectiveOn: "2026-11-01", expiresOn: "2027-10-31", reason: null, actorUserId: null, audit }),
        ok: OK_VALIDITY,
    },
    {
        name: "link",
        run: (c: SupabaseClient, audit?: typeof BINDING) =>
            linkDocumentSubject(c, { orgId: ORG, documentId: DOC, subjectType: "child", subjectId: SUBJ, association: "context", actorUserId: null, audit }),
        ok: { data: { created: true }, error: null } as Reply,
    },
    {
        name: "unlink",
        run: (c: SupabaseClient, audit?: typeof BINDING) =>
            unlinkDocumentSubject(c, { orgId: ORG, documentId: DOC, subjectType: "child", subjectId: SUBJ, actorUserId: null, audit }),
        ok: { data: { ended: true }, error: null } as Reply,
    },
];

describe("W-C1 service binding", () => {
    for (const e of effects) {
        it(`${e.name}: a binding sends the audit id and actor facts; no binding sends neither key (staff routes unchanged)`, async () => {
            const bound = fake([e.ok]);
            expect((await e.run(bound.client, BINDING)).ok).toBe(true);
            expect(bound.calls).toHaveLength(1);
            expect(bound.calls[0].args).toMatchObject({ p_audit_event_id: "evt-7", p_audit_payload: BINDING.actor });

            const staff = fake([e.ok]);
            expect((await e.run(staff.client)).ok).toBe(true);
            expect(staff.calls[0].args).not.toHaveProperty("p_audit_event_id");
            expect(staff.calls[0].args).not.toHaveProperty("p_audit_payload");
        });

        it(`${e.name}: PGRST202 (migration not applied, nothing ran) retries once with the legacy arguments`, async () => {
            const f = fake([MISSING, e.ok]);
            expect((await e.run(f.client, BINDING)).ok).toBe(true);
            expect(f.calls).toHaveLength(2);
            expect(f.calls[1].args).not.toHaveProperty("p_audit_event_id");
            const { p_audit_event_id: _i, p_audit_payload: _p, ...legacy } = f.calls[0].args;
            expect(f.calls[1].args).toEqual(legacy);
        });

        it(`${e.name}: no retry without a binding, and none for any other error; a mismatch is AUDIT_EVENT_MISMATCH`, async () => {
            const unbound = fake([MISSING]);
            expect((await e.run(unbound.client)).ok).toBe(false);
            expect(unbound.calls).toHaveLength(1);

            const other = fake([{ data: null, error: { code: "P0001", message: "something else" } }]);
            expect((await e.run(other.client, BINDING)).ok).toBe(false);
            expect(other.calls).toHaveLength(1);

            const mismatch = fake([{ data: null, error: { code: "22023", message: "audit_event_mismatch" } }]);
            const r = await e.run(mismatch.client, BINDING);
            expect(r.ok).toBe(false);
            expect((r as { code: string }).code).toBe("AUDIT_EVENT_MISMATCH");
            expect(mismatch.calls).toHaveLength(1);
        });
    }
});

describe("W-C1 actor facts match what recordDocumentAudit writes", () => {
    it("application: kind, application and installation (the credential stays in the audit, not required to match)", () => {
        expect(auditActorFacts({ actorUserId: null, actorPrincipal: { kind: "application", applicationId: "app-1", installationId: "inst-1", credentialId: "cred-1" } }))
            .toEqual({ actor_kind: "application", actor_application_id: "app-1", actor_installation_id: "inst-1" });
    });
    it("system process by name; staff user by id; nothing when there is no actor", () => {
        expect(auditActorFacts({ actorUserId: null, actorPrincipal: { kind: "system", process: "api_upload_escalation" } })).toEqual({ actor_kind: "system", actor_process: "api_upload_escalation" });
        expect(auditActorFacts({ actorUserId: "u-1" })).toEqual({ actor_user_id: "u-1" });
        expect(auditActorFacts({ actorUserId: null })).toEqual({});
    });
    it("withAudit adds keys only with a binding; PGRST202 is the only signature-missing code", () => {
        expect(withAudit({ a: 1 }, undefined)).toEqual({ a: 1 });
        expect(withAudit({ a: 1 }, BINDING)).toEqual({ a: 1, p_audit_event_id: "evt-7", p_audit_payload: BINDING.actor });
        expect(isRpcSignatureMissing({ code: "PGRST202" })).toBe(true);
        expect(isRpcSignatureMissing({ code: "42883" })).toBe(false);
        expect(isRpcSignatureMissing(null)).toBe(false);
    });
});
