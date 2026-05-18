import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/settings/config-proposals/ConfigLayoutProposalReviewPanel.tsx"
);

describe("ConfigLayoutProposalReviewPanel contract", () => {
    it("advanced technical details use collapsed details element by default", () => {
        const src = readFileSync(panelPath, "utf8");
        expect(src).toContain("<details");
        expect(src).toContain("Advanced details");
        expect(src).not.toMatch(/<details[^>]*\sopen/);
        expect(src).toContain("raw_json");
    });
});
