/**
 * Meaning of each governed identity element, by meaning rather than field name.
 *
 * Its own leaf module so the live capture path and the test-only dry run can
 * both use it without capture importing the dry run — which would make the dry
 * run production-reachable and defeat its dormancy proof.
 *
 * Every element is `operational`: a disposition, bounded categories, counts, a
 * band and Processing-authored sentences. **None is `identity`** — which is why
 * this class's privacy policy can prohibit that class outright. An
 * identity-class element arriving here means the adapter contract was bypassed,
 * and the transform refuses rather than minimizing.
 *
 * Keys are the FLATTENED child keys: the runtime flattens one level of declared
 * information before classifying it.
 */

import type { InformationClass } from "@/lib/trust/classification/informationClasses";

export const PROCESSING_IDENTITY_SEMANTIC_MAP: Readonly<Record<string, InformationClass>> = {
    subject_ref: "operational",
    subject_role: "operational",
    disposition: "operational",
    disposition_source: "operational",
    review_requirement: "operational",
    confidence_band: "operational",
    ambiguity_categories: "operational",
    conflict_categories: "operational",
    blocking_reason_codes: "operational",
    evidence: "operational",
    safe_explanations: "operational",
    adoption_id: "operational",
    input_facts_hash: "operational",
    material_projection_version: "operational",
    identity_resolver_version: "operational",
};
