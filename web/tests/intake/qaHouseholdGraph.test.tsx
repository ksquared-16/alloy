import { describe, expect, it, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import { __resetRelationshipCounterForTests } from "@/lib/intake/relationship/buildHouseholdRelationships";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";
import { buildIntakeDebugTrace } from "@/lib/intake/debug/buildIntakeDebugTrace";
import { buildIntakeReviewPresentation } from "@/lib/intake/review/buildIntakeReviewPresentation";
import { IntakeHouseholdReviewPanel } from "@/components/admin/intake/IntakeHouseholdReviewPanel";
import {
    createLeadParserSpec,
    validateCreateLeadPlatformMinimum,
} from "@/lib/admin/actions/createLeadPlatformGather";
import { applyHighConfidenceCreateLeadExtraction } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { emptyCreateLeadGatherValues } from "@/lib/admin/actions/createLeadPlatformGather";

/** Failed QA fixture — shared surname parents, multi-child DOB block, address, invalid phone. */
export const QA_HOUSEHOLD_GRAPH_PASTE = [
    "Parents: Alex and Jason Lyons",
    "Children: Jaxon (11/23/2013 DOB) and Max (11/14/2017 DOB)",
    "1234 Main Street",
    "Bend Oregon 97701",
    "alex.lyons@test.com",
    "987988899",
].join("\n");

beforeEach(() => {
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
    __resetRelationshipCounterForTests();
});

describe("QA household graph — failed intake fixture", () => {
    it("stage 1: extracts facts without child/address lines as parents", () => {
        const extraction = extractFactsFromText({ text: QA_HOUSEHOLD_GRAPH_PASTE });

        expect(extraction.facts).toMatchSnapshot("qa-extract-facts");

        const parentNames = extraction.facts
            .filter((f) => f.fact_type === "person_name" && f.role_hint === "parent")
            .map((f) => f.normalized_value);
        const childNames = extraction.facts
            .filter((f) => f.fact_type === "person_name" && f.role_hint === "child")
            .map((f) => f.normalized_value);
        const addressLines = extraction.facts
            .filter((f) => f.fact_type === "address")
            .map((f) => f.normalized_value);
        const phoneFact = extraction.facts.find((f) => f.fact_type === "phone");

        expect(parentNames).toEqual(["Alex Lyons", "Jason Lyons"]);
        expect(childNames).toEqual(["Jaxon", "Max"]);
        expect(addressLines).toEqual(["1234 Main Street", "Bend, Oregon 97701"]);
        expect(phoneFact?.validation_state).toBe("invalid");
        expect(phoneFact?.raw_value).toBe("987988899");
        expect(parentNames).not.toContain("Jaxon");
        expect(parentNames).not.toContain("Max");
        expect(parentNames).not.toContain("1234 Main Street");
    });

    it("stage 2: builds household graph with 2 parents, 2 children, address, invalid phone", () => {
        const extraction = extractFactsFromText({ text: QA_HOUSEHOLD_GRAPH_PASTE });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);

        expect(household).toMatchSnapshot("qa-household-graph");

        expect(household.parents_guardians).toHaveLength(2);
        expect(household.parents_guardians.map((p) => `${p.first_name} ${p.last_name}`)).toEqual([
            "Alex Lyons",
            "Jason Lyons",
        ]);
        expect(household.children).toHaveLength(2);
        expect(household.children.map((c) => c.first_name)).toEqual(["Jaxon", "Max"]);
        expect(household.children[0]?.last_name).toBe("Lyons");
        expect(household.children[1]?.last_name).toBe("Lyons");
        expect(household.children[0]?.dob).toBe("2013-11-23");
        expect(household.children[1]?.dob).toBe("2017-11-14");
        expect(household.children[0]?.calculated_age?.display).toBeTruthy();
        expect(household.children[1]?.calculated_age?.display).toBeTruthy();
        expect(household.address?.lines).toEqual(["1234 Main Street", "Bend, Oregon 97701"]);
        expect(household.location).toBeNull();
        expect(household.household_contacts.some((c) => c.kind === "phone" && c.validation_state === "invalid")).toBe(
            true,
        );
        expect(household.review_warnings.some((w) => w.code === "invalid_phone")).toBe(true);
        expect(household.review_warnings.some((w) => w.message.includes("3 parents"))).toBe(false);
    });

    it("stage 3: maps household graph to Create Lead primary fields", () => {
        const extraction = extractFactsFromText({ text: QA_HOUSEHOLD_GRAPH_PASTE });
        const spec = createLeadParserSpec("dept-qa");
        const mapped = mapFactsToActionIntake({
            extraction,
            spec,
            field_options: {
                location_id: [{ value: "site-1", label: "Main Campus" }],
            },
        });

        const byKey = Object.fromEntries(mapped.candidates.map((c) => [c.payload_key, c]));
        expect(byKey.first_name?.value).toBe("Alex");
        expect(byKey.last_name?.value).toBe("Lyons");
        expect(byKey.email?.value).toBe("alex.lyons@test.com");
        expect(byKey.phone?.value).toBe("987988899");
        expect(byKey.phone?.confidence).toBe("invalid");
        expect(byKey.child_first_name?.value).toBe("Jaxon");
        expect(byKey.child_last_name?.value).toBe("Lyons");
        expect(byKey.child_date_of_birth?.value).toBe("2013-11-23");
        expect(mapped.review_warning_items?.some((w) => w.code === "extra_parents_commit_limited")).toBe(true);
        expect(mapped.review_warning_items?.some((w) => w.code === "extra_children_commit_limited")).toBe(true);
        expect(mapped.review_warning_items?.some((w) => w.code === "invalid_phone")).toBe(true);
    });

    it("stage 4: renders household review panel from graph only", () => {
        const extraction = extractFactsFromText({ text: QA_HOUSEHOLD_GRAPH_PASTE });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        const review = buildIntakeReviewPresentation(household);
        const html = renderToStaticMarkup(<IntakeHouseholdReviewPanel household={household} />);

        expect(review?.parents).toHaveLength(2);
        expect(review?.children).toHaveLength(2);
        expect(review?.children.map((c) => c.display_name)).toEqual(["Jaxon Lyons", "Max Lyons"]);
        expect(review?.address_lines).toEqual(["1234 Main Street", "Bend, Oregon 97701"]);

        expect(html).toContain("Household detected");
        expect(html).toContain("Alex Lyons");
        expect(html).toContain("Jason Lyons");
        expect(html).toContain("Jaxon Lyons");
        expect(html).toContain("Max Lyons");
        expect(html).toContain("1234 Main Street");
        expect(html).toContain("Bend, Oregon 97701");
        expect(html).not.toContain("Children: Jaxon");
        expect(html).not.toMatch(/3 parents/i);
    });

    it("stage 5: invalid phone does not block Create Lead when valid email exists", () => {
        const extraction = extractFactsFromText({ text: QA_HOUSEHOLD_GRAPH_PASTE });
        const spec = createLeadParserSpec("dept-qa");
        const mapped = mapFactsToActionIntake({ extraction, spec });
        const values = applyHighConfidenceCreateLeadExtraction(emptyCreateLeadGatherValues(), {
            fields: mapped.candidates.map((c) => ({
                payload_key: c.payload_key,
                rule_id: c.rule_id,
                value: c.value,
                confidence: c.confidence,
            })),
            unmapped_text: "",
            raw_text: QA_HOUSEHOLD_GRAPH_PASTE,
        });
        values.location_id = "site-1";

        const check = validateCreateLeadPlatformMinimum(values);
        expect(check.ok).toBe(true);
        expect(values.phone).toBe("987988899");
        expect(values.email).toBe("alex.lyons@test.com");
    });

    it("debug trace captures pipeline stages", () => {
        const spec = createLeadParserSpec("dept-qa");
        const trace = buildIntakeDebugTrace({ text: QA_HOUSEHOLD_GRAPH_PASTE, spec });

        expect(trace.raw_text).toBe(QA_HOUSEHOLD_GRAPH_PASTE);
        expect(trace.household.parents_guardians).toHaveLength(2);
        expect(trace.household.children).toHaveLength(2);
        expect(trace.mapped_fields.some((f) => f.payload_key === "email")).toBe(true);
        expect(trace.review_warnings.some((w) => w.includes("invalid"))).toBe(true);
        expect(trace.commit_limited).toBe(false);
        expect(trace.commit_preview.will_create.filter((i) => i.label.startsWith("Parent")).length).toBeGreaterThanOrEqual(1);
    });
});
