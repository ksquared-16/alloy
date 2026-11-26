/**
 * The Subject contract: authored on a new email, inherited on a reply.
 *
 * The case that made this file exist: the family-send route required a subject
 * for EVERY email, while the reply composer deliberately shows no Subject field.
 * Every operator reply therefore arrived with an empty subject and was refused
 * with `subject is required for email` — the composer and the route disagreeing
 * about what a reply is.
 */

import { describe, expect, it } from "vitest";

import {
    decideEmailSubject,
    deriveReplySubject,
    stripReplyPrefixes,
} from "@/lib/communications/email/replySubject";

describe("stripReplyPrefixes", () => {
    it("removes one prefix", () => {
        expect(stripReplyPrefixes("Re: Tour on Tuesday")).toBe("Tour on Tuesday");
    });

    it("removes stacked prefixes a chain of clients accumulated", () => {
        expect(stripReplyPrefixes("Re: RE: re: Tour on Tuesday")).toBe("Tour on Tuesday");
    });

    it("removes counter forms", () => {
        expect(stripReplyPrefixes("Re[2]: Tour on Tuesday")).toBe("Tour on Tuesday");
    });

    it("leaves a subject that merely starts with the letters", () => {
        expect(stripReplyPrefixes("Registration deadline")).toBe("Registration deadline");
    });

    it("does NOT strip localized prefixes — a wrong guess mangles a real subject", () => {
        expect(stripReplyPrefixes("AW: Tour on Tuesday")).toBe("AW: Tour on Tuesday");
    });

    it("is empty for nothing", () => {
        expect(stripReplyPrefixes(null)).toBe("");
        expect(stripReplyPrefixes("   ")).toBe("");
    });
});

describe("deriveReplySubject", () => {
    it("prefixes exactly once, however many the parent's client stacked", () => {
        expect(deriveReplySubject("Re: Re: Tour on Tuesday")).toBe("Re: Tour on Tuesday");
    });

    it("returns null rather than inventing a subject", () => {
        expect(deriveReplySubject(null)).toBeNull();
        expect(deriveReplySubject("  ")).toBeNull();
    });
});

describe("decideEmailSubject — new email", () => {
    it("requires a subject", () => {
        expect(decideEmailSubject({ supplied: "", isReply: false })).toEqual({ kind: "subject_required" });
        expect(decideEmailSubject({ supplied: "   ", isReply: false })).toEqual({ kind: "subject_required" });
        expect(decideEmailSubject({ supplied: null, isReply: false })).toEqual({ kind: "subject_required" });
    });

    it("uses what the operator authored, trimmed", () => {
        expect(decideEmailSubject({ supplied: "  Enrollment packet  ", isReply: false })).toEqual({
            kind: "subject",
            subject: "Enrollment packet",
            inherited: false,
        });
    });

    it("does not strip a prefix the operator typed deliberately", () => {
        expect(decideEmailSubject({ supplied: "Re: your question", isReply: false })).toEqual({
            kind: "subject",
            subject: "Re: your question",
            inherited: false,
        });
    });
});

describe("decideEmailSubject — reply", () => {
    it("inherits from the conversation with no subject supplied", () => {
        expect(
            decideEmailSubject({ supplied: "", isReply: true, conversationSubject: "Tour on Tuesday" })
        ).toEqual({ kind: "subject", subject: "Re: Tour on Tuesday", inherited: true });
    });

    it("does NOT require a subject — this is the defect that blocked every reply", () => {
        const decision = decideEmailSubject({
            supplied: "",
            isReply: true,
            conversationSubject: "Tour on Tuesday",
        });
        expect(decision.kind).not.toBe("subject_required");
    });

    it("ignores a client-supplied subject — a request must not rename a parent's conversation", () => {
        expect(
            decideEmailSubject({
                supplied: "Something else entirely",
                isReply: true,
                conversationSubject: "Tour on Tuesday",
            })
        ).toEqual({ kind: "subject", subject: "Re: Tour on Tuesday", inherited: true });
    });

    it("proceeds without a subject when the conversation has none — never refuses", () => {
        expect(decideEmailSubject({ supplied: "", isReply: true, conversationSubject: null })).toEqual({
            kind: "inherit_unavailable",
        });
    });

    it("does not stack Re: when replying into an already-prefixed conversation", () => {
        expect(
            decideEmailSubject({ supplied: "", isReply: true, conversationSubject: "Re: Tour on Tuesday" })
        ).toEqual({ kind: "subject", subject: "Re: Tour on Tuesday", inherited: true });
    });
});
