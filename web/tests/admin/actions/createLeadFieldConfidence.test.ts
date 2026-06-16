import { describe, expect, it } from "vitest";
import { buildCreateLeadFieldConfidenceMap } from "@/lib/admin/actions/createLeadFieldConfidence";
import {
    applyHighConfidenceCreateLeadExtraction,
    gatherFieldsFromActionIntakeSpec,
    resolveCreateLeadRequiredFields,
} from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";

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

describe("buildCreateLeadFieldConfidenceMap", () => {
    const bundle = resolveCreateLeadRequiredFields({
        departmentId: "dept-1",
        stageKey: "lead",
        departmentMetadata: enrollmentLeadMetadata,
    });
    const gatherFields = gatherFieldsFromActionIntakeSpec(bundle.spec);

    it("marks high-confidence extracted fields after analyze + auto-apply", () => {
        const extraction = parseCreateLeadIntakeText({ text: KELLY_PASTE, spec: bundle.spec });
        const values = applyHighConfidenceCreateLeadExtraction({}, extraction);
        const confidence = buildCreateLeadFieldConfidenceMap({
            extraction,
            values,
            gatherFields,
            materialAnalyzed: true,
        });

        expect(confidence.first_name).toBe("high");
        expect(confidence.last_name).toBe("high");
        expect(confidence.email).toBe("high");
        expect(confidence.phone).toBe("high");
    });

    it("marks required location as undetected when missing after analyze", () => {
        const extraction = parseCreateLeadIntakeText({ text: KELLY_PASTE, spec: bundle.spec });
        const values = applyHighConfidenceCreateLeadExtraction({}, extraction);
        const confidence = buildCreateLeadFieldConfidenceMap({
            extraction,
            values,
            gatherFields,
            materialAnalyzed: true,
        });

        expect(confidence.location_id).toBe("undetected");
    });

    it("marks manually entered location as manual", () => {
        const extraction = parseCreateLeadIntakeText({ text: KELLY_PASTE, spec: bundle.spec });
        const values = {
            ...applyHighConfidenceCreateLeadExtraction({}, extraction),
            location_id: "site-1",
        };
        const confidence = buildCreateLeadFieldConfidenceMap({
            extraction,
            values,
            gatherFields,
            materialAnalyzed: true,
        });

        expect(confidence.location_id).toBe("manual");
    });

    it("returns empty map before material is analyzed", () => {
        expect(
            buildCreateLeadFieldConfidenceMap({
                extraction: null,
                values: {},
                gatherFields,
                materialAnalyzed: false,
            }),
        ).toEqual({});
    });
});

describe("confidence badge wiring in draft edit mode", () => {
    it("passes fieldConfidence through intake column to gather fields", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const draftColumn = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/CreateLeadDraftLeadColumn.tsx"),
            "utf8",
        );
        expect(draftColumn).toContain("fieldConfidence={fieldConfidence}");
        const gatherFields = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/ActionWorkspaceGatherFields.tsx"),
            "utf8",
        );
        expect(gatherFields).toContain("FieldConfidenceBadge");
        const theme = readFileSync(
            resolve(__dirname, "../../../lib/admin/actions/actionWorkspaceBosTheme.ts"),
            "utf8",
        );
        expect(theme).toContain("Not detected");
    });
});
