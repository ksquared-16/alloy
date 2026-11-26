/**
 * Information Classification.
 *
 * Information is classified by MEANING — never by storage, field or document.
 * Every element carries exactly one primary Information Class, and the class
 * (not the field) determines the privacy policy applied downstream.
 *
 * @see docs/platform/trust/information-classification.md
 */

export const INFORMATION_CLASSES = [
    "identity",
    "relationship",
    "operational",
    "financial",
    "compliance",
    "communications",
    "behavior",
    "knowledge",
] as const;

export type InformationClass = (typeof INFORMATION_CLASSES)[number];

/** Owner of each class. Classification never changes ownership. */
export const INFORMATION_CLASS_OWNERS: Readonly<Record<InformationClass, string>> = {
    identity: "records_platform",
    relationship: "relationship_platform",
    operational: "owning_platform",
    financial: "owning_platform",
    compliance: "owning_platform",
    communications: "communications_platform",
    behavior: "operational_intelligence",
    knowledge: "knowledge_platform",
};

/** Transformation policy per class. Platform-owned; contracts reference, never implement. */
export const INFORMATION_CLASS_TRANSFORMATIONS: Readonly<Record<InformationClass, TransformationPolicy>> = {
    identity: "tokenize",
    relationship: "abstract",
    operational: "pass_through",
    financial: "aggregate",
    compliance: "pass_through",
    communications: "summarize",
    behavior: "aggregate",
    knowledge: "pass_through",
};

export type TransformationPolicy = "tokenize" | "abstract" | "pass_through" | "aggregate" | "summarize" | "withhold";

export type ClassifiedElement = {
    readonly key: string;
    readonly information_class: InformationClass;
    readonly transformation: TransformationPolicy;
    readonly value: unknown;
};

export type ClassificationResult = {
    readonly elements: readonly ClassifiedElement[];
    /** Classes present, for the package's privacy report. */
    readonly classes_present: readonly InformationClass[];
};

/**
 * Semantic classifier for the elements this slice's Decision Class declares.
 *
 * The map is explicit and per-element rather than pattern-matched on field
 * names: doctrine classifies by meaning, and a capability declaring an element
 * knows what that element means. An unmapped element is classified `identity`
 * — the conservative default, so a new element is minimized rather than leaked.
 */
export function classifyElements(
    elements: Readonly<Record<string, unknown>>,
    semanticMap: Readonly<Record<string, InformationClass>>,
): ClassificationResult {
    const out: ClassifiedElement[] = [];
    const present = new Set<InformationClass>();
    for (const [key, value] of Object.entries(elements)) {
        const cls = semanticMap[key] ?? "identity";
        present.add(cls);
        out.push({ key, information_class: cls, transformation: INFORMATION_CLASS_TRANSFORMATIONS[cls], value });
    }
    return { elements: out, classes_present: [...present].sort() };
}
