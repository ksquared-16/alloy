import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, isPlanningException } from "../../../scripts/docs-lint.mjs";

/**
 * DOCUMENTATION AUTHORITY PLACEMENT — THE TWO CLASSES THIS PASS DRAINED.
 *
 * On 2026-09-30 the estate carried 48 undiscoverable `docs/platform/**` documents and 35 documents
 * declaring `status: canonical` inside the planning tree. Both were driven to zero. This lock is the
 * part that keeps them there, because the two defects recur for opposite reasons:
 *
 *   * **canonical-in-planning** happens when a planning document turns out to be right. Someone
 *     writes a measured, durable truth into a sprint packet, marks it canonical because it IS
 *     authoritative, and the planning tree quietly becomes a doctrine source that
 *     `platform/planning/README.md` disclaims. Three of the 35 were exactly that and were moved out.
 *   * **orphan-canonical** happens through ordinary growth: a new canonical owner is written and
 *     nobody adds it to a domain index, so it is authoritative and unreachable at once.
 *
 * WHY IT ASSERTS PARSED STATE AND NOT PROSE. Guards in this repository have been fooled three times
 * by their own explanatory comments, and once by a lazy regex that matched the wreckage of the
 * statement it was checking. So this reads frontmatter through the lint's own parser and the index
 * through its link structure — never a substring of narrative text.
 *
 * It deliberately does NOT re-implement the lint. `scripts/docs-lint.mjs` computes both classes and
 * runs in CI; this holds the two invariants at zero so a regression is a test failure with a name,
 * rather than a number drifting upward in a report nobody reads.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

function markdownUnder(rel: string): string[] {
    const out: string[] = [];
    const abs = path.join(repoRoot, rel);
    for (const entry of readdirSync(abs)) {
        const child = `${rel}/${entry}`;
        if (statSync(path.join(repoRoot, child)).isDirectory()) out.push(...markdownUnder(child));
        else if (entry.endsWith(".md")) out.push(child);
    }
    return out;
}

const PLATFORM_DOCS = markdownUnder("docs/platform");

function statusOf(rel: string): string | null {
    const fm = parseFrontmatter(read(rel)).data as Record<string, unknown> | null;
    const s = fm?.status;
    return typeof s === "string" ? s : null;
}

/** Link targets of a markdown file, resolved to repo-relative doc paths. */
function citedDocs(rel: string): Set<string> {
    const dir = path.posix.dirname(rel);
    const out = new Set<string>();
    const text = read(rel);
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1]!.split("#")[0]!;
        if (!target || /^[a-z]+:/.test(target) || target.startsWith("/")) continue;
        out.add(path.posix.normalize(path.posix.join(dir, target)));
    }
    // Backticked domain paths count as citations in this index, matching the lint.
    for (const m of text.matchAll(/`((?:platform|schema|governance|system|product|api|context)\/[^`\s]+)`/g)) {
        out.add(`docs/${m[1]}`);
    }
    return out;
}

describe("the planning tree is not a doctrine source", () => {
    it("is not vacuous: planning documents are discovered and parsed", () => {
        const planning = PLATFORM_DOCS.filter((p) => isPlanningException(p));
        expect(planning.length, "no planning documents found at all").toBeGreaterThan(50);
        expect(
            planning.filter((p) => statusOf(p) !== null).length,
            "no planning document has parseable frontmatter, so the status assertion would be empty",
        ).toBeGreaterThan(50);
    });

    it("no planning document declares status: canonical", () => {
        const offenders = PLATFORM_DOCS.filter((p) => isPlanningException(p) && statusOf(p) === "canonical");
        expect(
            offenders,
            "these planning documents claim to be doctrine. `platform/planning/README.md` disclaims the tree as "
                + "authority, so a canonical document inside it is authoritative and disowned at the same time. Either "
                + "move it into the canonical domain tree (and index it), or give it the status it really has — "
                + "proposed, sprint, frozen or historical.",
        ).toEqual([]);
    });
});

describe("every canonical platform document is reachable", () => {
    const rootIndex = "docs/README.md";
    // root → domain index → owner. Exactly the two hops the lint implements, no transitive closure.
    const hop1 = citedDocs(rootIndex);
    const reachable = new Set<string>([rootIndex, ...hop1]);
    for (const idx of [...hop1]) {
        if (!idx.endsWith(".md")) continue;
        try {
            for (const c of citedDocs(idx)) reachable.add(c);
        } catch {
            /* a cited path that is not a readable file is the lint's broken-link concern, not this one */
        }
    }

    it("is not vacuous: the two-hop walk reaches a substantial part of the tree", () => {
        expect(hop1.size, "the root index cites almost nothing").toBeGreaterThan(5);
        expect(reachable.size, "the two-hop walk found almost nothing").toBeGreaterThan(80);
    });

    it("no canonical platform document is undiscoverable from the root index", () => {
        const offenders = PLATFORM_DOCS.filter(
            (p) => !isPlanningException(p) && statusOf(p) === "canonical" && !reachable.has(p),
        );
        expect(
            offenders,
            "these documents are canonical and cannot be reached by root index → domain index → owner. A canonical "
                + "document nobody can find is not authority, it is a rumour. Add it to its domain index "
                + "(`docs/platform/README.md` § Canonical owners by area) — not to the root index, which is a map and "
                + "not a directory listing.",
        ).toEqual([]);
    });

    it("the domain index separates canonical owners from proposals and records", () => {
        // The 21 non-canonical documents indexed by this pass are reachable on purpose. They must not
        // be listed as canonical owners, because discoverability is not endorsement.
        const index = read("docs/platform/README.md");
        const ownersStart = index.indexOf("## Canonical owners by area");
        const recordsStart = index.indexOf("## Proposals, frozen contracts and records");
        expect(ownersStart, "the canonical-owners section is gone").toBeGreaterThan(-1);
        expect(recordsStart, "the records section is gone — non-doctrine would be listed as doctrine").toBeGreaterThan(
            ownersStart,
        );

        const ownersBlock = index.slice(ownersStart, recordsStart);
        const misfiled: string[] = [];
        for (const m of ownersBlock.matchAll(/\]\(\.\/([^)\s]+\.md)\)/g)) {
            const rel = `docs/platform/${m[1]!}`;
            if (!PLATFORM_DOCS.includes(rel)) continue;
            const s = statusOf(rel);
            if (s !== null && s !== "canonical" && s !== "frozen") misfiled.push(`${rel} [${s}]`);
        }
        expect(
            misfiled.sort(),
            "these are listed under Canonical owners by area but do not declare canonical (or frozen) status. Move "
                + "them to the records section so a reader is not told a proposal is doctrine.",
        ).toEqual([]);
    });
});
