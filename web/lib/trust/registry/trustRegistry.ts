/**
 * The Trust Registry composition ROOT.
 *
 * This is the only module in the platform that knows which contributions exist,
 * and the only place composition happens. Everything else resolves through
 * {@link TRUST_REGISTRY}.
 *
 * Two properties this file exists to hold:
 *
 *  1. **Order is declared, not emergent.** The manifest below is an ordered
 *     array. A contribution's position in it is its registration order, and
 *     nothing about which module imported which can change that.
 *  2. **Composition happens once.** The registry is composed at module load and
 *     frozen. There is no registration API after startup, so nothing can add,
 *     replace or remove an entry at runtime.
 *
 * Platform contributions are declared first so a capability can only ever
 * reference platform infrastructure that already exists — a reference to
 * something unregistered fails composition either way, but ordering the
 * manifest this way makes the dependency direction legible.
 *
 * A composition failure throws here, at import. That is intended: a duplicate
 * key or a dangling reference is a programming defect that must stop the
 * process, not an operational condition that becomes a refusal.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.2
 */

import { ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/contribution";
import { PROCESSING_SOURCE_CLASSIFICATION_CONTRIBUTION } from "@/lib/trust/capabilities/processingSourceClassification/contribution";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/contribution";
import { PLATFORM_PRIVACY_POLICY_CONTRIBUTION } from "@/lib/trust/platform/platformPrivacyPolicies";
import { composeTrustRegistry } from "@/lib/trust/registry/composeTrustRegistry";
import type { TrustContribution, TrustRegistry } from "@/lib/trust/registry/trustRegistryTypes";

/**
 * The manifest. Ordered, explicit, and the single place a new contribution is
 * added when a capability's ownership has been proven.
 */
export const TRUST_CONTRIBUTION_MANIFEST: readonly TrustContribution[] = Object.freeze([
    // ---- platform ----------------------------------------------------------
    PLATFORM_PRIVACY_POLICY_CONTRIBUTION,
    // ---- capabilities ------------------------------------------------------
    ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION,
    PROCESSING_SOURCE_CLASSIFICATION_CONTRIBUTION,
    // Trust adoption Phase 1.4 — registered but DORMANT: no production caller.
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION,
]);

/** The composed, frozen registry. Composed exactly once, at module load. */
export const TRUST_REGISTRY: TrustRegistry = composeTrustRegistry(TRUST_CONTRIBUTION_MANIFEST);
