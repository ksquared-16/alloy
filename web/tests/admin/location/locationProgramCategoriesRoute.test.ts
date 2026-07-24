import { describe, expect, it } from "vitest";
import { buildProgramCategoryPatch } from "@/app/api/admin/location-program-categories/route";

describe("location program category PATCH contract", () => {
    it("persists the metadata object used by both the editor and read model", () => {
        const metadata = {
            age_range_from: "0",
            age_range_to: "18",
            age_range_unit: "months",
            default_room_types: "Infant room",
            unrelated_existing_key: true,
        };

        expect(
            buildProgramCategoryPatch(
                {
                    label: " Infant ",
                    is_active: false,
                    metadata,
                },
                "2026-07-17T00:00:00.000Z",
            ),
        ).toEqual({
            ok: true,
            patch: {
                label: "Infant",
                is_active: false,
                metadata,
                updated_at: "2026-07-17T00:00:00.000Z",
            },
        });
    });

    it("allows an empty metadata object so cleared fields durably remain cleared", () => {
        expect(buildProgramCategoryPatch({ metadata: {} }, "2026-07-17T00:00:00.000Z")).toEqual({
            ok: true,
            patch: {
                metadata: {},
                updated_at: "2026-07-17T00:00:00.000Z",
            },
        });
    });

    it("normalizes the two permitted Location-owned publication fields", () => {
        expect(
            buildProgramCategoryPatch(
                {
                    local_description_override: " Downtown description ",
                    local_authorization_evidence: " License 123 ",
                },
                "2026-07-17T00:00:00.000Z",
            ),
        ).toEqual({
            ok: true,
            patch: {
                local_description_override: "Downtown description",
                local_authorization_evidence: "License 123",
                updated_at: "2026-07-17T00:00:00.000Z",
            },
        });
    });

    it("accepts local display name and availability dates", () => {
        expect(
            buildProgramCategoryPatch(
                {
                    local_display_name: " Young Infants ",
                    available_from: "2027-03-01",
                    available_through: "",
                },
                "2026-07-22T00:00:00.000Z",
            ),
        ).toEqual({
            ok: true,
            patch: {
                local_display_name: "Young Infants",
                available_from: "2027-03-01",
                available_through: null,
                updated_at: "2026-07-22T00:00:00.000Z",
            },
        });
        expect(
            buildProgramCategoryPatch({
                available_from: "2027-03-01",
                available_through: "2027-02-01",
            }),
        ).toEqual({
            ok: false,
            error: "Available through must be on or after Available from.",
        });
    });

    it("rejects invalid metadata and non-numeric sort order", () => {
        expect(buildProgramCategoryPatch({ metadata: [] })).toEqual({
            ok: false,
            error: "metadata must be an object",
        });
        expect(buildProgramCategoryPatch({ sort_order: "not-a-number" })).toEqual({
            ok: false,
            error: "sort_order must be a number",
        });
    });
});
