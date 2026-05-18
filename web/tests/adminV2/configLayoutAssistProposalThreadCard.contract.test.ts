import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cardPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/ConfigLayoutAssistProposalThreadCard.tsx"
);
const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);
const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const clientPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/settings/config-proposals/ConfigLayoutProposalsClient.tsx"
);

describe("ConfigLayoutAssist proposal review CTA contract", () => {
    it("thread card uses button navigation with stopPropagation and conditional CTA", () => {
        const src = readFileSync(cardPath, "utf8");
        expect(src).toContain("handleConfigProposalReviewClick");
        expect(src).toContain('type="button"');
        expect(src).toContain("data-command-surface-config-assist-review-proposal");
        expect(src).toContain("reviewProposalId ?");
        expect(src).not.toContain("<Link");
        expect(src).not.toMatch(/\/apply|applyApproved|onApply/);
    });

    it("command surface shell wires review navigation via router.push", () => {
        const shellSrc = readFileSync(shellPath, "utf8");
        expect(shellSrc).toContain("buildConfigProposalReviewHref");
        expect(shellSrc).toContain("onReviewConfigProposal");
        expect(shellSrc).toContain("router.push");
    });

    it("thread passes onReviewConfigProposal to config layout assist card", () => {
        const threadSrc = readFileSync(threadPath, "utf8");
        expect(threadSrc).toContain("onReviewConfigProposal");
        expect(threadSrc).toContain("onReviewProposal={onReviewConfigProposal}");
        expect(threadSrc).toContain("ConfigLayoutAssistProposalThreadCard");
    });

    it("config proposals client honors proposalId search param helper", () => {
        const clientSrc = readFileSync(clientPath, "utf8");
        expect(clientSrc).toContain("readConfigProposalIdFromSearchParams");
        expect(clientSrc).toContain("useSearchParams");
    });
});
