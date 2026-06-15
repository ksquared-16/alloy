import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * PKG-06 — provider-leakage guardrail.
 * Provider-name branching is allowed ONLY inside lib/communications/v2/providers (the registry).
 * Anywhere else in the V2 namespace it is a doctrine violation.
 */
const WEB_ROOT = join(process.cwd());
const V2_ROOT = join(WEB_ROOT, "lib", "communications", "v2");
const PROVIDERS_DIR = join("communications", "v2", "providers");
const BRANCH_RE = /(?:case|===|==)\s*['"`](resend|twilio|google|microsoft|m365|gmail)['"`]/i;

function tsFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
        const abs = join(dir, e);
        if (statSync(abs).isDirectory()) out.push(...tsFiles(abs));
        else if ([".ts", ".tsx"].includes(extname(e))) out.push(abs);
    }
    return out;
}

describe("provider leakage guardrail", () => {
    it("no provider-name branching outside the providers registry dir", () => {
        const offenders = tsFiles(V2_ROOT)
            .filter((abs) => !abs.includes(PROVIDERS_DIR))
            .filter((abs) => BRANCH_RE.test(readFileSync(abs, "utf8")))
            .map((abs) => abs.slice(WEB_ROOT.length + 1));
        expect(offenders, `provider branching leaked into: ${offenders.join(", ")}`).toEqual([]);
    });

    it("the registry IS where provider resolution lives (sanity)", () => {
        const reg = readFileSync(join(V2_ROOT, "providers", "registry.ts"), "utf8");
        expect(reg).toMatch(/case "resend"/);
        expect(reg).toMatch(/case "twilio"/);
    });
});
