import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("status transition guardrails settings copy", () => {
    it("page describes pre-transition guardrails, not workflow automation", () => {
        const page = read("app/adminV2/settings/status-transition-rules/page.tsx");
        expect(page).toContain("Status transition guardrails");
        expect(page).toContain("validate or block status transitions before they happen");
        expect(page).toContain("not</strong> outcome automation");
        expect(page).toContain("not</strong> workflow automation");
        expect(page).not.toContain("Workflow automation rules");
    });

    it("settings nav label matches guardrails framing", () => {
        const domains = read("lib/adminV2/configurationWorkspaceDomains.ts");
        expect(domains).toContain('label: "Status transition guardrails"');
        expect(domains).not.toContain('label: "Workflow automation rules"');
    });
});
