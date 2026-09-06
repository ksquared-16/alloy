/**
 * THE DEPLOY GUARD MUST NOT MISTAKE DATA FOR CODE.
 *
 * Staging build of de2f22d failed with:
 *
 *   "Tracked web code imports modules that are missing or not committed"
 *   file: tests/access/analyticsRouteGates.test.ts  importPath: "@/x"
 *
 * Nothing was missing. `@/x` was a string literal handed to a parser under
 * test. The guard scanned raw text with /\bfrom\s+["'](@\/[^"']+)["']/ and
 * could not tell the difference, so a healthy commit failed to deploy.
 *
 * These fix the class rather than that one line: any file that contains import
 * syntax as DATA — which is every test of anything that reads a module graph —
 * would have hit it, and would have been found the same way, by a broken
 * deploy.
 */
import { describe, expect, it } from "vitest";

import { aliasImportsIn } from "@/scripts/lib/aliasImports";

const scan = (src: string) => [...aliasImportsIn(src)].sort();

describe("alias import scanning", () => {
    it("ignores an import written inside a string literal", () => {
        // The exact shape that broke the deploy.
        const src = `
            expect(runtimeExports('export { logAdminAudit } from "@/x";')).toEqual(["logAdminAudit"]);
        `;
        expect(scan(src)).toEqual([]);
    });

    it("ignores import syntax in template literals and comments", () => {
        const src = [
            "const t = `import x from '@/from-template'`;",
            "// import y from '@/from-comment';",
            "/* export { z } from '@/from-block-comment'; */",
            'const s = "import w from \'@/from-double-quoted\'";',
        ].join("\n");
        expect(scan(src)).toEqual([]);
    });

    it("still finds every real alias import", () => {
        const src = [
            "import a from '@/lib/a';",
            "import { b } from '@/lib/b';",
            "import type { C } from '@/lib/c';",
            "export { d } from '@/lib/d';",
            "export * from '@/lib/e';",
            "const f = await import('@/lib/f');",
        ].join("\n");
        expect(scan(src)).toEqual([
            "@/lib/a", "@/lib/b", "@/lib/c", "@/lib/d", "@/lib/e", "@/lib/f",
        ]);
    });

    it("finds the two forms the old regexes missed", () => {
        // `export *` and dynamic import() were invisible to the previous
        // scanner, so a genuinely missing module reached deploy through either.
        expect(scan("export * from '@/lib/star';")).toEqual(["@/lib/star"]);
        expect(scan("void import('@/lib/dynamic');")).toEqual(["@/lib/dynamic"]);
    });

    it("returns only alias imports, never relative or package ones", () => {
        const src = [
            "import a from './relative';",
            "import b from '../up';",
            "import c from 'react';",
            "import d from '@scope/package';",
            "import e from '@/lib/kept';",
        ].join("\n");
        expect(scan(src)).toEqual(["@/lib/kept"]);
    });

    it("de-duplicates the same module imported twice", () => {
        expect(scan("import a from '@/lib/x';\nexport { b } from '@/lib/x';")).toEqual(["@/lib/x"]);
    });

    it("survives a file it cannot fully parse without losing the imports before it", () => {
        // preProcessFile is a scanner, not a parser: a syntax error later in the
        // file must not silently empty the result and turn a missing module into
        // a pass.
        const src = "import a from '@/lib/first';\nconst broken = ((( ;";
        expect(scan(src)).toContain("@/lib/first");
    });
});
