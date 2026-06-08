import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cardPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/JobLayoutOperationalProposalCard.tsx"
);
const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);

describe("Job layout OperationalProposalCardFrame migration", () => {
    it("JobLayoutOperationalProposalCard uses shared frame", () => {
        const src = readFileSync(cardPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("job_overview_layout");
        expect(src).toContain("JOB_LAYOUT_PROPOSAL_TYPE_LABEL");
        expect(src).toContain("Approve and apply");
        expect(src).toContain("data-command-surface-job-layout-approve-apply");
        expect(src).not.toMatch(/\bAI thinks\b/i);
        expect(src).not.toContain("Copilot");
    });

    it("shell renderJobLayoutCardActions delegates to JobLayoutOperationalProposalCard", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain("JobLayoutOperationalProposalCard");
        expect(src).toContain("renderJobLayoutCardActions");
        expect(src).toMatch(/renderJobLayoutCardActions[\s\S]{0,1200}JobLayoutOperationalProposalCard/);
    });

    it("thread uses frame for collapsed job layout cards", () => {
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain("JobLayoutOperationalProposalCard");
        expect(src).toContain("expanded={false}");
        expect(src).not.toContain("badgeLabel(card.confidence)");
        expect(readFileSync(cardPath, "utf8")).toContain("Show layout preview");
    });
});
