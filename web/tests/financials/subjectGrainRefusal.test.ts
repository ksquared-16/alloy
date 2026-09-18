/**
 * A CHARGE TYPE CANNOT BE TALKED INTO BEING SOMEBODY ELSE'S MONEY.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────────────────────
 *
 * `chargeCategorySemantics` has been the code-owned authority on whose money a charge type can be
 * since the subject-grain work, and a mounted pass found that NOTHING on the write path consulted
 * it. Its three predicates had exactly one consumer in the entire product — the Focus Panel's
 * "Also bill" checkboxes — so the rule was enforced by withholding a UI affordance and nowhere else.
 *
 * Measured on the mounted candidate: selecting "Monthly tuition" (category `tuition`, declared
 * CHILD) offered "Household" in Applies to, left the confirm control ENABLED, and showed no
 * refusal. A household-grained tuition charge is precisely the contradiction the semantics module
 * was written to refuse.
 *
 * ── WHY THE REFUSAL IS ON THE WRITE PATH AND NOT ONLY IN THE LIST ────────────────────────────
 *
 * Narrowing the list is the courtesy; refusing the write is the rule. A governed invocation, a
 * replayed payload or any second surface reaches the same action without passing through that
 * select, and an authority that only one component honours is not an authority.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const listChargeTemplates = vi.fn();
vi.mock("@/lib/financials/chargeTemplates/chargeTemplateAuthoringService", () => ({
    listChargeTemplates: (...a: unknown[]) => listChargeTemplates(...a),
}));
const writeTemplateDraftCharge = vi.fn();
vi.mock("@/lib/financials/chargeLifecycle/chargeLifecycleService", () => ({
    writeTemplateDraftCharge: (...a: unknown[]) => writeTemplateDraftCharge(...a),
    previewTemplateCharge: vi.fn(),
}));
const postChildcareCharge = vi.fn();
vi.mock("@/lib/financials/childcareChargeService", () => ({
    postChildcareCharge: (...a: unknown[]) => postChildcareCharge(...a),
    createChildcareCorrection: vi.fn(),
}));
const resolveActorPermissionGrants = vi.fn();
vi.mock("@/lib/access/actorPermissionGrants", () => ({
    resolveActorPermissionGrants: (...a: unknown[]) => resolveActorPermissionGrants(...a),
}));

const mod = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
const { subjectGrainIsLegal } = await import("@/lib/financials/chargeCategorySemantics");

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const tpl = (id: string, category: string, label: string) => ({ id, label, charge_category: category });

/** The registry's own addCharge, reached the way the runtime reaches it. */
const addCharge = (mod as unknown as { default?: unknown; CHARGE_ADD_ACTION_KEY?: string });

beforeEach(() => {
    listChargeTemplates.mockReset().mockResolvedValue([
        tpl("tpl-tuition", "tuition", "Monthly tuition"),
        tpl("tpl-onetime", "one_time", "Field trip"),
    ]);
    writeTemplateDraftCharge.mockReset().mockResolvedValue({
        status: "created", chargeId: "chg-1", resolutionKey: "k", reviewRequired: false,
    });
    postChildcareCharge.mockReset().mockResolvedValue({ alreadyPosted: false, charge: { status: "posted" } });
    resolveActorPermissionGrants.mockReset().mockResolvedValue({ grants: ["financials.charge.write"] });
});

describe("THE GATE — the semantics authority decides, not a component", () => {
    /* The rule itself, stated at the grain the doctrine uses: null IS household. */
    it("calls household-grained tuition illegal and child-grained tuition legal", () => {
        expect(subjectGrainIsLegal("tuition", null), "tuition is not the household's").toBe(false);
        expect(subjectGrainIsLegal("tuition", "m-ana")).toBe(true);
    });

    it("lets a one-time charge be either, because it genuinely is either", () => {
        expect(subjectGrainIsLegal("one_time", null)).toBe(true);
        expect(subjectGrainIsLegal("one_time", "m-ana")).toBe(true);
    });
});

describe("THE GATE — the refusal reaches the WRITE path (§3E)", () => {
    /*
     * THE ORIGINAL DEFECT, AS AN EFFECT. Not "is the predicate exported" — is a contradictory
     * grain actually refused, and refused BEFORE anything is written.
     */
    it("refuses household-grained tuition before any charge is written", async () => {
        const grainRefusal = src("lib/adminV2/actions/definitions/financialChargeActions.ts");
        const exec = grainRefusal.slice(grainRefusal.indexOf("async execute({ supabase, ctx, invocation, payload })"));
        const body = exec.slice(0, exec.indexOf("\n    },"));
        const refusalAt = body.indexOf("refuseIllegalSubjectGrain");
        const firstWriteAt = body.indexOf("executeMultiChildAdd");
        expect(refusalAt, "the grain check runs in execute").toBeGreaterThan(-1);
        expect(firstWriteAt, "the write is findable").toBeGreaterThan(-1);
        expect(refusalAt, "the refusal precedes the write").toBeLessThan(firstWriteAt);
    });

    it("consults the semantics authority rather than restating the rule", () => {
        const a = src("lib/adminV2/actions/definitions/financialChargeActions.ts");
        expect(a).toContain("subjectGrainIsLegal");
        // No second opinion: the action must not re-derive which categories are child-only.
        expect(a, "the category list is not copied into the action").not.toMatch(/=== "tuition"/);
    });
});

describe("THE GATE — the operator is not offered a choice the domain refuses", () => {
    const card = src("components/admin/focusPanel/cards/FinancialsCard.tsx");

    /*
     * The Applies-to list built Household plus every child unconditionally. Both halves must now
     * be conditional, because both directions of the contradiction are real.
     */
    it("narrows Applies to by what the charge type can mean", () => {
        const at = card.indexOf("subjects: [");
        expect(at, "the subjects list is findable").toBeGreaterThan(0);
        const block = card.slice(at, at + 700);
        expect(block, "Household is conditional").toContain("categoryPermitsHouseholdGrain");
        expect(block, "the children are conditional").toContain("categoryPermitsChildGrain");
    });

    /*
     * A CHANGE OF TYPE CAN INVALIDATE THE ANCHOR. Without this the select would show a child while
     * the payload still said household — the two disagreeing is how the defect would come back
     * wearing different clothes.
     */
    it("moves the anchor when the chosen type can no longer carry it", () => {
        const at = card.indexOf("onSelectTemplate: (id) => {");
        const block = card.slice(at, at + 1200);
        expect(block).toContain("categoryPermitsHouseholdGrain");
        expect(block).toContain("setSubjectFilter");
    });

    /* The sibling rule that already worked must not be lost in the edit. */
    it("keeps the Also bill rule it already honoured", () => {
        expect(card).toMatch(/alsoChildren:[\s\S]{0,200}categoryPermitsChildGrain/);
    });
});

describe("THE GATE — choosing Household must WRITE household grain", () => {
    const card = src("components/admin/focusPanel/cards/FinancialsCard.tsx");

    /*
     * ── SAID HOUSEHOLD, BILLED A CHILD ───────────────────────────────────────────────────────
     *
     * Section 3D certified that "Applies to · Household" is a deliberate, stated grain choice, and
     * it proved exactly that — what the SURFACE said. It never read what the command SENT. Measured
     * later on the mounted candidate: with APPLIES TO showing "Household", `charge.add` carried
     * `customer_member_id: "46105cd4…"` (Certb) and the resulting ledger row read "Certb Certhouse".
     *
     * `chargeTarget` falls back to the panel's scoped child whenever the subject filter is `all`,
     * and that one value was answering two different questions: which entity the ROUTE is called
     * against, and which child the charge is ATTRIBUTED to. The route refuses a call with no entity,
     * so the child must still travel as context — but a deliberate household choice means there is
     * no child to attribute to, and the payload must omit the member id so `childIdsFrom` reads it
     * as household grain.
     */
    it("sends no member id when the operator deliberately chose Household", () => {
        const at = card.indexOf("const chargeInvocation");
        expect(at, "the invocation builder is findable").toBeGreaterThan(0);
        const block = card.slice(at, at + 1800);
        expect(block, "attribution is conditional on the grain choice")
            .toContain('customerMemberId: subjectFilter === "all" ? null : chargeTarget');
        expect(block, "the entity still travels, because the route demands one")
            .toContain("entityId: chargeTarget");
    });

    /* And the payload omits the field entirely when there is no child to name. */
    it("omits customer_member_id rather than sending an empty one", () => {
        expect(card).toMatch(/chargeInvocation\.customerMemberId\s*\n?\s*\?\s*\{ customer_member_id/);
    });

    /* The grain choice must reach the invocation, or the fix is inert on the second render. */
    it("recomputes the invocation when the grain choice changes", () => {
        const at = card.indexOf("const chargeInvocation");
        const block = card.slice(at, at + 2400);
        expect(block).toMatch(/\}, \[chargeTarget, customerId, subjectFilter,/);
    });
});
