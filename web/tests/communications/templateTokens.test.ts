import { describe, expect, it } from "vitest";
import {
    COMMUNICATION_TOKEN_CATALOG,
    COMMUNICATION_TOKEN_GROUPS,
    filterCommunicationTokens,
    getCommunicationTokenDef,
    isKnownCommunicationTokenPath,
    listCommunicationTokensByGroup,
    parseCommunicationTokenPaths,
    renderCommunicationTemplate,
    segmentCommunicationTemplate,
    validateCommunicationTokenPaths,
    type CommunicationTokenSegment,
} from "@/lib/communications/v2/templateTokens";

/** Phase 1 / B0 — pure {{dot.path}} token core. No schema, UI, or provider. */

const CONTEXT = {
    person: { first_name: "Mateo", name: "Mateo Rivera" },
    customer: { name: "The Rivera Family" },
    location: { name: "North Campus" },
    org: { name: "Bright Beginnings" },
};

function tokenSegments(segments: CommunicationTokenSegment[]) {
    return segments.filter((s): s is Extract<CommunicationTokenSegment, { kind: "token" }> => s.kind === "token");
}

describe("communication token catalog", () => {
    it("exposes only catalog-defined paths as known", () => {
        expect(isKnownCommunicationTokenPath("person.first_name")).toBe(true);
        expect(isKnownCommunicationTokenPath("org.name")).toBe(true);
        expect(isKnownCommunicationTokenPath("person.ssn")).toBe(false);
        expect(isKnownCommunicationTokenPath("")).toBe(false);
    });

    it("every catalog entry has a valid group and a sample", () => {
        for (const def of COMMUNICATION_TOKEN_CATALOG) {
            expect(COMMUNICATION_TOKEN_GROUPS).toContain(def.group);
            expect(def.path.length).toBeGreaterThan(0);
            expect(def.label.length).toBeGreaterThan(0);
            expect(def.sample.length).toBeGreaterThan(0);
        }
    });

    it("has unique paths", () => {
        const paths = COMMUNICATION_TOKEN_CATALOG.map((d) => d.path);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it("looks up defs by path", () => {
        expect(getCommunicationTokenDef("location.name")?.label).toBe("Location name");
        expect(getCommunicationTokenDef("nope.path")).toBeNull();
    });

    it("groups every token and drops empty groups", () => {
        const grouped = listCommunicationTokensByGroup();
        const flattened = grouped.flatMap((g) => g.tokens);
        expect(flattened).toHaveLength(COMMUNICATION_TOKEN_CATALOG.length);
        for (const g of grouped) expect(g.tokens.length).toBeGreaterThan(0);
    });

    it("filters tokens by search query", () => {
        const grouped = filterCommunicationTokens("tour");
        const paths = grouped.flatMap((g) => g.tokens.map((t) => t.path));
        expect(paths).toContain("opportunity.metadata.tour_date");
        expect(paths).not.toContain("org.name");
    });

    it("includes documented workflow merge paths for job and schedule", () => {
        expect(getCommunicationTokenDef("job.title")?.group).toBe("schedule");
        expect(getCommunicationTokenDef("job.id")?.group).toBe("schedule");
    });
});

describe("parseCommunicationTokenPaths", () => {
    it("extracts unique paths in first-seen order", () => {
        const text = "Hi {{person.first_name}}, welcome to {{location.name}}. — {{person.first_name}}";
        expect(parseCommunicationTokenPaths(text)).toEqual(["person.first_name", "location.name"]);
    });

    it("tolerates inner whitespace", () => {
        expect(parseCommunicationTokenPaths("{{  person.name  }}")).toEqual(["person.name"]);
    });

    it("returns empty for no tokens or non-string", () => {
        expect(parseCommunicationTokenPaths("plain text")).toEqual([]);
        expect(parseCommunicationTokenPaths("")).toEqual([]);
        // @ts-expect-error guard against non-string input at runtime
        expect(parseCommunicationTokenPaths(null)).toEqual([]);
    });

    it("ignores malformed tokens (no leading letter / empty)", () => {
        expect(parseCommunicationTokenPaths("{{1bad}} {{}} {{ .x }}")).toEqual([]);
    });
});

describe("validateCommunicationTokenPaths", () => {
    it("splits known vs unknown preserving order", () => {
        const text = "{{person.first_name}} {{person.ssn}} {{org.name}}";
        expect(validateCommunicationTokenPaths(text)).toEqual({
            knownPaths: ["person.first_name", "org.name"],
            unknownPaths: ["person.ssn"],
        });
    });
});

describe("segmentCommunicationTemplate", () => {
    it("marks resolved / missing / unknown correctly", () => {
        const text = "Hi {{person.first_name}} at {{opportunity.program}}, ref {{person.ssn}}";
        const res = segmentCommunicationTemplate(text, CONTEXT);
        const tokens = tokenSegments(res.segments);

        const byPath = Object.fromEntries(tokens.map((t) => [t.path, t]));
        expect(byPath["person.first_name"].status).toBe("resolved");
        expect(byPath["person.first_name"].value).toBe("Mateo");
        // catalog path but no value in context -> missing
        expect(byPath["opportunity.program"].status).toBe("missing");
        expect(byPath["opportunity.program"].value).toBeNull();
        // not in catalog -> unknown
        expect(byPath["person.ssn"].status).toBe("unknown");
        expect(byPath["person.ssn"].label).toBeNull();

        expect(res.missingPaths).toEqual(["opportunity.program"]);
        expect(res.unknownPaths).toEqual(["person.ssn"]);
    });

    it("treats all catalog tokens as missing when no context is supplied", () => {
        const res = segmentCommunicationTemplate("Hi {{person.first_name}}");
        const token = tokenSegments(res.segments)[0];
        expect(token.status).toBe("missing");
        expect(res.missingPaths).toEqual(["person.first_name"]);
    });

    it("preserves surrounding text segments and reconstructs order", () => {
        const res = segmentCommunicationTemplate("A {{person.name}} B", CONTEXT);
        expect(res.segments.map((s) => s.kind)).toEqual(["text", "token", "text"]);
        expect((res.segments[0] as { text: string }).text).toBe("A ");
        expect((res.segments[2] as { text: string }).text).toBe(" B");
    });

    it("plainText matches canonical render (missing/unknown -> empty)", () => {
        const text = "Hi {{person.first_name}} / {{opportunity.program}} / {{person.ssn}}!";
        const res = segmentCommunicationTemplate(text, CONTEXT);
        expect(res.plainText).toBe(renderCommunicationTemplate(text, CONTEXT));
        expect(res.plainText).toBe("Hi Mateo /  / !");
    });

    it("handles empty input", () => {
        const res = segmentCommunicationTemplate("");
        expect(res).toEqual({ segments: [], unknownPaths: [], missingPaths: [], plainText: "" });
    });
});

describe("renderCommunicationTemplate", () => {
    it("resolves known tokens and empties missing ones", () => {
        expect(
            renderCommunicationTemplate("Hi {{person.first_name}} ({{customer.name}})", CONTEXT)
        ).toBe("Hi Mateo (The Rivera Family)");
        expect(renderCommunicationTemplate("X {{opportunity.program}} Y", CONTEXT)).toBe("X  Y");
    });
});
