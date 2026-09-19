/**
 * THE DOCUMENT'S PARTICIPANT AUTHORITY — Option A's keystone, gated.
 *
 * The document has always run `projectFocusPanelCardProducers`. Measured on deployed 50f2601be it
 * spent 674ms there and produced Financials ONLY: `attendance_ms` and `health_ms` were null on
 * every sample, because the commit context could learn its child only from `child.*` keys that a
 * FAMILY-grain opportunity does not carry. So two of the seven blocking areas could not be
 * answered without a second ~3,700ms round trip to learn something one indexed read already knew.
 *
 * These gates hold the fix to the source that made #1075 fail, and to the refusal semantics that
 * make it safe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const RESOLVER = codeOf(read("lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity.ts"));
const DOC = codeOf(read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"));
const COMMIT_CTX = codeOf(read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts"));

describe("gate A — the authoritative source, not intake metadata", () => {
    it("resolves participation from process_instances", () => {
        expect(RESOLVER).toContain("listEnrollmentInstancesForLead");
    });

    it("never reads intake metadata for identity — this is exactly how #1075 failed", () => {
        expect(RESOLVER).not.toContain("_inquiry_children");
        expect(RESOLVER).not.toContain("metadata.inquiry_children");
        expect(DOC).not.toContain("_inquiry_children");
    });

    it("the document consumes the canonical resolver rather than deriving identity itself", () => {
        expect(DOC).toContain("resolveSoleEnrollmentParticipantForOpportunity");
        expect(DOC).not.toContain("participantCandidatesFromTruth");
    });
});

describe("gate B — ambiguity is refused, never first-child-wins", () => {
    const rows = (...r: Array<{ id: string; subject_id: string; subject_type?: string }>) => r;

    async function resolve(instances: ReturnType<typeof rows>) {
        const mod = await import(
            "@/lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity"
        );
        const proc = await import("@/lib/process/processInstances");
        const spy = proc.listEnrollmentInstancesForLead as unknown as { mock?: unknown };
        void spy;
        return mod.resolveSoleEnrollmentParticipantForOpportunity({
            supabase: {
                from: () => ({
                    select: () => ({
                        eq: () => ({ eq: () => ({ eq: () => ({ data: instances, error: null }) }) }),
                    }),
                }),
            } as never,
            orgId: "org-1",
            opportunityId: "opp-1",
        });
    }

    it("one enrolled child resolves", async () => {
        const got = await resolve(rows({ id: "pi-1", subject_id: "cm-1", subject_type: "child" }));
        expect(got).toEqual({ participationId: "pi-1", customerMemberId: "cm-1" });
    });

    it("two enrolled children resolve to NOTHING", async () => {
        const got = await resolve(
            rows(
                { id: "pi-1", subject_id: "cm-1", subject_type: "child" },
                { id: "pi-2", subject_id: "cm-2", subject_type: "child" },
            ),
        );
        // Picking the first would attribute one child's attendance and health to another — the two
        // cards where that is least acceptable.
        expect(got).toBeNull();
    });

    it("no enrolled child resolves to nothing", async () => {
        expect(await resolve(rows())).toBeNull();
    });

    it("a non-child participation is not a participant", async () => {
        const got = await resolve(rows({ id: "pi-1", subject_id: "cm-1", subject_type: "customer_member" }));
        expect(got).toBeNull();
    });
});

describe("gate C — the commit frame can now carry a participant", () => {
    it("the commit context consults the resolved participation after a stated child subject", () => {
        expect(COMMIT_CTX).toContain("scopeFromResolvedParticipantForCommit");
        /*
         * Precedence inside the EXPRESSION, not the file: the helper is declared above the builder,
         * so a whole-file index comparison compares against its definition and proves nothing.
         */
        const expr = COMMIT_CTX.slice(
            COMMIT_CTX.indexOf("participantScope:"),
            COMMIT_CTX.indexOf("truth: {"),
        );
        const i = expr.indexOf("participantScopeFromChildSubjectTruth(");
        const j = expr.indexOf("scopeFromResolvedParticipantForCommit(");
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
        expect(expr).toContain("??");
    });

    it("the commit scope carries identity only — no borrowed presentation", () => {
        // The commit frame holds no candidate rows; inventing a name or photo would put one
        // child's presentation on another's card.
        const fn = COMMIT_CTX.slice(COMMIT_CTX.indexOf("function scopeFromResolvedParticipantForCommit"));
        expect(fn.slice(0, 600)).toContain("displayName: null");
        expect(fn.slice(0, 600)).toContain("imageUrl: null");
    });
});

describe("gate D — authorization is unchanged and request-time", () => {
    it("the producers still receive the route's own resolved authority", () => {
        expect(DOC).toContain("access: gate.access");
    });

    it("no permission answer is carried in document truth", () => {
        expect(DOC).not.toMatch(/persistedGrant|cachedPermission|storedAccess/);
    });
});
