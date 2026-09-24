/**
 * DELIVERING THE PARTICIPANT THE DOCUMENT ALREADY RESOLVED.
 *
 * Measured on deployed 41c67ec17: the document's producers ran Attendance (141ms) and Health
 * (470ms) and shipped their answers in `operationalProjection` — and the browser still reserved
 * both cells until the drawer settled ~3.5s later. The browser decides card readiness from its OWN
 * commit context, and that context had no participantScope, because the resolved identity never
 * left the server.
 *
 * This is a transport chain across seven files, so these gates hold the chain rather than any one
 * hop: the identity is resolved ONCE on the server, carried as identity only, and consumed by the
 * existing builder. Nothing here may re-derive it in the browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DOC = codeOf(read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"));
const SURFACE = codeOf(read("components/presentation/workUnit/ProvisionedWorkUnitSurface.tsx"));
const CTX = codeOf(read("components/presentation/workUnit/OperationalSubjectContext.tsx"));
const PANEL = codeOf(read("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"));
const BODY = codeOf(read("components/admin/focusPanel/OpportunityFocusPanelBody.tsx"));

describe("gate A — the identity reaches the browser's commit model", () => {
    it("the document puts it on the answer", () => {
        /*
         * THE DELIVERY MECHANISM CHANGED; THE OBLIGATION DID NOT.
         *
         * This asserted a direct write, `answer.resolvedParticipant = resolvedParticipant`, which
         * was the only way to deliver it while the route produced one settled answer. Two-phase
         * seed emission (P0-7.6) made the participant part of the SETTLEMENT patch, because
         * resolving it costs a read the frame must not wait for — measured `card_producers_ms`
         * P50 740ms sitting between a decided geometry and a committed frame.
         *
         * So the gate now asserts what it always meant: the route RESOLVES the participation
         * identity and hands it to the browser. It no longer dictates which of the two payloads
         * carries it, because both are the same answer to the browser.
         */
        expect(DOC).toContain("resolvedParticipant");
        expect(DOC).toContain("resolveSoleEnrollmentParticipantForOpportunity");
        // ...and it reaches the browser through the settlement contract, applied monotonically.
        expect(DOC).toContain("applyProvisioningSettlement");
    });

    it("every hop of the transport chain is wired", () => {
        // Each of these is a separate file; a break anywhere silently reserves the cards again,
        // which is exactly the defect this closes and is invisible from any single file.
        /*
         * The hop is unchanged; its GUARD is. `resolvedParticipant` is a fact about a record, so it
         * now flows through `factsOp`, which is the answer only while that answer describes the
         * SELECTED subject. Identity commits as soon as the operator picks a row, so an ungated
         * `op` here would deliver the previous subject's participant under the new subject's
         * identity — the mixed-subject frame, reached through this very chain.
         */
        expect(SURFACE).toContain("resolvedParticipant={factsOp ? factsOp.resolvedParticipant ?? null : null}");
        expect(CTX).toContain("resolvedParticipant: resolvedParticipant ?? null");
        expect(PANEL).toContain("resolvedParticipant: operational.resolvedParticipant ?? null");
        expect(BODY).toContain("resolvedParticipant: commitCritical.resolvedParticipant ?? null");
    });
});

describe("gate C — one owner; the browser never derives identity", () => {
    it("no client file resolves a participant itself", () => {
        for (const [name, src] of [["surface", SURFACE], ["context", CTX], ["panel", PANEL], ["body", BODY]] as const) {
            expect(src, `${name} must not resolve`).not.toContain("resolveSoleEnrollmentParticipantForOpportunity");
            expect(src, `${name} must not scan candidates`).not.toContain("participantCandidatesFromTruth");
            expect(src, `${name} must not read intake metadata`).not.toContain("_inquiry_children");
        }
    });
});

describe("gate N — identity is transported, permission is not", () => {
    it("the carried contract is exactly two identity fields", () => {
        // codeOf: the doc comment above the field legitimately NAMES what the field excludes.
        const contract = codeOf(read("lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput.ts"));
        // The whole declaration LINE: the first `;` sits inside the inline object type.
        const line = contract
            .split("\n")
            .find((l) => l.trim().startsWith("resolvedParticipant"))!;
        expect(line).toContain("participationId");
        expect(line).toContain("customerMemberId");
        for (const forbidden of ["access", "grants", "roleKeys", "canView", "permission", "photo", "profile"]) {
            expect(line, `must not carry ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("the producers still resolve authorization at request time", () => {
        expect(DOC).toContain("access: gate.access");
    });
});
