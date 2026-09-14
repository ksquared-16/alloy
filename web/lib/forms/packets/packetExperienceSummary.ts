/**
 * What a packet ASKS OF A FAMILY, in the words an administrator uses.
 *
 * Packet Studio kept describing its own implementation — "Included forms", "3 forms · the order a
 * family meets them" — for a packet that contains one Form, one document to read and one document
 * to send in. An administrator reading that screen could not answer the only questions they have:
 * what does a family actually do, which of it does Alloy already know, and where would I change it?
 *
 * So this module derives those answers from the configuration that already exists. It invents no
 * settings: every number and every sentence below is READ from a Form's schema or a step's stored
 * config, and a behaviour the platform owns is described rather than offered as a toggle a runtime
 * would ignore.
 *
 * Pure on purpose — the route gathers, this decides, and the failure modes can be proven in a test
 * without a database.
 */

import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { CLASSIFICATION_KEY_LABELS } from "@/lib/pos/processingCase/classification/operatorCorrection";

/** What a Form asks, counted the way an administrator counts it. */
export type FormQuestionSummary = {
    /** Questions a family is actually asked. */
    questions: number;
    /** Of those, the ones whose answer is written to an Alloy record. */
    connectedToAlloy: number;
    /** Of those, the ones whose answer stays with this form only. */
    formOnly: number;
    /** Of those, the ones a family must answer to finish. */
    required: number;
    /** Destinations Alloy fills from what it already knows — never asked, so never counted above. */
    alloyFills: number;
};

/**
 * Count what a Form asks.
 *
 * A `derived` field is deliberately NOT a question: Alloy fills it from canonical truth and the
 * family never sees it, so counting it would overstate what is being asked of them. A field with a
 * `field_source` is one whose answer lands on an Alloy record; without one it stays with the form.
 */
export function summarizeFormQuestions(schema: FormSchemaV1 | null | undefined): FormQuestionSummary {
    const summary: FormQuestionSummary = { questions: 0, connectedToAlloy: 0, formOnly: 0, required: 0, alloyFills: 0 };
    if (!schema) return summary;

    walkScalarFormFields(schema, (field) => {
        // Presentation-only nodes are not questions either.
        if (field.type === "text_block") return;
        if (field.derived) {
            summary.alloyFills += 1;
            return;
        }
        summary.questions += 1;
        if (field.field_source?.field_key) summary.connectedToAlloy += 1;
        else summary.formOnly += 1;
        if (field.required) summary.required += 1;
    });

    return summary;
}

/** One obligation, as a card. */
export type StepExperienceFacts = {
    sequence: number;
    /** The name an administrator gave this obligation. */
    title: string;
    /** What the family does — the step vocabulary, not the machinery that runs it. */
    obligation: string;
    kind: "form" | "document_upload" | "document_acknowledgment";
    /** One sentence describing what actually happens, derived from the configuration. */
    behavior: string;
    /** Short "n questions · n connected to Alloy"-style facts for the card. */
    facts: string[];
    /** Only meaningful for a read-and-acknowledge step. */
    requiresSignature?: boolean;
    /** Blocks readiness when false. */
    ready: boolean;
    readyDetail: string;
};

export type FormStepInput = {
    kind: "form";
    sequence: number;
    title: string;
    questions: FormQuestionSummary;
    published: boolean;
    /** Whether the Form has a recognizable source document behind it. */
    hasSourceDocument: boolean;
};

export type UploadStepInput = {
    kind: "document_upload";
    sequence: number;
    title: string;
    documentTypeKey: string | null;
    instructions?: string | null;
};

export type AcknowledgmentStepInput = {
    kind: "document_acknowledgment";
    sequence: number;
    title: string;
    documentTitle: string | null;
    pageCount: number | null;
    requiresSignature: boolean;
};

export type StepInput = FormStepInput | UploadStepInput | AcknowledgmentStepInput;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The classification label an operator already sees elsewhere, never the raw key. */
export function documentClassificationLabel(key: string | null | undefined): string | null {
    if (!key) return null;
    return (CLASSIFICATION_KEY_LABELS as Record<string, string>)[key] ?? key.replace(/_/g, " ");
}

export function describeStep(step: StepInput): StepExperienceFacts {
    if (step.kind === "form") {
        const q = step.questions;
        const facts = [`${plural(q.questions, "question")}`];
        if (q.connectedToAlloy > 0) facts.push(`${q.connectedToAlloy} connected to Alloy`);
        if (q.formOnly > 0) facts.push(`${q.formOnly} stored with the form only`);
        facts.push(`${q.required} required`);

        /*
         * Only claim reuse when something is actually connected. A form with no Alloy-bound question
         * is one Alloy cannot pre-fill, and saying otherwise would describe a runtime that is not
         * running.
         */
        const behavior =
            q.connectedToAlloy > 0
                ? "Alloy confirms information it already knows and asks the family for what is missing. Families can correct existing information before they finish."
                : "Alloy asks the family for all of this. None of it is information Alloy already holds.";

        return {
            sequence: step.sequence,
            title: step.title,
            obligation: "Collect information",
            kind: "form",
            behavior,
            facts,
            ready: step.published,
            readyDetail: step.published ? `${step.title} published` : `${step.title} has no published version`,
        };
    }

    if (step.kind === "document_acknowledgment") {
        const facts: string[] = [];
        if (step.documentTitle) facts.push(step.documentTitle);
        if (step.pageCount && step.pageCount > 0) facts.push(plural(step.pageCount, "page"));
        facts.push("Acknowledgment required");
        facts.push(step.requiresSignature ? "Signature required" : "No signature required");

        return {
            sequence: step.sequence,
            title: step.title,
            obligation: "Read & acknowledge",
            kind: "document_acknowledgment",
            requiresSignature: step.requiresSignature,
            behavior: step.requiresSignature
                ? "The family is shown the actual document, and finishes by agreeing to it and signing. Completion is recorded as the acknowledgment plus the signature."
                : "The family is shown the actual document and finishes by agreeing to it. Completion is recorded as the acknowledgment.",
            facts,
            ready: Boolean(step.documentTitle),
            readyDetail: step.documentTitle ? `${step.documentTitle} available` : "No document chosen for the family to read",
        };
    }

    const label = documentClassificationLabel(step.documentTypeKey);
    const facts = ["Family sends in a document", label ? `Filed as ${label}` : "No filing type chosen"];

    return {
        sequence: step.sequence,
        title: step.title,
        obligation: "Upload a document",
        kind: "document_upload",
        /*
         * Said plainly because the opposite was the fear: a family is NOT asked to retype the
         * contents of the document they send in. Reading values out of it is a later, separate
         * decision owned by Health & Safety, and claiming it here would be a lie about V0.5.
         */
        behavior: label
            ? `The family sends in their existing ${label.toLowerCase()}. They are not asked to type its contents — Alloy files the document itself, and they can view or replace it before they finish.`
            : "The family sends in an existing document. They are not asked to type its contents.",
        facts,
        ready: Boolean(label),
        readyDetail: label ? `${label} identified` : "No document type identified for this upload",
    };
}

/**
 * The bridge between a packet's configuration and the experience it produces.
 *
 * An administrator configures obligations; Alloy decides the guided conversation from them. Nobody
 * writes a prompt, so the only honest way to show what a family will meet is to describe the
 * obligations in order.
 */
export function familyExperienceLines(steps: readonly StepExperienceFacts[]): string[] {
    return steps.map((s) => {
        if (s.kind === "form") {
            return s.facts.some((f) => /connected to Alloy/.test(f))
                ? `Alloy collects ${s.title.toLowerCase()}, reusing information it already knows where it can.`
                : `Alloy collects ${s.title.toLowerCase()}.`;
        }
        if (s.kind === "document_acknowledgment") {
            return `The family reads and acknowledges ${s.title.toLowerCase()}${s.requiresSignature ? ", and signs it" : ""}.`;
        }
        return `The family uploads ${s.title.toLowerCase()}.`;
    });
}

/** Readiness, assembled from the same facts the cards show — not a second validation engine. */
export function packetReadinessRows(steps: readonly StepExperienceFacts[]): { ok: boolean; label: string }[] {
    return steps.map((s) => ({ ok: s.ready, label: s.readyDetail }));
}

export function packetIsReady(steps: readonly StepExperienceFacts[]): boolean {
    return steps.length > 0 && steps.every((s) => s.ready);
}
