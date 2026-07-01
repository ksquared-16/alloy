/**
 * Sprint 5.18T — layout editor hook order + location PATCH hardening.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildLayoutRuntimeOpportunityNativePatch,
    saveLayoutRuntimeOpportunityNativeEdits,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { resolveLayoutRuntimeEditableFieldFallback } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";

const WEB_ROOT = join(process.cwd());

describe("layoutBuilderRuntimeParity 5.18T", () => {
    it("opportunity PATCH allowlist still includes location_id", () => {
        const src = readFileSync(join(WEB_ROOT, "app/api/admin/opportunities/[id]/route.ts"), "utf8");
        const allowedStart = src.indexOf("const ALLOWED_KEYS = [");
        const allowedEnd = src.indexOf("] as const;", allowedStart);
        expect(src.slice(allowedStart, allowedEnd)).toContain('"location_id"');
    });

    it("buildLayoutRuntimeOpportunityNativePatch rejects location labels and emits UUID only", () => {
        expect(
            buildLayoutRuntimeOpportunityNativePatch(
                { "opportunity.location_id": "" },
                { "opportunity.location_id": "North Campus" },
            ),
        ).toEqual({});

        expect(
            buildLayoutRuntimeOpportunityNativePatch(
                { "opportunity.location_id": "" },
                { "opportunity.location_id": "11111111-1111-4111-8111-111111111111" },
            ),
        ).toEqual({ location_id: "11111111-1111-4111-8111-111111111111" });
    });

    it("saveLayoutRuntimeOpportunityNativeEdits fails when draft location is a label not UUID", async () => {
        const result = await saveLayoutRuntimeOpportunityNativeEdits({
            record: { id: "opp-1" },
            baseline: { "opportunity.location_id": "" },
            draft: { "opportunity.location_id": "North Campus" },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("valid school location");
        }
    });

    it("location select fallback uses stored UUID only, not display label", () => {
        const fallback = resolveLayoutRuntimeEditableFieldFallback(
            {
                "opportunity.location": "North Campus",
                _location_label: "North Campus",
            },
            "opportunity.location_id",
            "North Campus",
        );
        expect(fallback).toBe("");
    });

    it("route logs structured rejection reason for no_allowed_fields", () => {
        const src = readFileSync(join(WEB_ROOT, "app/api/admin/opportunities/[id]/route.ts"), "utf8");
        expect(src).toContain('logOpportunityPatchRejected("no_allowed_fields"');
        expect(src).toContain('logOpportunityPatchRejected("invalid_location_id_format"');
    });
});
