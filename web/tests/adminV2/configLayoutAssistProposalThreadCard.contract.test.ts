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
    it("thread card uses button + createConfigProposalReviewClickHandler", () => {
        const src = readFileSync(cardPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("createConfigProposalReviewClickHandler");
        expect(src).toContain('type="button"');
        expect(src).toContain("data-command-surface-config-assist-review-proposal");
        expect(src).toContain("onReviewConfigProposal");
        expect(src).toContain("reviewProposalId && reviewHref");
        expect(src).not.toContain("<Link");
        expect(src).not.toContain("useRouter");
        expect(src).not.toMatch(/\/apply|applyApproved|onApply/);
    });

    it("command surface shell uses adminV2CommitNavigation (not router.push)", () => {
        const shellSrc = readFileSync(shellPath, "utf8");
        expect(shellSrc).toContain("adminV2CommitNavigation");
        expect(shellSrc).toContain("configProposalReviewHrefForId");
        expect(shellSrc).toContain("onReviewConfigProposal");
        expect(shellSrc).not.toMatch(/onReviewConfigProposal[\s\S]{0,200}router\.push/);
    });

    it("thread passes onReviewConfigProposal to config layout assist card", () => {
        const threadSrc = readFileSync(threadPath, "utf8");
        expect(threadSrc).toContain("onReviewConfigProposal");
        expect(threadSrc).toContain("onReviewConfigProposal={onReviewConfigProposal}");
        expect(threadSrc).toContain("ConfigLayoutAssistProposalThreadCard");
    });

    it("config proposals client honors proposalId search param helper", () => {
        const clientSrc = readFileSync(clientPath, "utf8");
        expect(clientSrc).toContain("readConfigProposalIdFromSearchParams");
        expect(clientSrc).toContain("useSearchParams");
    });
});
