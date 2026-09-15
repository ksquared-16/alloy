/**
 * The guard that says runtime mode is not audience, tested against the two defects that made it
 * necessary and the one pattern that was always right.
 *
 * A guard nobody has watched fail is a guard nobody knows the shape of. Both specimens below are the
 * real code as it shipped: the sign-in diagnostic that told a remote operator to call the host's
 * loopback address, and the Processing control that offered to delete the fixture a Human-QA
 * walkthrough was walking. If either stops being rejected, the guard has lost the thing it was
 * written for, and this file is where that shows up.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const GUARD = join(WEB, "scripts/checkRuntimeModeAudienceGating.mjs");
const scratch = mkdtempSync(join(tmpdir(), "runtime-mode-gating-"));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function scan(source: string): { violations: { line: number; condition: string }[] } {
    const file = join(scratch, `specimen-${Math.random().toString(36).slice(2)}.tsx`);
    writeFileSync(file, source, "utf8");
    const out = execFileSync("node", [GUARD, "--specimen", file], { encoding: "utf8" });
    return JSON.parse(out);
}

describe("the historical login diagnostic is rejected", () => {
    it("a rendered panel gated only on NODE_ENV is a violation", () => {
        // The shape that shipped: `{isDev ? <panel/> : null}` with isDev from NODE_ENV alone.
        const result = scan(`
            export default function LoginPage() {
                const isDev = process.env.NODE_ENV === "development";
                return (
                    <div>
                        {isDev ? <div>Dev: Supabase connectivity</div> : null}
                    </div>
                );
            }
        `);
        expect(result.violations.length).toBeGreaterThan(0);
    });

    it("the inline form is caught too, not only the named one", () => {
        const result = scan(`
            export default function LoginPage() {
                return <div>{process.env.NODE_ENV !== "production" ? <span>origin</span> : null}</div>;
            }
        `);
        expect(result.violations.length).toBeGreaterThan(0);
    });
});

describe("the Processing developer reset is rejected in its original form", () => {
    it("a rendered destructive control gated only on NODE_ENV is a violation", () => {
        const result = scan(`
            export default function ProcessingOverviewLanding() {
                return (
                    <section>
                        {process.env.NODE_ENV !== "production" ? (
                            <div>
                                <span>Dev reset: Remove all Processing test artifacts</span>
                                <button type="button">Reset test data</button>
                            </div>
                        ) : null}
                    </section>
                );
            }
        `);
        expect(result.violations.length).toBe(1);
        expect(result.violations[0].condition).toContain("NODE_ENV");
    });

    it("the && form is caught as well", () => {
        const result = scan(`
            export default function Surface() {
                const isDev = process.env.NODE_ENV !== "production";
                return <div>{isDev && <button>Reset test data</button>}</div>;
            }
        `);
        expect(result.violations.length).toBe(1);
    });
});

describe("the established double-gated pattern is accepted", () => {
    it("NODE_ENV plus an explicit debug flag passes", () => {
        // CommandSurfaceThread's shape, which was correct before the guard existed.
        const result = scan(`
            export default function CommandSurfaceThread() {
                const showSearchDebug =
                    process.env.NODE_ENV === "development" &&
                    process.env.NEXT_PUBLIC_COMMAND_SURFACE_SEARCH_DEBUG === "1";
                return <div>{showSearchDebug ? <pre>debug</pre> : null}</div>;
            }
        `);
        expect(result.violations).toEqual([]);
    });

    it("the inline double gate passes too", () => {
        const result = scan(`
            export default function Surface() {
                return (
                    <div>
                        {process.env.NODE_ENV === "development"
                            && process.env.NEXT_PUBLIC_PROCESSING_DEBUG === "1"
                            ? <button>Reset test data</button>
                            : null}
                    </div>
                );
            }
        `);
        expect(result.violations).toEqual([]);
    });
});

describe("legitimate NODE_ENV uses are left alone", () => {
    it("logging is not audience gating", () => {
        const result = scan(`
            export default function Surface() {
                if (process.env.NODE_ENV === "development") {
                    console.info("[surface] resolved", { ok: true });
                }
                return <div>product</div>;
            }
        `);
        expect(result.violations).toEqual([]);
    });

    it("a non-rendered branch is not audience gating", () => {
        const result = scan(`
            export default function Surface() {
                const timeoutMs = process.env.NODE_ENV === "development" ? 60000 : 5000;
                return <div data-timeout={timeoutMs}>product</div>;
            }
        `);
        expect(result.violations).toEqual([]);
    });

    it("a safety refusal is not audience gating", () => {
        // The /dev route shape: refuse to exist rather than render something conditionally.
        const result = scan(`
            export default function DevOnlyPage() {
                if (process.env.NODE_ENV === "production") {
                    notFound();
                }
                return <Panel />;
            }
        `);
        expect(result.violations).toEqual([]);
    });
});

describe("the repository invariant holds", () => {
    it("no rendered operator surface outside app/dev is gated on NODE_ENV alone", () => {
        /*
         * Zero is the invariant, not a ceiling. A ceiling above zero would have accepted both
         * defects this guard exists for.
         */
        const out = execFileSync("node", [GUARD], { encoding: "utf8", cwd: WEB });
        expect(out).toContain("no rendered operator surface is gated on NODE_ENV alone");
    });
});
