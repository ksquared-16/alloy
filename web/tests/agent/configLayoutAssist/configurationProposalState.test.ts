import { describe, expect, it } from "vitest";
import {
    validateConfigurationProposalTransition,
    transitionRequiresFailedReason,
    transitionRequiresRejectionReason,
} from "@/lib/agent/configLayoutAssist/configurationProposalState";

describe("configurationProposalState", () => {
    it("allows valid transitions", () => {
        expect(validateConfigurationProposalTransition("draft", "reviewed").ok).toBe(true);
        expect(validateConfigurationProposalTransition("reviewed", "approved").ok).toBe(true);
        expect(validateConfigurationProposalTransition("approved", "applied").ok).toBe(true);
        expect(validateConfigurationProposalTransition("failed", "reviewed").ok).toBe(true);
    });

    it("rejects draft → applied", () => {
        const r = validateConfigurationProposalTransition("draft", "applied");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("TRANSITION_NOT_ALLOWED");
    });

    it("rejects rejected → approved", () => {
        expect(validateConfigurationProposalTransition("rejected", "approved").ok).toBe(false);
    });

    it("rejects applied → approved", () => {
        expect(validateConfigurationProposalTransition("applied", "approved").ok).toBe(false);
    });

    it("rejects rolled_back → applied", () => {
        expect(validateConfigurationProposalTransition("rolled_back", "applied").ok).toBe(false);
    });

    it("rejection and failed reason requirements", () => {
        expect(transitionRequiresRejectionReason("rejected")).toBe(true);
        expect(transitionRequiresFailedReason("failed")).toBe(true);
        expect(transitionRequiresRejectionReason("reviewed")).toBe(false);
    });
});
