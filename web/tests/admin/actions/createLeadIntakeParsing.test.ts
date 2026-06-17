import { describe, expect, it } from "vitest";
import {
    applyHighConfidenceCreateLeadExtraction,
    resolveCreateLeadRequiredFields,
} from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import {
    createLeadParserSpec,
    validateCreateLeadPlatformMinimum,
} from "@/lib/admin/actions/createLeadPlatformGather";
import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
    normalizeCreateLeadPhoneDigits,
} from "@/lib/admin/actions/createLeadIntakeValidation";
import { buildCreateLeadFieldConfidenceMap } from "@/lib/admin/actions/createLeadFieldConfidence";
import { gatherFieldsFromActionIntakeSpec } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";

const spec = createLeadParserSpec("dept-1");

const JORDAN_PASTE = ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n");

const OPTIONAL_PASTE = [
    "Jordan Lee",
    "jordan.lee@test.com",
    "1231231234",
    "Child: Emma Lee",
    "Age: 3",
    "Looking for preschool",
    "Start date: August",
    "Source: Website",
].join("\n");

describe("parseCreateLeadIntakeText — Jordan Lee simple paste", () => {
    it("splits full name and extracts valid email and phone", () => {
        const result = parseCreateLeadIntakeText({ text: JORDAN_PASTE, spec });
        const byKey = Object.fromEntries(result.fields.map((f) => [f.payload_key, f]));

        expect(byKey.first_name?.value).toBe("Jordan");
        expect(byKey.first_name?.confidence).toBe("high");
        expect(byKey.last_name?.value).toBe("Lee");
        expect(byKey.last_name?.confidence).toBe("high");
        expect(byKey.email?.value).toBe("jordan.lee@test.com");
        expect(byKey.email?.confidence).toBe("high");
        expect(byKey.phone?.value).toBe("1231231234");
        expect(byKey.phone?.confidence).toBe("high");
    });

    it("auto-applies high-confidence fields to draft values", () => {
        const extraction = parseCreateLeadIntakeText({ text: JORDAN_PASTE, spec });
        const values = applyHighConfidenceCreateLeadExtraction({}, extraction);
        expect(values.first_name).toBe("Jordan");
        expect(values.last_name).toBe("Lee");
        expect(values.email).toBe("jordan.lee@test.com");
        expect(values.phone).toBe("1231231234");
    });
});

describe("email validation", () => {
    it("accepts jordan.lee@test.com", () => {
        expect(isValidCreateLeadEmail("jordan.lee@test.com")).toBe(true);
    });

    it("rejects jordan.lee@test (no domain TLD segment)", () => {
        expect(isValidCreateLeadEmail("jordan.lee@test")).toBe(false);
    });

    it("rejects jordan.lee", () => {
        expect(isValidCreateLeadEmail("jordan.lee")).toBe(false);
    });

    it("marks invalid email in parser output", () => {
        const result = parseCreateLeadIntakeText({
            text: "Jordan Lee\njordan.lee@test\n1231231234",
            spec,
        });
        const email = result.fields.find((f) => f.payload_key === "email");
        expect(email?.confidence).toBe("invalid");
    });
});

describe("phone validation", () => {
    it("accepts 10-digit phone", () => {
        expect(isValidCreateLeadPhone("1231231234")).toBe(true);
    });

    it("rejects 8-digit phone", () => {
        expect(isValidCreateLeadPhone("12312312")).toBe(false);
    });

    it("normalizes (123) 123-1234 to 10 digits", () => {
        expect(normalizeCreateLeadPhoneDigits("(123) 123-1234")).toBe("1231231234");
        expect(isValidCreateLeadPhone("(123) 123-1234")).toBe(true);
    });

    it("does not silently truncate invalid phone — marks invalid", () => {
        const result = parseCreateLeadIntakeText({
            text: "Jordan Lee\njordan.lee@test.com\n12312312",
            spec,
        });
        const phone = result.fields.find((f) => f.payload_key === "phone");
        expect(phone?.value).toBe("12312312");
        expect(phone?.confidence).toBe("invalid");
    });
});

describe("validateCreateLeadPlatformMinimum — required field blocking", () => {
    it("blocks when location is missing", () => {
        const result = validateCreateLeadPlatformMinimum({
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan.lee@test.com",
            phone: "",
            location_id: "",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.issues.some((i) => /location/i.test(i))).toBe(true);
    });

    it("blocks when first or last name missing", () => {
        const missingFirst = validateCreateLeadPlatformMinimum({
            first_name: "",
            last_name: "Lee",
            email: "jordan.lee@test.com",
            location_id: "site-1",
        });
        expect(missingFirst.ok).toBe(false);

        const missingLast = validateCreateLeadPlatformMinimum({
            first_name: "Jordan",
            last_name: "",
            email: "jordan.lee@test.com",
            location_id: "site-1",
        });
        expect(missingLast.ok).toBe(false);
    });

    it("blocks when both email and phone missing", () => {
        const result = validateCreateLeadPlatformMinimum({
            first_name: "Jordan",
            last_name: "Lee",
            email: "",
            phone: "",
            location_id: "site-1",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.issues.some((i) => /email or phone/i.test(i))).toBe(true);
    });

    it("allows creation when required fields satisfied with valid email", () => {
        const result = validateCreateLeadPlatformMinimum({
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan.lee@test.com",
            phone: "",
            location_id: "site-1",
        });
        expect(result.ok).toBe(true);
    });
});

describe("optional fields — do not block creation", () => {
    it("allows creation without child, source, or program", () => {
        const result = validateCreateLeadPlatformMinimum({
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan.lee@test.com",
            phone: "",
            location_id: "site-1",
            child_first_name: "",
            source: "",
            child_program: "",
        });
        expect(result.ok).toBe(true);
    });

    it("extracts optional child, age, program, start date, and source when pasted", () => {
        const result = parseCreateLeadIntakeText({ text: OPTIONAL_PASTE, spec });
        const byKey = Object.fromEntries(result.fields.map((f) => [f.payload_key, f.value]));

        expect(byKey.child_first_name).toBe("Emma");
        expect(byKey.child_last_name).toBe("Lee");
        expect(byKey.child_age).toBe("3");
        expect(byKey.child_program?.toLowerCase()).toContain("preschool");
        expect(byKey.child_desired_start_date).toBe("August");
        expect(byKey.source).toBe("Website");
    });
});

describe("confidence labels", () => {
    it("marks invalid parsed email as invalid confidence after analyze", () => {
        const bundle = resolveCreateLeadRequiredFields({
            departmentId: "dept-1",
            stageKey: "lead",
        });
        const gatherFields = gatherFieldsFromActionIntakeSpec(bundle.spec);
        const extraction = parseCreateLeadIntakeText({
            text: "Jordan Lee\njordan.lee@test\n1231231234",
            spec: bundle.spec,
        });
        const values = applyHighConfidenceCreateLeadExtraction({}, extraction);
        const confidence = buildCreateLeadFieldConfidenceMap({
            extraction,
            values,
            gatherFields,
            materialAnalyzed: true,
        });
        expect(confidence.email).toBe("invalid");
        expect(confidence.first_name).toBe("high");
    });

    it("marks missing required location as not detected", () => {
        const bundle = resolveCreateLeadRequiredFields({ departmentId: "dept-1", stageKey: "lead" });
        const gatherFields = gatherFieldsFromActionIntakeSpec(bundle.spec);
        const extraction = parseCreateLeadIntakeText({ text: JORDAN_PASTE, spec: bundle.spec });
        const values = applyHighConfidenceCreateLeadExtraction({}, extraction);
        const confidence = buildCreateLeadFieldConfidenceMap({
            extraction,
            values,
            gatherFields,
            materialAnalyzed: true,
        });
        expect(confidence.location_id).toBe("undetected");
    });
});

describe("unified draft layout wiring", () => {
    it("Create Lead draft uses unified layout without entity tabs", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const draft = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/CreateLeadDraftLeadColumn.tsx"),
            "utf8",
        );
        expect(draft).toContain('layout="unified"');
        const gather = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/ActionWorkspaceGatherFields.tsx"),
            "utf8",
        );
        expect(gather).toContain("Required to create lead");
        expect(gather).toContain("Optional if available");
        expect(gather).toContain('layout === "unified"');
        expect(gather).toContain("-section-required");
    });
});
