/**
 * The Tours Human QA V2 guide is read by `/dev/tours-qa` as a checklist. These checks keep it one:
 * every test parses with a unique label and a PASS-if, all parts A–I are present, links are safe, and
 * no token-bearing public link or credential is written into it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseInline, parseQaWalkthrough, safeQaHref, type QaBlock } from "@/lib/qa/parseQaWalkthrough";

const markdown = readFileSync(join(__dirname, "..", "..", "..", "docs", "platform", "qa", "tours-forms-comms-human-qa-v2.md"), "utf8");
const blocks = parseQaWalkthrough(markdown);

describe("Tours Human QA V2 guide", () => {
    const steps = blocks.filter((b): b is Extract<QaBlock, { kind: "step" }> => b.kind === "step");

    it("covers parts A–I with labelled tests", () => {
        const parts = new Set(steps.map((s) => s.label[0]));
        expect([...parts].sort().join("")).toBe("ABCDEFGHI");
        expect(steps.length).toBeGreaterThanOrEqual(60);
        expect(new Set(steps.map((s) => s.label)).size).toBe(steps.length);
    });

    it("every test is followed by a PASS-if expectation", () => {
        blocks.forEach((b, i) => {
            if (b.kind !== "step") return;
            expect(blocks[i + 1]?.kind, `${b.label} has no EXPECT`).toBe("expect");
        });
    });

    it("has section navigation headings", () => {
        const h2 = blocks.filter((b) => b.kind === "heading" && b.level === 2).map((b) => (b as { text: string }).text);
        for (const p of ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "I."]) expect(h2.some((t) => t.startsWith(p))).toBe(true);
        expect(h2).toContain("Known limitations");
    });

    it("writes no token-bearing public link, no credential and no loopback URL", () => {
        expect(markdown).not.toMatch(/\/(tours|forms\/embed)\/[A-Za-z0-9_-]{16,}/);
        expect(markdown).not.toMatch(/password\s*[:=]/i);
        expect(markdown).not.toMatch(/127\.0\.0\.1|localhost/);
        expect(markdown).not.toMatch(/sb_secret_|eyJ[A-Za-z0-9_-]{20,}/);
    });
});

describe("parseQaWalkthrough links", () => {
    it("renders app paths and http(s) links; anything else stays text", () => {
        expect(parseInline("see [Locations](/organization/locations) now")).toEqual([
            { kind: "text", text: "see " },
            { kind: "link", text: "Locations", href: "/organization/locations" },
            { kind: "text", text: " now" },
        ]);
        expect(parseInline("[x](javascript:alert(1))")[0]).toMatchObject({ kind: "text" });
        expect(safeQaHref("//evil.example")).toBeNull();
        expect(safeQaHref("https://staging.workwithalloy.com")).toBe("https://staging.workwithalloy.com");
    });

    it("accepts step labels beyond A–G (the Tours guide's H and I) and keeps H1a", () => {
        const b = parseQaWalkthrough("**I3. DO** — x\n**EXPECT** — y\n\n**H1a. DO** — z");
        expect(b.filter((x) => x.kind === "step").map((x) => (x as { label: string }).label)).toEqual(["I3", "H1a"]);
    });
});
