import type { ConfigurationProposalV1 } from "./configurationProposalV1";
import type { ConfigLayoutAssistIntentV1 } from "./configLayoutAssistIntent";

export type ConfigLayoutAssistTraceV1 = {
    agent: "config_layout_assist";
    deterministic: true;
    intent: ConfigLayoutAssistIntentV1;
    rationale_steps: string[];
    command: string;
};

export type ConfigLayoutAssistProposeResponseV1 = {
    ok: true;
    proposal: ConfigurationProposalV1;
    trace: ConfigLayoutAssistTraceV1;
    persisted_proposal_id: string | null;
};

export type ConfigLayoutAssistCapabilitiesV1 = {
    can_generate: boolean;
    can_review: boolean;
    can_apply: boolean;
    permission_keys: string[];
};

export type ApplyVerificationResult = {
    success: boolean;
    verified_operations: string[];
    failed_operations: string[];
    warnings: string[];
};
