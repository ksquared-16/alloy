/**
 * AN ACTION WITH NO RECORD SUBJECT CAN BE INVOKED WITHOUT ONE.
 *
 * `RegisteredAction.requiredContext.requiresEntityId` is the action owner's declaration. The
 * execute transport used to contradict it — every caller had to supply an `entity_id`, with one
 * hard-coded exemption for `create_lead` — so the only way to invoke a subjectless action was to
 * send a record that is not its subject.
 *
 * For `billing.generate_tuition` that is not a harmless placeholder. An entity id there is read
 * as a SCOPE: it narrows the run to one assignment. A caller satisfying the transport would have
 * billed one child while believing it had billed the month, and the result would have been a
 * partial month indistinguishable from a complete one.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { getRegisteredAction, listRegisteredActionKeys } from "@/lib/adminV2/actions/actionRegistry";
import {
    SUBJECTLESS_ACTION_ENTITY_ID,
    isSubjectlessEntityId,
} from "@/lib/adminV2/actions/subjectlessActionConstants";

const root = path.join(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("the subjectless sentinel", () => {
    it("treats an absent id and the sentinel alike, and a real id as a real id", () => {
        expect(isSubjectlessEntityId("")).toBe(true);
        expect(isSubjectlessEntityId(null)).toBe(true);
        expect(isSubjectlessEntityId(undefined)).toBe(true);
        expect(isSubjectlessEntityId(SUBJECTLESS_ACTION_ENTITY_ID)).toBe(true);
        expect(isSubjectlessEntityId("  ")).toBe(true);
        expect(isSubjectlessEntityId("6f000000-0000-4000-8000-00000000e001")).toBe(false);
    });
});

describe("the transport honours the registry's declaration", () => {
    it("billing.generate_tuition declares it needs no record subject", () => {
        const action = getRegisteredAction("billing.generate_tuition");
        expect(action, "the action is registered").toBeTruthy();
        expect(action!.requiredContext.requiresEntityId).toBe(false);
    });

    it("the execute route consults the registry rather than adding a second special case", () => {
        const route = read("app/api/admin/actions/execute/route.ts");
        expect(route).toContain("getRegisteredAction");
        expect(route).toContain("requiredContext.requiresEntityId === false");
        expect(route).toContain("SUBJECTLESS_ACTION_ENTITY_ID");
        // The create_lead exemption stays — this generalises it, it does not replace it.
        expect(route).toContain("CREATE_LEAD_ACTION_ENTITY_ID");
    });

    /*
     * The scope resolver must ignore the sentinel. Treating it as an assignment id would narrow
     * the run to a record that does not exist: zero charges, and no way to tell that apart from a
     * period with nothing to bill.
     */
    it("the generation scope resolver refuses to read the sentinel as an assignment", () => {
        const source = read("lib/adminV2/actions/definitions/tuitionGenerationActions.ts");
        expect(source).toContain("isSubjectlessEntityId");
        expect(source).toMatch(/isSubjectlessEntityId\(entityId\)\s*\?\s*""/);
    });
});

/*
 * ── THE CENSUS ────────────────────────────────────────────────────────────────────────────────
 *
 * Generalising the transport from "create_lead only" to "whatever the registry declares" widened
 * the door for EVERY action with `requiresEntityId: false` — TWENTY-SIX of them, not the two
 * the change was written for. Most are billing/subsidy factories, so the count is not visible
 * by reading the definition files; it has to be enumerated from the registry. Each now reaches the Command Runtime carrying the sentinel, because the
 * runtime rejects an empty subject (`missing_entity`) and something has to satisfy it.
 *
 * That makes the sentinel a transport artefact travelling through a subject-shaped hole, and the
 * handlers were never told. They express "no subject" as the empty string — `t(entityId) ||
 * <fallback>` — so a truthy sentinel silently defeats the fallback and puts an id that cannot
 * exist onto results, refresh targets and opened records; a child-grain handler reading the
 * subject as a filter would narrow to that non-existent record.
 *
 * The repair is one normalisation in `registeredActionExecutionAdapter`, not twenty-five
 * guards. This census is executable so that a twenty-sixth subjectless action cannot be added
 * without this proof being revisited.
 */
describe("the subjectless action census", () => {
    const subjectless = listRegisteredActionKeys()
        .map((key) => getRegisteredAction(key)!)
        .filter((a) => a.requiredContext.requiresEntityId === false)
        .map((a) => a.actionKey)
        .sort();

    it("is the set this proof was written against", () => {
        expect(subjectless).toEqual([
            "billing.adjust_account",
            "billing.apply_discounts",
            "billing.attribute_payment",
            "billing.configure_expected_funding",
            "billing.configure_responsibility",
            "billing.generate_tuition",
            "billing.reallocate_responsibility",
            "billing.resolve_responsibility",
            "billing.reverse_adjustment",
            "charge.post",
            "charge.reverse",
            "child.add",
            "create_lead",
            "payment.collect_card",
            "payment.record",
            "payment.refund",
            "staff.add",
            "subsidy.build_claim",
            "subsidy.configure_agency",
            "subsidy.configure_program",
            "subsidy.reconcile_remittance",
            "subsidy.record_authorization",
            "subsidy.record_remittance",
            "subsidy.resolve_variance",
            "subsidy.settle_remittance",
            "subsidy.submit_claim",
        ]);
    });

    /*
     * The runtime's subject contract is why the sentinel exists at all. If this ever stops being
     * true the sentinel should be deleted, not carried further.
     */
    it("the runtime still refuses an empty execution subject, which is why a sentinel is needed", () => {
        const runtime = read("lib/platform/commands/runtime/executeCommandInvocation.ts");
        expect(runtime).toContain("missing_entity");
    });

    /*
     * One normalisation, at the single point where a RegisteredAction is handed its subject.
     * Not one guard per action — that would be twenty-five chances to forget.
     */
    it("the adapter normalises the sentinel away before any handler sees it", () => {
        const adapter = read("lib/platform/commands/runtime/adapters/registeredActionExecutionAdapter.ts");
        expect(adapter).toContain("isSubjectlessEntityId");
        expect(adapter).toMatch(/isSubjectlessEntityId\(input\.executionSubject\.entityId\)\s*\?\s*""/);
    });

    /*
     * create_lead keeps its own sentinel. That is a genuinely different contract — it names a
     * record that does not exist YET, rather than an action that has no record subject at all —
     * so it is not folded into this one.
     */
    it("leaves the create_lead sentinel alone as a distinct contract", () => {
        const constants = read("lib/admin/actions/createLeadActionConstants.ts");
        expect(constants).toContain("__create_lead__");
        expect(SUBJECTLESS_ACTION_ENTITY_ID).not.toBe("__create_lead__");
    });
});
