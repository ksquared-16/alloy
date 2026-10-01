/**
 * THE CARD READS WHAT THE ROUTE ACTUALLY SENDS.
 *
 * `/api/admin/actions/execute` reshapes the executor's answer before it crosses the network:
 *
 *     apiOk({ execution_result: result.actionResult.result.detail,
 *             affected_id:     result.actionResult.result.affectedId })
 *
 * The Add Charge commit read `json.result.affectedId` and `json.result.detail` — the executor's
 * INTERNAL shape, which never reaches the browser. Both were therefore always undefined, and two
 * things silently never ran:
 *
 *   · the follow-up that makes a charge inherit the standing arrangement — the W7 defect;
 *   · the idempotency check, which is why repeated clicks could each report success.
 *
 * Captured verbatim from deployed staging (responsibility/charge-add-response.json):
 *
 *     {"ok":true,"data":{"execution_result":{"write_status":"created",…},
 *                        "affected_id":"77b02ec2-…"},"correlation_id":"…"}
 *
 * This is the second producer/consumer mismatch in one path, so both halves are bound together:
 * the route's transform and the card's read.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const CARD = strip(read("components/admin/focusPanel/cards/FinancialsCard.tsx"));
const ROUTE = strip(read("app/api/admin/actions/execute/route.ts"));

describe("the route's wire shape", () => {
    it("sends execution_result and affected_id, not the executor's field names", () => {
        expect(ROUTE).toMatch(/execution_result: result\.actionResult\.result\.detail/);
        expect(ROUTE).toMatch(/affected_id: result\.actionResult\.result\.affectedId/);
    });
});

describe("the Add Charge commit reads that shape", () => {
    it("takes the created charge id from data.affected_id", () => {
        expect(/String\(json\.data\?\.affected_id \?\? ""\)/.test(CARD)).toBe(true);
    });

    it("takes the per-child detail from data.execution_result", () => {
        expect(/const detail = json\.data\?\.execution_result \?\? null;/.test(CARD)).toBe(true);
    });

    it("no longer reads the executor's internal shape anywhere in the commit", () => {
        /*
         * `json.result.*` never crosses the network. If it reappears, the follow-up work stops
         * running again and nothing else in the surface will say so — the charge is still created,
         * which is exactly why this failed silently for so long.
         */
        expect(CARD).not.toMatch(/json\.result\?\.affectedId/);
        expect(CARD).not.toMatch(/json\.result\?\.detail/);
    });

    it("feeds those ids to the follow-up that inherits responsibility", () => {
        expect(/await applyChargeDecisions\(createdChargeIds\)/.test(CARD)).toBe(true);
        /* And the follow-up still refuses to run on an empty list, which is the honest guard. */
        expect(/if \(chargeIds\.length === 0\) return failures;/.test(CARD)).toBe(true);
    });
});
