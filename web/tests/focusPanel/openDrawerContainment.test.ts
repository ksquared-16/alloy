import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";

/**
 * `open_drawer` — CONTAINED, not migrated.
 *
 * Outcome B of the migration analysis. Every stored occurrence is NOT mechanically resolvable: the
 * value carries an `entity` + `idPath`, but the canonical replacement is an ASPECT on a HOST
 * record's panel, and the host comes from that record's own `work_unit_id` at runtime — not from
 * anything a layout item knows. A forward migration would have to guess, so tenant layout data is
 * left alone and the parser keeps accepting it.
 *
 * What makes that safe is not a promise, it is these assertions: nothing executes it, and the
 * platform's own defaults no longer teach it.
 */

const WEB = process.cwd();

/**
 * Surfaces an operator actually reaches. The layout adornment runtime is reachable only from the
 * Surface Builder canvas, the preview renderer and the layout proofs — none of them operator
 * product, and none of them supplies a handler that opens a record.
 */
const OPERATOR_DIRS = [
    "components/admin/focusPanel",
    "components/presentation",
    "components/workspace",
    "components/workItems",
] as const;

const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sourceFiles(dirs: readonly string[]): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        let entries: string[];
        try {
            entries = readdirSync(d);
        } catch {
            return;
        }
        for (const e of entries) {
            const p = join(d, e);
            if (statSync(p).isDirectory()) {
                if (e !== "node_modules" && e !== ".next") walk(p);
            } else if ([".ts", ".tsx"].includes(extname(p))) {
                out.push(p);
            }
        }
    };
    for (const d of dirs) walk(join(WEB, d));
    return out;
}


/**
 * Every module an operator surface can reach, following `@/` imports transitively.
 *
 * A reachability answer, not a filename one: the dispatcher's existence is not the risk — a path
 * from a rendered surface to it is.
 */
function importClosureFrom(dirs: readonly string[]): Set<string> {
    const seen = new Set<string>();
    const queue = sourceFiles(dirs).map((f) => f.slice(WEB.length + 1));
    const resolve = (spec: string): string | null => {
        const base = spec.replace(/^@\//, "");
        for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
            try {
                statSync(join(WEB, base + ext));
                return base + ext;
            } catch {
                /* next */
            }
        }
        return null;
    };
    while (queue.length) {
        const rel = queue.pop()!;
        if (seen.has(rel)) continue;
        seen.add(rel);
        let src: string;
        try {
            src = readFileSync(join(WEB, rel), "utf8");
        } catch {
            continue;
        }
        for (const m of src.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
            const next = resolve(m[1]!);
            if (next && !seen.has(next)) queue.push(next);
        }
    }
    return seen;
}

describe("stored layouts keep parsing", () => {
    it("a tenant layout authored with open_drawer still validates", () => {
        // Read compatibility is the whole point of outcome B — a tenant's published layout must not
        // start failing validation because the product retired the value.
        const doc = parseLayoutDoc({
            version: 2,
            surface: "drawer",
            entityType: "opportunity",
            sections: [
                {
                    id: "s1",
                    key: "people",
                    title: "People",
                    rows: [
                        {
                            id: "r1",
                            items: [
                                {
                                    id: "i1",
                                    kind: "field",
                                    refKey: "person.primary_contact_name",
                                    adornment: {
                                        position: "left",
                                        icon: "person",
                                        action: { type: "open_drawer", entity: "person", idPath: "person.id" },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        expect(doc.ok, doc.errors?.join(" ")).toBe(true);
    });
});

describe("nothing executes it", () => {
    it("no operator surface names the retired value", () => {
        const offenders: string[] = [];
        for (const file of sourceFiles(OPERATOR_DIRS)) {
            if (stripComments(readFileSync(file, "utf8")).includes("open_drawer")) {
                offenders.push(file.slice(WEB.length + 1));
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the dispatcher that CAN execute it is unreachable from any operator surface", () => {
        // `dispatchLayoutRuntimeOpenDrawer` still exists and still takes an `openDrawer` callback.
        // Asserting it is deleted would be a lie; asserting REACHABILITY is the real invariant, and
        // unlike a file-existence check it cannot be satisfied vacuously. Its only consumers are the
        // Surface Builder canvas, the preview renderer and a dev gallery.
        const closure = importClosureFrom(OPERATOR_DIRS);
        const forbidden = [...closure].filter((rel) =>
            /(dispatchLayoutRuntimeOpenDrawer|resolveLayoutAdornmentOpenDrawer|dispatchLinkedDrawerOpen|openQueueRecordLinkedDrawer)/.test(
                rel,
            ),
        );
        expect(forbidden, "an operator surface can now reach the open_drawer dispatcher").toEqual([]);
    });
});

describe("the platform's own defaults no longer teach it", () => {
    it("shipped default layouts author no open_drawer action", () => {
        for (const rel of [
            "lib/layout/defaultChildLayouts.ts",
            "lib/layout/defaultLeadLayouts.ts",
            "lib/layout/defaultPersonLayouts.ts",
        ]) {
            expect(stripComments(readFileSync(join(WEB, rel), "utf8")), rel).not.toContain("open_drawer");
        }
    });

    it("it is not offered for authoring", () => {
        const editor = stripComments(readFileSync(join(WEB, "lib/layout/layoutEditorDisplayConfig.ts"), "utf8"));
        const offered = editor.slice(editor.indexOf("LAYOUT_LINK_BEHAVIORS_EDITOR"));
        expect(offered.slice(0, offered.indexOf("]"))).not.toContain("open_drawer");
    });
});
