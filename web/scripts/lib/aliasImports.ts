/**
 * Which `@/…` modules does this source actually import?
 *
 * A REGEX CANNOT TELL CODE FROM A STRING THAT LOOKS LIKE CODE. The deployment
 * guard used to scan raw text for `from "@/..."`, which matches a real import
 * and an import written inside a quoted string equally well. That broke the
 * staging deploy of de2f22d: `tests/access/analyticsRouteGates.test.ts` asserts
 * on a parser with
 *
 *     runtimeExports('export { logAdminAudit } from "@/x";')
 *
 * and the guard reported `@/x` as a missing module. Nothing was missing.
 *
 * The trap is worst in exactly the files most likely to contain import syntax
 * as DATA — the tests for anything that reads a module graph — so the next
 * occurrence would have been found the same way it was this time, by a failed
 * deploy of a healthy commit.
 *
 * `ts.preProcessFile` is the TypeScript compiler's own lightweight import
 * scanner: no program, no type-checking, one pass. It ignores string literals,
 * template literals and comments, and it also finds what the two regexes missed
 * entirely — `export * from` and dynamic `import()`. Stricter about what counts
 * as an import, and more complete about which ones it catches.
 *
 * This lives in its own module so it can be tested directly. The guard script
 * runs its scan at import time, so testing the function through the script
 * would mean running the whole 10,000-file sweep to assert on one string.
 */
import ts from "typescript";

export function aliasImportsIn(source: string): Set<string> {
    const out = new Set<string>();
    const pre = ts.preProcessFile(source, /* readImportFiles */ true, /* detectJavaScriptImports */ true);
    for (const f of pre.importedFiles) {
        if (f.fileName.startsWith("@/")) out.add(f.fileName);
    }
    return out;
}
