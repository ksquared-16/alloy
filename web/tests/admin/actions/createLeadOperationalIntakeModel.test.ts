import { describe, expect, it } from "vitest";

import {
    buildCreateLeadLiveFindings,
    buildCreateLeadMaterialCard,
} from "@/lib/admin/actions/createLeadOperationalIntakeModel";

describe("createLeadOperationalIntakeModel", () => {
    it("builds material card with unread, reading, and read statuses", () => {
        expect(buildCreateLeadMaterialCard({ pasteText: "", analyzing: false, analyzed: false })).toBeNull();

        expect(
            buildCreateLeadMaterialCard({ pasteText: "Parent: Ada", analyzing: false, analyzed: false })?.status,
        ).toBe("unread");

        expect(
            buildCreateLeadMaterialCard({ pasteText: "Parent: Ada", analyzing: true, analyzed: false })?.status,
        ).toBe("reading");

        expect(
            buildCreateLeadMaterialCard({ pasteText: "Parent: Ada", analyzing: false, analyzed: true })?.status,
        ).toBe("read");
    });

    it("shows suggestion findings before applied values and placeholders when empty", () => {
        const suggestions = [
            {
                id: "first_name:Ada",
                payload_key: "first_name",
                field_label: "First name",
                suggested_value: "Ada",
                confidence: "high" as const,
                selected: true,
            },
        ];

        const fromSuggestions = buildCreateLeadLiveFindings({
            suggestions,
            values: { first_name: "" },
            analyzing: false,
            manualMode: false,
        });
        expect(fromSuggestions[0]?.value).toBe("Ada");
        expect(fromSuggestions[0]?.source).toBe("suggestion");

        const fromValues = buildCreateLeadLiveFindings({
            suggestions: [],
            values: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            analyzing: false,
            manualMode: false,
        });
        expect(fromValues.some((f) => f.payloadKey === "first_name" && f.value === "Ada")).toBe(true);

        const placeholders = buildCreateLeadLiveFindings({
            suggestions: [],
            values: {},
            analyzing: false,
            manualMode: false,
        });
        expect(placeholders.some((f) => f.status === "empty")).toBe(true);
    });
});
