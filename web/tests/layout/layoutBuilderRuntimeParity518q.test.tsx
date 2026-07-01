/**
 * Sprint 5.18Q — final drawer parity regression fixes.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { patchLayoutEditorFieldDisplay } from "@/lib/layout/layoutEditorCompositionModel";
import { renameSectionTitle } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { buildOpportunityChildLifecycleSummary } from "@/lib/opportunities/buildOpportunityChildLifecycleSummary";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { resolveLeadDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import { applyLayoutRuntimeDraftToRecord } from "@/lib/layout/runtime/applyLayoutRuntimeDraftToRecord";

describe("layoutBuilderRuntimeParity 5.18Q", () => {
    it("renameSectionTitle preserves spaces, ampersands, and allows clearing while typing", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const sectionKey = doc.sections[0]!.key;

        const spaced = renameSectionTitle(doc, sectionKey, "Enrollment Status");
        expect(spaced.sections.find((s) => s.key === sectionKey)?.title).toBe("Enrollment Status");

        const ampersand = renameSectionTitle(spaced, sectionKey, "Household & Guardian Info");
        expect(ampersand.sections.find((s) => s.key === sectionKey)?.title).toBe("Household & Guardian Info");

        const cleared = renameSectionTitle(ampersand, sectionKey, "");
        expect(cleared.sections.find((s) => s.key === sectionKey)?.title).toBe("");
    });

    it("patchLayoutEditorFieldDisplay stores raw labels without trimming each keystroke", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections[0]!;
        const field = section.rows.flatMap((r) => r.columns.flatMap((c) => c.items)).find(Boolean);
        expect(field).toBeTruthy();

        const next = patchLayoutEditorFieldDisplay(
            doc,
            { kind: "field", sectionKey: section.key, itemId: field!.id },
            {},
            "Primary Contact Details",
        );
        const patched = next.sections
            .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.items)))
            .find((i) => i.id === field!.id);
        expect(patched?.label).toBe("Primary Contact Details");
    });

    it("formats opportunity header phone numbers for display", () => {
        const meta = resolveLeadDrawerCommandHeaderMeta(
            { "person.primary_phone": "1231231255" },
            { title: "Rivera Family" },
        );
        expect(meta.metaRow).toContain("(123) 123-1255");
    });

    it("maps raw child lifecycle status keys to operator labels", () => {
        const summary = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: "new_inquiry", outcome_status_label: "new_inquiry" }],
        });
        expect(summary.display_summary).toBe("Family status: New lead");
    });

    it("activity preview resolves lifecycle status keys instead of raw tokens", () => {
        const entries = resolveLeadActivityPreview({
            _child_lifecycle_summary: {
                display_summary: "Family status: new_inquiry",
            },
        });
        const lifecycle = entries.find((entry) => entry.label === "Lifecycle");
        expect(lifecycle?.detail).toBe("Family status: New Lead");
    });

    it("optimistic opportunity location draft persists label companions", () => {
        const record = {
            id: "opp-1",
            "opportunity.location_id": "",
            "opportunity.location": "",
        };
        const baseline = {
            "opportunity.location_id": "",
            "opportunity.location": "",
        };
        const draft = {
            "opportunity.location_id": "11111111-1111-4111-8111-111111111111",
            "opportunity.location": "North Campus",
        };
        const next = applyLayoutRuntimeDraftToRecord({
            record,
            baseline,
            draft,
            rowKeys: [],
            rows: [],
        });
        expect(next["opportunity.location_id"]).toBe("11111111-1111-4111-8111-111111111111");
        expect(next["opportunity.location"]).toBe("North Campus");
    });
});
