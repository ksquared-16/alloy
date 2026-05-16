import {
    CONFIGURATION_PROPOSAL_PERMISSION_KEYS,
    type ConfigurationOperationKindV1,
    type ConfigurationOperationV1,
    type ConfigurationProposalV1,
} from "./configurationProposalV1";

const PERMISSION_SET = new Set<string>(CONFIGURATION_PROPOSAL_PERMISSION_KEYS);

/** Default permission keys per operation kind (deterministic). */
export const CONFIGURATION_OPERATION_DEFAULT_PERMISSIONS: Record<ConfigurationOperationKindV1, readonly string[]> = {
    create_field: ["fields.manage"],
    update_field: ["fields.manage"],
    set_field_requirement: ["fields.manage", "fields.requirements.manage"],
    set_field_interaction: ["fields.manage", "fields.editability.manage"],
    set_field_write_target: ["fields.manage", "fields.editability.manage"],
    create_section: ["sections.manage"],
    update_section: ["sections.manage"],
    reorder_section: ["sections.manage", "layouts.manage"],
    archive_section: ["sections.manage"],
    expose_field_on_layout: ["layouts.manage", "fields.manage"],
    hide_field_on_layout: ["layouts.manage", "fields.manage"],
    move_field_to_section: ["sections.manage", "fields.manage"],
    update_option_set: ["option_sets.manage"],
    data_quality_recommendation: ["data_quality.view"],
};

export function isKnownConfigurationPermissionKey(key: string): boolean {
    return PERMISSION_SET.has(key.trim());
}

/** Stable sorted unique permission keys from operations + proposal-level requirements. */
export function resolveProposalPermissions(
    operations: ConfigurationOperationV1[],
    extra: string[] = []
): string[] {
    const keys = new Set<string>();
    for (const op of operations) {
        const defaults = CONFIGURATION_OPERATION_DEFAULT_PERMISSIONS[op.kind] ?? [];
        for (const p of defaults) keys.add(p);
        for (const p of op.required_permissions ?? []) {
            const t = String(p).trim();
            if (t) keys.add(t);
        }
    }
    for (const p of extra) {
        const t = String(p).trim();
        if (t) keys.add(t);
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
}

export function resolveOperationPermissions(kind: ConfigurationOperationKindV1, explicit: string[] = []): string[] {
    const keys = new Set<string>(CONFIGURATION_OPERATION_DEFAULT_PERMISSIONS[kind] ?? []);
    for (const p of explicit) {
        const t = String(p).trim();
        if (t) keys.add(t);
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
}

/** Fill missing `required_permissions` on each operation from defaults. */
export function ensureOperationPermissions(operations: ConfigurationOperationV1[]): ConfigurationOperationV1[] {
    return operations.map((op) => {
        const merged = resolveOperationPermissions(op.kind, op.required_permissions ?? []);
        return { ...op, required_permissions: merged };
    });
}

export function mergeProposalPermissionRequirements(proposal: ConfigurationProposalV1): ConfigurationProposalV1 {
    const merged = resolveProposalPermissions(proposal.proposed_operations, proposal.permission_requirements ?? []);
    return { ...proposal, permission_requirements: merged };
}
