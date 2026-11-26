/**
 * The guarded gate must have a REAL CALLER and must not be bypassable.
 *
 * A tested-but-uncalled authorization module is not a gate. These tests pin the wiring:
 *   • the commit route branches on the server-derived `execution_kind`
 *   • configured relationships go through `executeRelationshipProposalCommit`
 *   • that executor calls `verifyRelationshipCommitAuthorization` and does not reimplement its checks
 *   • native structural collections stay on the existing native path
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROUTE = path.join(
    process.cwd(),
    "app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/commit/route.ts",
);
const EXECUTOR = path.join(process.cwd(), "lib/pos/processingCase/commit/executeRelationshipProposalCommit.ts");

const routeSrc = fs.readFileSync(ROUTE, "utf8");
const executorSrc = fs.readFileSync(EXECUTOR, "utf8");

/** Code lines only — a comment mentioning a name is not a call. */
function code(src: string): string {
    return src
        .split("\n")
        .filter((l) => {
            const t = l.trim();
            return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
        })
        .join("\n");
}

describe("guarded relationship commit — route wiring", () => {
    it("the route branches on the server-derived execution_kind", () => {
        expect(code(routeSrc)).toContain('execution_kind === "configured_relationship"');
    });

    it("the route delegates configured relationships to the guarded executor", () => {
        expect(code(routeSrc)).toContain("executeRelationshipProposalCommit");
    });

    it("the route still routes native structural collections to the existing native path", () => {
        expect(code(routeSrc)).toContain("executeExistingChildProposalCommit");
    });

    it("THE GATE HAS A CALLER — the executor invokes verifyRelationshipCommitAuthorization", () => {
        expect(code(executorSrc)).toContain("verifyRelationshipCommitAuthorization(");
    });

    it("the executor delegates through the command runtime, not straight to the writer", () => {
        const c = code(executorSrc);
        expect(c).toContain("executeCommandInvocation");
        // It must NOT reach past the adapter into the executor or the physical relationship writer.
        // (Writing its own commit ledger to `processing_cases` is fine — that is not a relationship
        // write, and it is what makes retries idempotent.)
        expect(c).not.toContain("executeRelationshipAction(");
        expect(c).not.toContain("customer_member_contacts");
        expect(c).not.toContain("person_child_relationship_roles");
        expect(c).not.toContain("person_child_relationships");
    });

    it("the executor never sends a client role or command to the runtime", () => {
        const c = code(executorSrc);
        // The adapter pins the role from the definition-derived registry entry; sending one would
        // reintroduce the spoof this whole path exists to remove.
        // Assert on the INVOCATION payload specifically: a `roleKey` parameter name elsewhere in the
        // module is fine; putting one into inputValues is not.
        const inputs = c.slice(c.indexOf("inputValues: {"), c.indexOf("confirmationRequired"));
        expect(inputs.length, "could not locate the invocation inputValues block").toBeGreaterThan(0);
        expect(inputs).not.toContain("roleKey");
        expect(inputs).not.toContain("commandKey");
        expect(inputs).not.toContain("writeTarget");
        expect(inputs).not.toContain("executorKind");
    });

    it("the route does not reimplement the gate's checks inline", () => {
        const c = code(routeSrc);
        for (const inlined of [
            "client_role_not_authoritative",
            "client_command_not_authoritative",
            "scope_not_supported",
            "unknown_definition",
            "proposal_not_approved",
            "relationshipDefinitionForRef",
        ]) {
            expect(c, `route reimplements gate logic: ${inlined}`).not.toContain(inlined);
        }
    });

    it("the route accepts a scope override but treats role/command as assertions only", () => {
        const c = code(routeSrc);
        expect(c).toContain("assertedRoleKey");
        expect(c).toContain("assertedCommandKey");
        // and passes them to the gate rather than acting on them
        expect(c).toContain("request:");
    });

    it("the executor returns structured outcomes and an idempotency key", () => {
        const c = code(executorSrc);
        for (const outcome of ["applied", "already_applied", "rejected", "stale", "conflicted", "failed"]) {
            expect(c, `missing outcome: ${outcome}`).toContain(`"${outcome}"`);
        }
        expect(c).toContain("idempotency_key");
        expect(c).toContain("persistence_destination");
    });
});
