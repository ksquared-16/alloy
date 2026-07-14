/**
 * P1 · Wave B — boundary guards. The intake admits typed authoring acts and emits
 * one Authoring Act. It must NOT contain: final Authority→Standing resolution,
 * ratification, evaluation/Judgment/Gap, revision/correction PROPAGATION behavior,
 * or any domain-specific (Billing/Scheduling/Current Work/AI) authoring branch.
 * These are grep guards over the intake source (comments stripped).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const INTAKE_DIR = join(__dirname, "../../../lib/operationalExpectations/intake");
const files = readdirSync(INTAKE_DIR).filter((f) => f.endsWith(".ts"));

function codeOf(file: string): string {
    return readFileSync(join(INTAKE_DIR, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
}

// Executable tokens for behaviors that belong to later waves/packages. We match
// call-sites / declarations, not prose (comments are stripped above).
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
    { label: "Standing resolver (Wave C)", re: /function\s+\w*resolveStanding|resolveAuthorityToStanding\s*\(/i },
    { label: "ratification (Wave C)", re: /function\s+\w*ratif|\bratify\s*\(/i },
    { label: "evaluation engine (P3)", re: /function\s+\w*evaluateExpectation|computeJudgment\s*\(/i },
    { label: "Judgment/Gap creation (P3)", re: /createJudgment\s*\(|deriveGap\s*\(|insertGap\s*\(/i },
    { label: "revision/correction propagation (Wave D)", re: /propagateTransition\s*\(|unwindCorrection\s*\(|replanRevision\s*\(/i },
    { label: "effector invocation (P7)", re: /invokeEffector\s*\(|routeToEffector\s*\(/i },
    { label: "domain-specific authoring branch", re: /\b(billing|scheduling|currentWork|forecast)Author\w*\s*\(/i },
];

describe("Wave B intake — no later-wave behavior", () => {
    it("has intake source files to scan", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        it(`${file} contains no Standing/evaluation/propagation/effector/domain-branch code`, () => {
            const code = codeOf(file);
            for (const { label, re } of FORBIDDEN) {
                expect(re.test(code), `${file} unexpectedly matches ${label}`).toBe(false);
            }
        });
    }

    it("standing is never authored as 'binding' by the intake (grep guard)", () => {
        // The service clamps to proposed|model; binding must not appear as a value
        // the intake assigns. (Behavior is proven in authoringIntake.test.ts.)
        const service = codeOf("authorOperationalExpectation.ts");
        expect(/["']binding["']/.test(service)).toBe(false);
    });
});
