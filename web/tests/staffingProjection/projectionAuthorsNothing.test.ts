/**
 * The projection composes; it must never author.
 *
 * A source guard is a weak proof of behaviour and a strong proof of INTENT, and
 * intent is what this one is for: the rule is that Availability never rewrites an
 * Assignment, Presence never rewrites Coverage, and nothing here writes at all.
 * A reviewer adding an `update` to "fix" a divergence between planned and actual
 * would be making exactly the mistake the authority boundaries exist to prevent,
 * and this turns that into a red test rather than a code-review opinion.
 *
 * The hosted census before and after a projection read is the behavioural half of
 * the same claim.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const DIR = resolve(__dirname, "../../lib/staffingProjection");

const WRITE_CALLS = [
    ".insert(",
    ".update(",
    ".upsert(",
    ".delete(",
];

/** RPCs that mutate. The projection reads two Coverage resolvers and nothing else. */
const FORBIDDEN_RPCS = ["staff_coverage_plan", "staff_coverage_supersede", "staff_coverage_cancel"];

describe("the projection authors nothing", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

    it("has files to check", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        it(`${file} issues no write`, () => {
            const source = readFileSync(resolve(DIR, file), "utf8");
            // Strip block comments so prose about writing does not read as a write.
            const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
            for (const call of WRITE_CALLS) {
                expect(code, `${file} must not call ${call}`).not.toContain(call);
            }
            for (const rpc of FORBIDDEN_RPCS) {
                expect(code, `${file} must not invoke ${rpc}`).not.toContain(rpc);
            }
        });
    }
});
