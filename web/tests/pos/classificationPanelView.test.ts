/**
 * POS-FP9 (Sprint 2.5) — classification panel view-model.
 *
 * Tests the pure presenter the ClassificationPanel renders (repo convention: test
 * presentation logic, not JSX). Proves classified/unknown/unsupported/awaiting render
 * states, that form/packet cases hide the panel (existing UI unchanged), and that the
 * view carries NO proposed values / extraction fields for a classified case.
 */

import { describe, it, expect } from "vitest";
import {
    resolveClassificationPanelView,
    confidenceTierFor,
} from "@/lib/pos/processingCase/classification/classificationPanelView";
import { classifyNonFormSource } from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import { toStoredClassification } from "@/lib/pos/processingCase/classification/processingCaseClassificationDb";
import type { StoredProcessingClassification } from "@/lib/pos/processingCase/classification/types";

function stored(fileName: string, sourceKind = "document"): StoredProcessingClassification {
    return toStoredClassification(
        classifyNonFormSource({ sourceKind, fileName }),
        new Date("2026-06-17T12:00:00.000Z")
    );
}

describe("resolveClassificationPanelView — render states", () => {
    it("classified: exposes label, key, confidence, status, signals, classified_at", () => {
        const view = resolveClassificationPanelView({
            classification: stored("2026_Subsidy_Contract.pdf"),
            primarySourceKind: "document",
        });
        expect(view.mode).toBe("classified");
        if (view.mode !== "classified") throw new Error("expected classified");
        expect(view.key).toBe("subsidy_contract");
        expect(view.label).toBe("Subsidy contract");
        expect(view.statusLabel).toBe("Classified");
        expect(view.confidencePct).toBeGreaterThan(0);
        expect(view.confidencePct).toBeLessThanOrEqual(95);
        expect(["high", "medium", "low"]).toContain(view.confidenceTier);
        expect(view.signals.length).toBeGreaterThan(0);
        expect(view.signals[0]).toHaveProperty("source");
        expect(view.signals[0]).toHaveProperty("value");
        expect(view.signals[0]).toHaveProperty("weightPct");
        expect(view.classifiedAt).toBe("2026-06-17T12:00:00.000Z");
        expect(view.classifierVersion).toMatch(/^fp9/);
    });

    it("unknown: renders safely with classified_at, no signals expected", () => {
        const view = resolveClassificationPanelView({
            classification: stored("IMG_5523.pdf"),
            primarySourceKind: "document",
        });
        expect(view.mode).toBe("unknown");
        if (view.mode !== "unknown") throw new Error("expected unknown");
        expect(view.classifiedAt).toBe("2026-06-17T12:00:00.000Z");
    });

    it("unsupported: renders safely", () => {
        const classification = toStoredClassification(
            classifyNonFormSource({ sourceKind: "form_submission", fileName: "subsidy.pdf" }),
            new Date("2026-06-17T12:00:00.000Z")
        );
        // (Stored unsupported is unusual but must render safely if present.)
        const view = resolveClassificationPanelView({ classification, primarySourceKind: "document" });
        expect(view.mode).toBe("unsupported");
    });

    it("awaiting: non-form case with no classification yet", () => {
        const view = resolveClassificationPanelView({ classification: null, primarySourceKind: "upload" });
        expect(view.mode).toBe("awaiting");
    });
});

describe("existing form/packet case UI is unaffected (panel hidden)", () => {
    it("hides for form_submission with no classification", () => {
        expect(resolveClassificationPanelView({ classification: null, primarySourceKind: "form_submission" }).mode).toBe(
            "hidden"
        );
    });
    it("hides for form_packet_session with no classification", () => {
        expect(
            resolveClassificationPanelView({ classification: null, primarySourceKind: "form_packet_session" }).mode
        ).toBe("hidden");
    });
    it("hides when there is no primary source kind", () => {
        expect(resolveClassificationPanelView({ classification: null, primarySourceKind: null }).mode).toBe("hidden");
    });
});

describe("no fake extraction / proposed changes in a classified view", () => {
    it("classified view carries only classification fields — no proposed/extracted/record keys", () => {
        const view = resolveClassificationPanelView({
            classification: stored("remittance_835.pdf"),
            primarySourceKind: "document",
        });
        const keys = Object.keys(view);
        for (const banned of ["proposedValues", "proposed", "extractedData", "extracted", "recordId", "recordType", "diff"]) {
            expect(keys).not.toContain(banned);
        }
    });
});

describe("confidenceTierFor", () => {
    it("tiers honestly by confidence", () => {
        expect(confidenceTierFor(0)).toBe("none");
        expect(confidenceTierFor(0.2)).toBe("low");
        expect(confidenceTierFor(0.35)).toBe("medium");
        expect(confidenceTierFor(0.6)).toBe("high");
        expect(confidenceTierFor(0.95)).toBe("high");
    });
});
