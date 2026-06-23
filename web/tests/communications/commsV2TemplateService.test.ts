import { describe, expect, it } from "vitest";
import {
    buildTemplatePreview,
    computeTemplateTokenPaths,
    mergeContent,
    nextVersionNumber,
    parseTemplateListFilters,
    shouldCreateNewVersion,
    validateCreateTemplateInput,
    validatePatchTemplateInput,
    validateSubjectForChannel,
} from "@/lib/communications/v2/templateService";

/** Comms V2 Phase 1 / B2 — pure template API service logic. */

describe("validateSubjectForChannel", () => {
    it("allows a subject for email", () => {
        const r = validateSubjectForChannel("email", "  Welcome  ");
        expect(r).toEqual({ ok: true, value: "Welcome" });
    });
    it("normalizes empty email subject to null", () => {
        expect(validateSubjectForChannel("email", "   ")).toEqual({ ok: true, value: null });
    });
    it("rejects a non-empty subject for sms", () => {
        const r = validateSubjectForChannel("sms", "Hi");
        expect(r.ok).toBe(false);
    });
    it("rejects a non-empty subject for in_app", () => {
        expect(validateSubjectForChannel("in_app", "Hi").ok).toBe(false);
    });
    it("allows an absent/empty subject for sms (normalized to null)", () => {
        expect(validateSubjectForChannel("sms", "")).toEqual({ ok: true, value: null });
        expect(validateSubjectForChannel("sms", undefined)).toEqual({ ok: true, value: null });
    });
});

describe("validateCreateTemplateInput", () => {
    const base = { name: "Tour follow-up", category: "tour", channel: "email", body: "Hi {{person.first_name}}" };

    it("accepts a valid email template with subject", () => {
        const r = validateCreateTemplateInput({ ...base, subject: "Your tour" });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.status).toBe("draft"); // defaulted
            expect(r.value.subject).toBe("Your tour");
        }
    });
    it("requires a name", () => {
        expect(validateCreateTemplateInput({ ...base, name: "  " }).ok).toBe(false);
    });
    it("requires a non-empty category", () => {
        expect(validateCreateTemplateInput({ ...base, category: "  " }).ok).toBe(false);
    });
    it("accepts a free-text category", () => {
        expect(validateCreateTemplateInput({ ...base, category: "marketing" }).ok).toBe(true);
    });
    it("rejects an invalid channel", () => {
        expect(validateCreateTemplateInput({ ...base, channel: "fax" }).ok).toBe(false);
    });
    it("rejects an invalid status", () => {
        expect(validateCreateTemplateInput({ ...base, status: "live" }).ok).toBe(false);
    });
    it("rejects a subject on an sms template", () => {
        expect(validateCreateTemplateInput({ ...base, channel: "sms", subject: "Nope" }).ok).toBe(false);
    });
    it("accepts an sms template without subject (subject null)", () => {
        const r = validateCreateTemplateInput({ ...base, channel: "sms", subject: "", body: "Hi" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.subject).toBeNull();
    });
});

describe("computeTemplateTokenPaths", () => {
    it("unions subject + body tokens, de-duped, stable order", () => {
        expect(
            computeTemplateTokenPaths("Hi {{person.first_name}}", "{{location.name}} — {{person.first_name}}")
        ).toEqual(["person.first_name", "location.name"]);
    });
    it("handles null subject", () => {
        expect(computeTemplateTokenPaths(null, "{{org.name}}")).toEqual(["org.name"]);
    });
});

describe("shouldCreateNewVersion", () => {
    const cur = { subject: "A", body: "B" };
    it("is false when no content fields supplied", () => {
        expect(shouldCreateNewVersion(cur, {}, false)).toBe(false);
    });
    it("is true when body changes", () => {
        expect(shouldCreateNewVersion(cur, { body: "B2" }, true)).toBe(true);
    });
    it("is true when subject changes", () => {
        expect(shouldCreateNewVersion(cur, { subject: "A2" }, true)).toBe(true);
    });
    it("is false when content fields supplied but identical", () => {
        expect(shouldCreateNewVersion(cur, { subject: "A", body: "B" }, true)).toBe(false);
    });
});

describe("nextVersionNumber / mergeContent", () => {
    it("starts at 1 and increments", () => {
        expect(nextVersionNumber(null)).toBe(1);
        expect(nextVersionNumber(0)).toBe(1);
        expect(nextVersionNumber(3)).toBe(4);
    });
    it("merges a content patch over the current version", () => {
        expect(mergeContent({ subject: "A", body: "B" }, { body: "B2" })).toEqual({ subject: "A", body: "B2" });
        expect(mergeContent({ subject: "A", body: "B" }, {})).toEqual({ subject: "A", body: "B" });
    });
});

describe("validatePatchTemplateInput", () => {
    it("flags metadata-only edits as non-content", () => {
        const r = validatePatchTemplateInput({ name: "New name" }, "email");
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.hasContentFields).toBe(false);
            expect(r.value.meta.name).toBe("New name");
        }
    });
    it("flags body edits as content", () => {
        const r = validatePatchTemplateInput({ body: "x" }, "email");
        expect(r.ok && r.value.hasContentFields).toBe(true);
    });
    it("rejects an invalid status", () => {
        expect(validatePatchTemplateInput({ status: "live" }, "email").ok).toBe(false);
    });
    it("rejects a subject when channel is being changed to sms in the same request", () => {
        expect(validatePatchTemplateInput({ channel: "sms", subject: "Hi" }, "email").ok).toBe(false);
    });
});

describe("buildTemplatePreview", () => {
    const ctx = { person: { first_name: "Mateo" }, org: { name: "Bright Beginnings" } };

    it("reports resolved, missing, and unknown tokens in the body", () => {
        const p = buildTemplatePreview(
            { subject: null, body: "Hi {{person.first_name}} at {{opportunity.program}} ({{person.ssn}})" },
            ctx
        );
        expect(p.subject).toBeNull();
        expect(p.body.plainText).toBe("Hi Mateo at  ()");
        expect(p.body.missingPaths).toEqual(["opportunity.program"]);
        expect(p.body.unknownPaths).toEqual(["person.ssn"]);
    });

    it("renders a subject resolution when present", () => {
        const p = buildTemplatePreview({ subject: "Welcome to {{org.name}}", body: "" }, ctx);
        expect(p.subject?.plainText).toBe("Welcome to Bright Beginnings");
    });
});

describe("parseTemplateListFilters", () => {
    it("accepts a valid subset", () => {
        const r = parseTemplateListFilters({ channel: "email", status: "active" });
        expect(r).toEqual({ ok: true, value: { channel: "email", status: "active" } });
    });
    it("accepts a free-text category filter", () => {
        expect(parseTemplateListFilters({ category: "enrollment reminders" })).toEqual({
            ok: true,
            value: { category: "enrollment reminders" },
        });
    });
    it("rejects an invalid channel filter", () => {
        expect(parseTemplateListFilters({ channel: "fax" }).ok).toBe(false);
    });
    it("ignores empty/absent filters", () => {
        expect(parseTemplateListFilters({})).toEqual({ ok: true, value: {} });
    });
});
