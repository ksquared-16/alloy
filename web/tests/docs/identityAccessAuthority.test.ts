/**
 * Identity/Access authority guards (Slot C/D, erun_79bed0c987eef455).
 *
 * Two invariants that documentation alone was not locking: a ratified decision must not keep
 * presenting itself as undecided, and identity must never be inferred from email.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../../scripts/docs-lint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

function markdownUnder(rel: string): string[] {
    const out: string[] = [];
    const abs = path.join(repoRoot, rel);
    if (!existsSync(abs)) return out;
    for (const entry of readdirSync(abs)) {
        const child = `${rel}/${entry}`;
        if (statSync(path.join(repoRoot, child)).isDirectory()) out.push(...markdownUnder(child));
        else if (entry.endsWith(".md")) out.push(child);
    }
    return out;
}

describe("no canonical document may hold an unmade decision", () => {
    it("nothing that is status: canonical still says DIRECTOR_DECISION_READY", () => {
        /*
         * A canonical document is read as current truth. One that simultaneously says a decision is
         * pending cannot be either: an agent reading it as settled asserts an unratified model, and a
         * reader treating it as pending has no current authority to follow.
         */
        const offenders: string[] = [];
        for (const rel of markdownUnder("docs/platform")) {
            if (rel.startsWith("docs/platform/planning/")) continue; // planning may hold open decisions
            const text = read(rel);
            const fm = parseFrontmatter(text).data as Record<string, unknown> | null;
            if (fm?.status !== "canonical") continue;
            if (!/DIRECTOR_DECISION_READY/.test(text)) continue;

            /*
             * Resolution is a DOCUMENT-level fact, read off the Status line, not a per-line keyword.
             * An earlier version of this guard excluded any line containing "was", which a sentence
             * like "the decision this document was written to enable" satisfied by accident — so a
             * genuinely pending document passed. Naming the state once is what makes it checkable.
             */
            const statusLine = text.split("\n").find((l) => /^\s*\*\*Status:\*\*/.test(l)) ?? "";
            const ratified = /\bRATIFIED\b|\bDECIDED\b|\bSUPERSEDED\b/i.test(statusLine);
            if (ratified) continue;
            offenders.push(`${rel}: ${(statusLine || "<no Status line>").trim().slice(0, 100)}`);
        }
        expect(offenders).toEqual([]);
    });

    it("the RLS authority model is ratified in the durable decision register", () => {
        const reg = read("docs/platform/foundation/platform-decisions.md");
        expect(reg).toMatch(/RLS isolates tenants/i);
        expect(reg).toMatch(/mutation is server-side/i);
        // The measurement document points at the register rather than restating the decision.
        expect(read("docs/platform/governance/rls-authority-model-director-gate.md")).toMatch(
            /platform-decisions\.md/,
        );
    });
});

describe("identity is never inferred from email", () => {
    const module = "web/lib/access/linkedPersonIdentity.ts";

    it("the auth-identity bridge still routes through the explicit link table", () => {
        expect(read(module)).toMatch(/user_person_links/);
    });

    it("carries no email fallback — only the comment forbidding one", () => {
        /*
         * Email is mutable, unique by no constraint in this schema, and shared in practice. A wrong
         * guess either locks out a real teacher or hands one teacher another person's assignments,
         * and neither announces itself. So any `email` occurrence here must be prose, not code.
         */
        const codeLines = read(module)
            .split("\n")
            .filter((l) => /email/i.test(l))
            .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim()));
        expect(codeLines).toEqual([]);
    });
});
