import { describe, expect, it, vi } from "vitest";

import { buildConfigProposalReviewHref } from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";
import {
    configProposalReviewHrefForId,
    createConfigProposalReviewClickHandler,
    handleConfigProposalReviewClick,
    readConfigProposalIdFromSearchParams,
    resolveConfigProposalReviewId,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";

const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("configLayoutAssistReviewNavigation", () => {
    it("resolveConfigProposalReviewId trims and rejects empty", () => {
        expect(resolveConfigProposalReviewId(`  ${PROPOSAL_ID}  `)).toBe(PROPOSAL_ID);
        expect(resolveConfigProposalReviewId(null)).toBeNull();
        expect(resolveConfigProposalReviewId("   ")).toBeNull();
    });

    it("readConfigProposalIdFromSearchParams prefers proposalId then id", () => {
        expect(
            readConfigProposalIdFromSearchParams({
                get: (key) => (key === "proposalId" ? PROPOSAL_ID : null),
            })
        ).toBe(PROPOSAL_ID);
        expect(
            readConfigProposalIdFromSearchParams({
                get: (key) => (key === "id" ? PROPOSAL_ID : null),
            })
        ).toBe(PROPOSAL_ID);
        expect(
            readConfigProposalIdFromSearchParams({
                get: () => null,
            })
        ).toBeNull();
    });

    it("configProposalReviewHrefForId builds settings deep link", () => {
        expect(configProposalReviewHrefForId(PROPOSAL_ID)).toBe(buildConfigProposalReviewHref(PROPOSAL_ID));
        expect(configProposalReviewHrefForId(PROPOSAL_ID)).toContain(`proposalId=${PROPOSAL_ID}`);
    });

    it("createConfigProposalReviewClickHandler stops propagation and calls onReviewConfigProposal", () => {
        const onReviewConfigProposal = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const handler = createConfigProposalReviewClickHandler(PROPOSAL_ID, onReviewConfigProposal);

        handler({ preventDefault, stopPropagation });

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(onReviewConfigProposal).toHaveBeenCalledWith(PROPOSAL_ID);
    });

    it("createConfigProposalReviewClickHandler is a no-op without proposal id", () => {
        const onReviewConfigProposal = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const handler = createConfigProposalReviewClickHandler(null, onReviewConfigProposal);

        handler({ preventDefault, stopPropagation });

        expect(preventDefault).not.toHaveBeenCalled();
        expect(stopPropagation).not.toHaveBeenCalled();
        expect(onReviewConfigProposal).not.toHaveBeenCalled();
    });

    it("handleConfigProposalReviewClick stops propagation and navigates with proposalId query", () => {
        const navigate = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();

        handleConfigProposalReviewClick(
            { preventDefault, stopPropagation },
            PROPOSAL_ID,
            navigate
        );

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith(buildConfigProposalReviewHref(PROPOSAL_ID));
    });
});
