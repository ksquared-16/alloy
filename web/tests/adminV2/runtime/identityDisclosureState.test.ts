/**
 * Canonical identity disclosure navigation state.
 */
import { describe, expect, it } from "vitest";

import {
    backIdentityDisclosure,
    identityDisclosureCoordinationLevel,
    identityDisclosureRuntimeOwnsNavigation,
    INITIAL_IDENTITY_DISCLOSURE_STATE,
    transitionIdentityDisclosure,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";

describe("identityDisclosureState", () => {
    it("starts at summary", () => {
        expect(INITIAL_IDENTITY_DISCLOSURE_STATE).toEqual({ depth: "summary" });
    });

    it("summary → context", () => {
        expect(transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, { type: "enter_context" })).toEqual({
            depth: "context",
            selectedIdentityId: undefined,
            selectedSectionKey: undefined,
        });
    });

    it("context + select identity → details", () => {
        const context = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, { type: "enter_context" });
        expect(
            transitionIdentityDisclosure(context, {
                type: "select_identity",
                identityId: "p-sarah",
                sectionKey: "primary_contact",
            }),
        ).toEqual({
            depth: "details",
            selectedIdentityId: "p-sarah",
            selectedSectionKey: "primary_contact",
        });
    });

    it("details → evidence requires selected identity", () => {
        const details = {
            depth: "details" as const,
            selectedIdentityId: "p-sarah",
            selectedSectionKey: "primary_contact",
        };
        expect(
            transitionIdentityDisclosure(details, {
                type: "enter_evidence",
                identityId: "p-sarah",
                sectionKey: "primary_contact",
            }),
        ).toEqual({
            depth: "evidence",
            selectedIdentityId: "p-sarah",
            selectedSectionKey: "primary_contact",
        });
    });

    it("blocks details without selected identity", () => {
        const context = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, { type: "enter_context" });
        expect(
            transitionIdentityDisclosure(context, { type: "enter_details", identityId: "" }),
        ).toEqual(context);
    });

    it("blocks evidence without selected identity", () => {
        expect(
            transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, {
                type: "enter_evidence",
                identityId: "",
            }),
        ).toEqual(INITIAL_IDENTITY_DISCLOSURE_STATE);
    });

    it("back navigation preserves expected hierarchy", () => {
        const evidence = {
            depth: "evidence" as const,
            selectedIdentityId: "c1",
            selectedSectionKey: "roster",
        };
        const details = backIdentityDisclosure(evidence);
        expect(details).toEqual({
            depth: "details",
            selectedIdentityId: "c1",
            selectedSectionKey: "roster",
        });

        const context = backIdentityDisclosure(details);
        expect(context).toEqual({
            depth: "context",
            selectedIdentityId: undefined,
            selectedSectionKey: undefined,
        });

        const summary = backIdentityDisclosure(context);
        expect(summary).toEqual({ depth: "summary" });
    });
});

describe("identityDisclosureCoordinationLevel", () => {
    it("keeps context at base grid level (in-card expansion only)", () => {
        expect(identityDisclosureCoordinationLevel({ depth: "summary" })).toBe("base");
        expect(identityDisclosureCoordinationLevel({ depth: "context" })).toBe("base");
    });

    it("elevates details and evidence to focused grid level", () => {
        expect(identityDisclosureCoordinationLevel({ depth: "details" })).toBe("focused");
        expect(identityDisclosureCoordinationLevel({ depth: "evidence" })).toBe("focused");
    });

    it("prefers edit when editing", () => {
        expect(identityDisclosureCoordinationLevel({ depth: "context", editing: true })).toBe("edit");
    });
});

describe("identityDisclosureRuntimeOwnsNavigation", () => {
    it("runtime owns navigation outside compose and in preview mode", () => {
        expect(identityDisclosureRuntimeOwnsNavigation({ composing: false })).toBe(true);
        expect(
            identityDisclosureRuntimeOwnsNavigation({ composing: true, composeCanvasMode: "preview" }),
        ).toBe(true);
        expect(
            identityDisclosureRuntimeOwnsNavigation({ composing: true, composeCanvasMode: "configure" }),
        ).toBe(false);
    });
});
