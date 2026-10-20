/**
 * Cold/warm parity: a record opened by deep link or refresh (a CONTEXTUAL answer — no lens chosen)
 * carries the lens set's count locations, so pill counts settle exactly as after pill navigation; and
 * still chooses no lens and settles no queue total.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { composeContextualFocusAnswer } from "@/lib/runtime/provisioning/contextualFocusAnswer";

describe("contextual answer counts", () => {
    it("passes the count locations through and still selects no lens", () => {
        const settlement = {
            status: "resolved" as const,
            workViewCountTargets: [{ workViewId: "new", hostWorkUnitId: "wu", baseQueueKey: "q" }],
            queueTotalTarget: null,
            rightRailTarget: null,
        };
        const r = composeContextualFocusAnswer({
            orgId: "org",
            workUnit: { id: "wu", key: "k", name: "Enrollment", departmentId: "d" },
            businessProcess: { key: "enrollment", name: "Enrollment" },
            lensSet: [],
            recordOfTruth: { entityType: "opportunity", id: "opp" },
            subject: { id: "opp", grain: "case" as never, subjectType: "opportunity" as never },
            settlement,
            startedAt: 0,
            now: () => 1,
        });
        expect(r.ok && r.answer.settlement).toEqual(settlement);
        expect(r.ok && r.answer.activeWorkView).toBeNull();
    });

    it("the settlement hook counts a contextual answer's pills but no KPI or queue total", () => {
        const src = fs.readFileSync(path.join(process.cwd(), "lib/presentation/runtime/useWorkUnitSettlement.ts"), "utf8");
        expect(src).toContain("settleable?.settlement ?? contextualLocators");
        expect(src).toMatch(/nothingToSettle = snapshot\?\.terminal === "contextual" && contextualLocators\?\.status !== "resolved"/);
        const answer = fs.readFileSync(path.join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"), "utf8");
        expect(answer).toMatch(/activeWorkViewId: null,[\s\S]{0,200}surfaceWorkUnitId: ""/);
    });
});
