import { describe, expect, it } from "vitest";
import {
    buildFormIntakeMetaFromPayload,
    DEFAULT_FORM_INTAKE_VALUE_PATHS,
} from "@/lib/forms/intake/buildFormIntakeMetaFromPayload";

const VID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("buildFormIntakeMetaFromPayload", () => {
    it("maps medication-style guardian + child fields", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: {
                guardian_full_name: "Taylor Morgan",
                guardian_email: "taylor@example.com",
                guardian_phone: "",
                child_first_name: "Jamie",
                child_last_name: "Morgan",
                child_dob: "2019-05-01",
            },
            linkMetadata: { default_vertical_id: VID },
            submissionId: "33333333-3333-4333-8333-333333333333",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.vertical_id).toBe(VID);
        expect(r.intake.guardian?.email).toBe("taylor@example.com");
        expect(r.intake.guardian?.first_name).toBe("Taylor");
        expect(r.intake.guardian?.last_name).toBe("Morgan");
        expect(r.intake.child?.first_name).toBe("Jamie");
        expect(r.intake.child?.last_name).toBe("Morgan");
        expect(r.intake.child?.dob).toBe("2019-05-01");
        expect(r.intake.idempotency_key).toBe("33333333-3333-4333-8333-333333333333");
    });

    it("allows phone-only guardian when email absent", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: { guardian_phone: "+15555550101", guardian_full_name: "Sam Lee" },
            linkMetadata: { default_vertical_id: VID },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.guardian?.phone).toBe("+15555550101");
    });

    it("fails when default_vertical_id missing", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: { guardian_email: "a@b.com" },
            linkMetadata: { lead_capture: true },
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason_code).toBe("missing_vertical");
    });

    it("fails when guardian email and phone missing", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: { guardian_full_name: "Only Name" },
            linkMetadata: { default_vertical_id: VID },
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason_code).toBe("missing_guardian_contact");
    });

    it("respects intake_field_paths overrides", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: {
                g_mail: "p@example.com",
                g_phone: "+1",
                nm: "Alex Smith",
                cf: "Riley",
                cl: "Smith",
            },
            linkMetadata: {
                default_vertical_id: VID,
                intake_field_paths: {
                    guardian_email: "g_mail",
                    guardian_phone: "g_phone",
                    guardian_full_name: "nm",
                    child_first_name: "cf",
                    child_last_name: "cl",
                },
            },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.guardian?.email).toBe("p@example.com");
        expect(r.intake.guardian?.first_name).toBe("Alex");
        expect(r.intake.guardian?.last_name).toBe("Smith");
        expect(r.intake.child?.first_name).toBe("Riley");
    });

    it("maps guardian first and last name fields from system field ids", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: {
                guardian_first_name: "Jordan",
                guardian_last_name: "Lee",
                guardian_email: "jordan@example.com",
            },
            linkMetadata: { default_vertical_id: VID },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.guardian?.first_name).toBe("Jordan");
        expect(r.intake.guardian?.last_name).toBe("Lee");
    });

    it("prefers explicit guardian first/last over full name split", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: {
                guardian_first_name: "Jordan",
                guardian_last_name: "Lee",
                guardian_full_name: "Wrong Name",
                guardian_email: "jordan@example.com",
            },
            linkMetadata: { default_vertical_id: VID },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.guardian?.first_name).toBe("Jordan");
        expect(r.intake.guardian?.last_name).toBe("Lee");
    });

    it("website inquiry succeeds without child fields", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: {
                guardian_first_name: "Sam",
                guardian_last_name: "Patel",
                guardian_email: "sam@example.com",
            },
            linkMetadata: { default_vertical_id: VID },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.child).toBeUndefined();
        expect(r.intake.children).toBeUndefined();
    });

    it("exports defaults with expected medication keys", () => {
        expect(DEFAULT_FORM_INTAKE_VALUE_PATHS.guardian_email).toBe("guardian_email");
        expect(DEFAULT_FORM_INTAKE_VALUE_PATHS.guardian_first_name).toBe("guardian_first_name");
        expect(DEFAULT_FORM_INTAKE_VALUE_PATHS.guardian_last_name).toBe("guardian_last_name");
        expect(DEFAULT_FORM_INTAKE_VALUE_PATHS.child_dob).toBe("child_dob");
    });
});
