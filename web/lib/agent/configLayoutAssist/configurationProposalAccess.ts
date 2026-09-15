/**
 * Permission gates for Configuration / Layout Assist (Card 7).
 */

import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import type { ConfigurationOperationKindV1, ConfigurationProposalPermissionKey } from "./configurationProposalV1";
import { CONFIGURATION_OPERATION_DEFAULT_PERMISSIONS } from "./configurationProposalPermissions";

export const CONFIG_ASSIST_PERMISSION_GENERATE = "config_assist.generate" as const;
export const CONFIG_ASSIST_PERMISSION_REVIEW = "config_assist.review" as const;
export const CONFIG_ASSIST_PERMISSION_APPLY = "config_assist.apply" as const;

const ALL_CONFIG_ASSIST_KEYS: readonly ConfigurationProposalPermissionKey[] = [
    CONFIG_ASSIST_PERMISSION_GENERATE,
    CONFIG_ASSIST_PERMISSION_REVIEW,
    CONFIG_ASSIST_PERMISSION_APPLY,
    "fields.manage",
    "fields.requirements.manage",
    "fields.editability.manage",
    "sections.manage",
    "layouts.manage",
    "option_sets.manage",
    "data_quality.view",
];

/*
 * THE GRANT IS THE ANSWER. THERE IS NO SECOND ONE.
 *
 * A role-title fallback used to stand here, DEFAULTING ON — unset meant
 * enabled, and `CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK` is set in tests and
 * in no deployed configuration, so it was live everywhere. Holding the
 * `admin` ROLE KEY satisfied `fields.manage`, `layouts.manage`,
 * `sections.manage`, `option_sets.manage`, `config_assist.generate` and
 * `config_assist.apply` whether or not the organization's package granted any
 * of them, and `ops` likewise satisfied the review-class keys.
 *
 * It was written for a real reason — "so org admins work before/without
 * permission seed migration" — and that reason has expired: the seed landed in
 * 20260523150000, and the deployed primary carries all three `config_assist.*`
 * keys active, granted to admin in 3 of 3 organizations. The fallback now only
 * hides whether the grants are right.
 *
 * Two defects came with it. It made the capability decorative, since an
 * organization could withhold `fields.manage` from its own admin role and
 * change nothing; and it made authorization depend on deployment configuration,
 * so the same principal could be admitted in one environment and refused in
 * another with identical grants.
 */
export function hasConfigLayoutAssistPermission(
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">,
    permissionKey: string
): boolean {
    const key = permissionKey.trim();
    return Boolean(key) && access.permissionKeys.includes(key);
}

export function assertConfigLayoutAssistPermission(
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">,
    permissionKey: string
): { ok: true } | { ok: false; message: string } {
    if (hasConfigLayoutAssistPermission(access, permissionKey)) {
        return { ok: true };
    }
    return {
        ok: false,
        message: `Missing required permission: ${permissionKey}`,
    };
}

export function assertPermissionsForOperationKinds(
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">,
    kinds: ConfigurationOperationKindV1[]
): { ok: true } | { ok: false; message: string } {
    const needed = new Set<string>();
    for (const kind of kinds) {
        for (const p of CONFIGURATION_OPERATION_DEFAULT_PERMISSIONS[kind] ?? []) {
            needed.add(p);
        }
    }
    for (const p of needed) {
        const r = assertConfigLayoutAssistPermission(access, p);
        if (!r.ok) return r;
    }
    return { ok: true };
}

export function listConfigAssistPermissionCatalog(): readonly string[] {
    return ALL_CONFIG_ASSIST_KEYS;
}
