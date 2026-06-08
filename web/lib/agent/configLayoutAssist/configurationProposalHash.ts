import { createHash } from "crypto";

import { configurationProposalCanonicalString } from "./configurationProposalSerialize";
import type { ConfigurationProposalV1 } from "./configurationProposalV1";

/**
 * SHA-256 hex digest of canonical normalized proposal JSON (Card 6).
 */
export function hashConfigurationProposal(proposal: ConfigurationProposalV1): string {
    const canonical = configurationProposalCanonicalString(proposal);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
}
