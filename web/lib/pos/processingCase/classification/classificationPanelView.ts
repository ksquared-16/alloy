/**
 * POS-FP9 (Sprint 2.5) — pure view-model for the Processing Case classification panel.
 *
 * Presentation logic only — no JSX, no I/O — so it is unit-testable in the node test
 * env (the repo's convention: test presenters, not components). The component
 * `ClassificationPanel.tsx` renders whatever this resolver returns.
 *
 * It describes ONLY classification. It carries no proposed values, no extracted
 * fields, and no record changes — there is nothing here a classified-only case
 * could use to fake extraction or a proposal.
 */

import { isNonFormProcessingSourceKind } from "../maybeOpenProcessingCaseFromNonFormSourceSafe";
import type { ProcessingClassificationKey, StoredProcessingClassification } from "./types";

export type ConfidenceTier = "high" | "medium" | "low" | "none";

export interface ClassificationSignalView {
    source: string;
    value: string;
    weightPct: number;
}

export type ClassificationPanelView =
    /** Form/packet (or no) primary source with no classification — panel is not shown. */
    | { mode: "hidden" }
    /** Non-form primary source but no classification stored yet (legacy case or best-effort miss). */
    | { mode: "awaiting" }
    /** Classifier ran and matched a label. */
    | {
          mode: "classified";
          key: ProcessingClassificationKey;
          label: string;
          confidence: number;
          confidencePct: number;
          confidenceTier: ConfidenceTier;
          statusLabel: string;
          signals: ClassificationSignalView[];
          classifiedAt: string;
          classifierVersion: string;
      }
    /** Classifier ran but found no signal — honest "unknown". */
    | { mode: "unknown"; classifiedAt: string; classifierVersion: string }
    /** Source kind is not classified by this layer (e.g. a form behind a non-form case). */
    | { mode: "unsupported"; classifiedAt: string };

export function confidenceTierFor(confidence: number): ConfidenceTier {
    if (confidence <= 0) return "none";
    if (confidence >= 0.6) return "high";
    if (confidence >= 0.35) return "medium";
    return "low";
}

export interface ResolveClassificationPanelArgs {
    classification: StoredProcessingClassification | null;
    /** The primary source kind of the case (document/upload/import/... or form_submission/...). */
    primarySourceKind: string | null;
}

export function resolveClassificationPanelView(args: ResolveClassificationPanelArgs): ClassificationPanelView {
    const { classification, primarySourceKind } = args;
    const isNonForm = primarySourceKind != null && isNonFormProcessingSourceKind(primarySourceKind);

    if (!classification) {
        // Only non-form cases are expected to carry a classification; for forms/packets the
        // panel stays hidden so their existing UI is unchanged.
        return isNonForm ? { mode: "awaiting" } : { mode: "hidden" };
    }

    if (classification.status === "unsupported") {
        return { mode: "unsupported", classifiedAt: classification.classified_at };
    }

    if (classification.status === "unknown") {
        return {
            mode: "unknown",
            classifiedAt: classification.classified_at,
            classifierVersion: classification.classifier_version,
        };
    }

    // status === "classified"
    return {
        mode: "classified",
        key: classification.classification_key,
        label: classification.label,
        confidence: classification.confidence,
        confidencePct: Math.round(classification.confidence * 100),
        confidenceTier: confidenceTierFor(classification.confidence),
        statusLabel: "Classified",
        signals: classification.signals.map((s) => ({
            source: s.source,
            value: s.value,
            weightPct: Math.round(s.weight * 100),
        })),
        classifiedAt: classification.classified_at,
        classifierVersion: classification.classifier_version,
    };
}
