/** Forms-owned shapes for collection envelope parsing — not canonical proposals. */

import type { ProposalDiagnostic } from "@/lib/intake/proposals/types";

export type FormCollectionEnvelopeRow = {
    instance_key: string;
    origin: "existing" | "respondent_added";
    provider_ref: string;
    item_id: string | null;
    iteration_entity_type: string;
    values: Record<string, unknown>;
};

export type ExtractedFormCollectionEnvelope = {
    source: "meta_envelope" | "groups_fallback" | "none";
    byGroup: Record<string, FormCollectionEnvelopeRow[]>;
    diagnostics: ProposalDiagnostic[];
};
