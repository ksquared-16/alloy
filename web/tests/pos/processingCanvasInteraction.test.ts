import { describe, expect, it } from "vitest";

import {
    applyEscapeToCanvas,
    buildSavedManualQuestion,
    enterDrawRegionMode,
    exitDrawRegionMode,
    initialCanvasState,
    regionVisualStyle,
    resolveRegionVisualKind,
    shouldAcceptDrawRect,
} from "@/lib/pos/processingCase/formDraft/processingCanvasInteraction";
import { pdfBboxToSvgRect, svgRectToPdfBbox } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import {
    deriveFieldSources,
    expandQuestionsForDraftSave,
    inferQuestionIntent,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { normalizeFieldValue } from "@/lib/pos/processingCase/formDraft/fieldNormalization";

describe("processingCanvasInteraction", () => {
    it("enters manual draw mode explicitly", () => {
        const next = enterDrawRegionMode({ kind: "new_field" });
        expect(next.mode).toBe("draw_region");
        expect(next.drawTarget).toEqual({ kind: "new_field" });
    });

    it("returns to select mode after draw completes", () => {
        const drawing = enterDrawRegionMode({ kind: "new_field" });
        const restored = exitDrawRegionMode(drawing);
        expect(restored).toEqual(initialCanvasState());
    });

    it("accepts valid rectangles and ignores tiny accidental drags", () => {
        expect(shouldAcceptDrawRect(12, 8)).toBe(true);
        expect(shouldAcceptDrawRect(2, 10)).toBe(false);
        expect(shouldAcceptDrawRect(10, 1)).toBe(false);
    });

    it("Escape exits draw mode first without clearing selection", () => {
        const drawing = enterDrawRegionMode({ kind: "new_field" });
        const result = applyEscapeToCanvas({ state: drawing, hasPendingManual: false });
        expect(result.state.mode).toBe("select");
        expect(result.clearSelection).toBe(false);
        expect(result.clearPendingManual).toBe(false);
    });

    it("Escape cancels unsaved manual region before clearing selection", () => {
        const result = applyEscapeToCanvas({
            state: initialCanvasState(),
            hasPendingManual: true,
        });
        expect(result.clearPendingManual).toBe(true);
        expect(result.clearSelection).toBe(true);
    });

    it("Escape clears selection in select mode", () => {
        const result = applyEscapeToCanvas({
            state: initialCanvasState(),
            hasPendingManual: false,
        });
        expect(result.clearSelection).toBe(true);
    });

    it("uses distinct visual treatment for auto, saved manual, and unsaved manual regions", () => {
        const auto = regionVisualStyle("auto_detected", false);
        const saved = regionVisualStyle("operator_saved", false);
        const unsaved = regionVisualStyle("operator_unsaved", false);
        const selected = regionVisualStyle("auto_detected", true);

        expect(auto.strokeDasharray).toBeUndefined();
        expect(saved.strokeDasharray).toBeDefined();
        expect(unsaved.strokeDasharray).toBeDefined();
        expect(selected.fillOpacity).toBeGreaterThan(auto.fillOpacity);
        expect(resolveRegionVisualKind(undefined, true)).toBe("operator_unsaved");
        expect(resolveRegionVisualKind("operator_created", false)).toBe("operator_saved");
    });
});

describe("manual region persistence", () => {
    const page = { originX: 0, topInPdf: 792, width: 612, height: 792, page: 1, hasPageDims: true, rects: [], texts: [] };

    it("round-trips drawn rectangles through PDF bbox projection", () => {
        const drawn = { x: 40, y: 60, w: 120, h: 24 };
        const bbox = svgRectToPdfBbox(drawn, page);
        const projected = pdfBboxToSvgRect(bbox, page);
        expect(projected.x).toBeCloseTo(drawn.x, 1);
        expect(projected.y).toBeCloseTo(drawn.y, 1);
        expect(projected.w).toBeCloseTo(drawn.w, 1);
        expect(projected.h).toBeCloseTo(drawn.h, 1);
    });

    it("saves manual question with operator-created provenance", () => {
        const pending = {
            page: 1,
            bbox: [40, 700, 160, 724] as [number, number, number, number],
            evidenceLabel: "Birthdate",
            displayLabel: "Child birthdate",
            type: "date",
            section: "Child",
            questionSubject: "child" as const,
            destinationFieldId: "child_date_of_birth",
        };
        const saved = buildSavedManualQuestion(pending, "manual_test");
        expect(saved.mappingOrigin).toBe("operator_created");
        expect(saved.evidence).toBe("manual_pdf_mapping");
        expect(saved.page).toBe(1);
        expect(saved.bbox).toEqual(pending.bbox);
    });

    it("maps saved manual Birthdate to canonical child date of birth", () => {
        const saved = buildSavedManualQuestion(
            {
                page: 1,
                bbox: [40, 700, 160, 724],
                evidenceLabel: "Birthdate",
                displayLabel: "Birthdate",
                type: "date",
                section: "Child",
                questionSubject: "child",
                destinationFieldId: "child_date_of_birth",
            },
            "manual_dob"
        );
        const intent = inferQuestionIntent(saved.evidenceLabel);
        expect(intent).toBe("date_of_birth");
        const fieldSource = deriveFieldSources({
            subject: "child",
            intent,
            displayLabel: saved.displayLabel,
            type: saved.type,
            destinationFieldId: saved.destinationFieldId,
        });
        expect(fieldSource?.field_key).toBe("child_date_of_birth");

        const expanded = expandQuestionsForDraftSave([saved]);
        expect(expanded).toHaveLength(1);
        expect(expanded[0]?.field_source?.field_key).toBe("child_date_of_birth");
        expect(expanded[0]?.page).toBe(1);
        expect(expanded[0]?.bbox).toBeDefined();
    });

    it("normalizes valid manual date values", () => {
        const result = normalizeFieldValue("7/1/22", "date");
        expect(result.status).toBe("valid");
        if (result.status === "valid") expect(result.canonicalValue).toBe("2022-07-01");
    });

    it("does not duplicate manual questions when save is invoked twice with same pending payload", () => {
        const pending = {
            page: 1,
            bbox: [10, 10, 20, 20] as [number, number, number, number],
            evidenceLabel: "Notes",
            displayLabel: "Notes",
            type: "text",
            section: "Form",
            questionSubject: "processing_only" as const,
        };
        const a = buildSavedManualQuestion(pending, "manual_a");
        const b = buildSavedManualQuestion(pending, "manual_b");
        expect(a.id).not.toBe(b.id);
        expect(a.mappingOrigin).toBe("operator_created");
    });
});

describe("generated form includes manual mapping", () => {
    it("preserves operator-created region provenance through draft expansion", () => {
        const manual = buildSavedManualQuestion(
            {
                page: 2,
                bbox: [100, 200, 220, 230],
                evidenceLabel: "Birthdate",
                displayLabel: "Birthdate",
                type: "date",
                section: "Child",
                questionSubject: "child",
                destinationFieldId: "child_date_of_birth",
                sampleValue: "7/1/22",
            },
            "manual_1"
        );
        const rows = expandQuestionsForDraftSave([
            {
                ...manual,
                field_source: deriveFieldSources({
                    subject: "child",
                    intent: inferQuestionIntent("Birthdate"),
                    displayLabel: "Birthdate",
                    type: "date",
                    destinationFieldId: "child_date_of_birth",
                }),
            },
        ]);
        expect(rows[0]).toMatchObject({
            label: "Birthdate",
            type: "date",
            page: 2,
        });
        expect(rows[0]?.field_source?.entity_type).toBe("child");
        expect(rows[0]?.bbox?.length).toBe(4);
        expect(rows[0]?.page).toBe(2);
    });
});
