/**
 * Client-safe apply types/constants — no server auth or Supabase imports.
 */

import type { ConfigurationOperationKindV1 } from "../configurationProposalV1";

export const CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS: readonly ConfigurationOperationKindV1[] = [
    "create_field",
    "update_field",
    "set_field_requirement",
    "set_field_interaction",
    "set_field_write_target",
    "expose_field_on_layout",
    "hide_field_on_layout",
    "move_field_to_section",
] as const;

export type ApplyOperationResult = {
    operation_id: string;
    kind: ConfigurationOperationKindV1;
    ok: boolean;
    verified: boolean;
    error?: string;
    verification_warning?: string;
    field_definition_id?: string;
};
