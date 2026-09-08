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

import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
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
