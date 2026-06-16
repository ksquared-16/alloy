import { describe, expect, it } from "vitest";
import {
    CREATE_LEAD_PROGRESS_STEPS,
    resolveCreateLeadProgressStep,
} from "@/lib/admin/actions/createLeadProgressStep";
import {
    applyHighConfidenceCreateLeadExtraction,
    missingRequiredLabelsForCreateLead,
    resolveCreateLeadRequiredFields,
} from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { buildCreateLeadLiveFindings, buildCreateLeadMaterialCard } from "@/lib/admin/actions/createLeadOperationalIntakeModel";
import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";

const KELLY_PASTE = "Kelly Kurzman kelly.kurzman@gmail.com 6022904816";

const enrollmentLeadMetadata = {
    lifecycle_builder_stage_field_rules_v1: {
        version: 1,
        by_stage_key: {
            lead: {
                required_rule_ids: [
                    "opportunity:location",
                    "person:first_name",
                    "person:last_name",
                    "person:email",
                    "person:phone",
                ],
                recommended_rule_ids: [],
            },
        },
    },
};

describe("Kelly Kurzman contact blob parse + auto-apply", () => {
    const spec = resolveCreateLeadActionIntakeSpec({
        department_id: "dept-1",
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: enrollmentLeadMetadata,
    });

    it("parses first name, last name, email, and phone from single-line paste", () => {
        const result = parseCreateLeadIntakeText({ text: KELLY_PASTE, spec });
        const byKey = Object.fromEntries(result.fields.map((f) => [f.payload_key, f]));
        expect(byKey.first_name?.value).toBe("Kelly");
        expect(byKey.first_name?.confidence).toBe("high");
        expect(byKey.last_name?.value).toBe("Kurzman");
        expect(byKey.last_name?.confidence).toBe("high");
        expect(byKey.email?.value).toBe("kelly.kurzman@gmail.com");
        expect(byKey.phone?.value).toMatch(/602.*290.*4816|\(602\) 290-4816/);
    });

    it("auto-applied values satisfy first/last/email/phone in required banner", () => {
        const extraction = parseCreateLeadIntakeText({ text: KELLY_PASTE, spec });
        const values = applyHighConfidenceCreateLeadExtraction({}, extraction);
        expect(values.first_name).toBe("Kelly");
        expect(values.last_name).toBe("Kurzman");
        expect(values.email).toBe("kelly.kurzman@gmail.com");
        expect(values.phone).toMatch(/602.*290.*4816|\(602\) 290-4816/);

        const missing = missingRequiredLabelsForCreateLead(spec, values);
        expect(missing).not.toContain("First name");
        expect(missing).not.toContain("Last name");
        expect(missing).not.toContain("Email");
        expect(missing).not.toContain("Phone");
        expect(missing).toContain("Location");
    });
});

describe("Location in draft lead when Lead stage requires it", () => {
    it("includes location_id in gather fields and missing banner until selected", () => {
        const bundle = resolveCreateLeadRequiredFields({
            departmentId: "dept-1",
            stageKey: "lead",
            departmentMetadata: enrollmentLeadMetadata,
        });
        expect(bundle.gatherFields.some((f) => f.payload_key === "location_id" && f.tier === "required")).toBe(
            true,
        );

        const extraction = parseCreateLeadIntakeText({ text: KELLY_PASTE, spec: bundle.spec });
        const values = applyHighConfidenceCreateLeadExtraction({}, extraction);
        const missingBefore = missingRequiredLabelsForCreateLead(bundle.spec, values);
        expect(missingBefore).toContain("Location");

        const withLocation = { ...values, location_id: "site-1" };
        const missingAfter = missingRequiredLabelsForCreateLead(bundle.spec, withLocation);
        expect(missingAfter).not.toContain("Location");
    });

    it("shows all required gather fields in draft edit mode findings (empty list — form renders fields)", () => {
        const bundle = resolveCreateLeadRequiredFields({
            departmentId: "dept-1",
            stageKey: "lead",
            departmentMetadata: enrollmentLeadMetadata,
        });
        const findings = buildCreateLeadLiveFindings({
            suggestions: [],
            values: { first_name: "Kelly", last_name: "Kurzman" },
            analyzing: false,
            manualMode: false,
            draftEditMode: true,
            gatherFields: bundle.gatherFields,
        });
        expect(findings).toEqual([]);
    });
});

describe("Email and Phone requirement modes", () => {
    it("requires Email and Phone individually when both configured", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: enrollmentLeadMetadata,
        });
        const missing = missingRequiredLabelsForCreateLead(spec, {
            first_name: "Kelly",
            last_name: "Kurzman",
            email: "kelly@example.com",
            phone: "",
            location_id: "site-1",
        });
        expect(missing).toContain("Phone");
        expect(missing).not.toContain("Email or phone");
    });

    it('shows "Email or phone" only on platform fallback', () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
        });
        expect(spec.requirements_source).toBe("platform");
        const missing = missingRequiredLabelsForCreateLead(spec, {
            first_name: "Kelly",
            last_name: "Kurzman",
            email: "",
            phone: "",
        });
        expect(missing.join(" · ")).toMatch(/contact|email|phone/i);
    });
});

describe("Create Lead progress step rail", () => {
    it("advances from paste to review draft after analyze", () => {
        expect(
            resolveCreateLeadProgressStep({
                step: "gather",
                materialAnalyzed: false,
                validationOk: false,
            }),
        ).toBe("paste");

        expect(
            resolveCreateLeadProgressStep({
                step: "gather",
                materialAnalyzed: true,
                validationOk: false,
            }),
        ).toBe("review_draft");

        expect(
            resolveCreateLeadProgressStep({
                step: "gather",
                materialAnalyzed: true,
                validationOk: true,
            }),
        ).toBe("create_lead");
    });

    it("progress pills are non-interactive", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const rail = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/CreateLeadProgressRail.tsx"),
            "utf8",
        );
        expect(rail).toContain("cursor-default");
        expect(rail).toContain('aria-disabled="true"');
        expect(rail).not.toContain("onClick");
        expect(CREATE_LEAD_PROGRESS_STEPS.map((s) => s.label)).toEqual([
            "Paste information",
            "Review draft",
            "Create lead",
        ]);
    });
});

describe("Create Lead modal copy", () => {
    it("does not use Inquiry or Stack in user-facing modal strings", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const files = [
            "../../../components/admin/opportunity/actions/CreateLeadModal.tsx",
            "../../../components/admin/actions/CreateLeadMaterialStackColumn.tsx",
            "../../../components/admin/actions/CreateLeadDraftLeadColumn.tsx",
            "../../../lib/admin/actions/createLeadOperationalIntakeModel.ts",
            "../../../lib/admin/actions/bosWorkspaceShell.ts",
        ];
        for (const rel of files) {
            const src = readFileSync(resolve(__dirname, rel), "utf8");
            expect(src).not.toMatch(/["'`][^"'`]*inquiry[^"'`]*["'`]/i);
        }
        const operational = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/CreateLeadOperationalIntake.tsx"),
            "utf8",
        );
        expect(operational).not.toMatch(/>\s*[^<]*inquiry[^<]*</i);
    });

    it("uses Paste information label on material card", () => {
        const card = buildCreateLeadMaterialCard({
            pasteText: KELLY_PASTE,
            analyzing: false,
            analyzed: true,
        });
        expect(card?.label).toBe("Pasted information");
    });
});

describe("Client vs server create lead validation boundary", () => {
    it("documents that executeCreateLeadAction enforces platform minimum only", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const server = readFileSync(
            resolve(__dirname, "../../../lib/admin/actions/entryLifecycleActions.ts"),
            "utf8",
        );
        expect(server).toContain("validateCreateLeadFromIntakeSpec");
        expect(server).toMatch(/Server minimum|stage-configured requirements/i);
    });

    it("CreateLeadModal maps submit payload through intake spec when configured", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const modal = readFileSync(
            resolve(__dirname, "../../../components/admin/opportunity/actions/CreateLeadModal.tsx"),
            "utf8",
        );
        expect(modal).toContain("mapActionIntakeValuesToCreateLeadPayload");
        expect(modal).toContain("validateCreateLeadFromIntakeSpec");
    });
});
