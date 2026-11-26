/**
 * SHELL BUDGET — the legacy dashboard body must not re-enter every authenticated page.
 *
 * `AdminV2Shell` returns early for workspace, AI-activity, settings and workflows routes, so
 * `SystemCanvas`, `KPIBand` and `RecordsExpandable` are never mounted there. They were still
 * statically imported, and `SystemCanvas` brings `reactflow`: measured at 345 KB transferred and
 * 1,354 KB parsed, arriving at 170 ms on a queue path — 17% of the whole JavaScript path for a node
 * canvas the operator never sees on those routes.
 *
 * The guard reads the shell source rather than the bundle so it fails in review, not in production.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SHELL = "app/adminV2/components/AdminV2Shell.tsx";
const src = readFileSync(join(process.cwd(), SHELL), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Rendered only below the workspace early return — must never be a static import. */
const DEFERRED_ONLY = ["SystemCanvas", "KPIBand", "RecordsExpandable"];

describe("authenticated shell import budget", () => {
    for (const name of DEFERRED_ONLY) {
        it(`${name} is loaded through a dynamic boundary, not a static import`, () => {
            expect(code, `${name} must not be statically imported into the shell`)
                .not.toMatch(new RegExp(`^\\s*import\\s+${name}\\s+from`, "m"));
            expect(code, `${name} must be declared via next/dynamic`)
                .toMatch(new RegExp(`const\\s+${name}\\s*=\\s*dynamic\\(`));
        });
    }

    it("no heavy canvas/graph dependency is statically reachable from the shell", () => {
        // reactflow is the measured offender; naming the dependency keeps the guard honest even if
        // the component is renamed.
        expect(code).not.toMatch(/^\s*import\s+[^;]*from\s+"reactflow"/m);
    });

    it("the deferred boundaries do NOT use ssr:false", () => {
        /*
         * On the legacy dashboard these ARE the visible content. `ssr: false` would remove them from
         * the HTML and merely move the cost later — the instruction's explicit prohibition, and a
         * truthfulness regression. Splitting the client chunk is the whole intent.
         */
        for (const name of DEFERRED_ONLY) {
            const m = code.match(new RegExp(`const\\s+${name}\\s*=\\s*dynamic\\(([\\s\\S]{0,160}?)\\);`));
            expect(m, `${name} dynamic() not found`).toBeTruthy();
            expect(m![1], `${name} must keep SSR`).not.toMatch(/ssr\s*:\s*false/);
        }
    });

    it("POSITIVE CONTROL — a static import of the canvas fails this guard", () => {
        const reintroduced = `import SystemCanvas from "./canvas/SystemCanvas";\n${code}`;
        const wouldPass = !/^\s*import\s+SystemCanvas\s+from/m.test(reintroduced);
        expect(wouldPass, "the guard must reject a reintroduced static import").toBe(false);
    });
});
