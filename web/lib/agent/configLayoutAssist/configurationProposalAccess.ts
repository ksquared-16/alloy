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

/** Default true so org admins work before/without permission seed migration; set env to false to require grants. */
function legacyRoleFallbackEnabled(): boolean {
    const v = process.env.CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK?.trim().toLowerCase();
    if (v === "false" || v === "0" || v === "no") return false;
    if (v === "true" || v === "1" || v === "yes") return true;
    return true;
}

export function hasConfigLayoutAssistPermission(
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">,
    permissionKey: string
): boolean {
    const key = permissionKey.trim();
    if (key && access.permissionKeys.includes(key)) {
        return true;
    }
    if (!legacyRoleFallbackEnabled()) {
        return false;
    }
    if (
        key === CONFIG_ASSIST_PERMISSION_GENERATE ||
        key === CONFIG_ASSIST_PERMISSION_APPLY ||
        key.startsWith("fields.") ||
        key === "sections.manage" ||
        key === "layouts.manage" ||
        key === "option_sets.manage"
    ) {
        return access.roleKeys.includes("admin");
    }
    if (key === CONFIG_ASSIST_PERMISSION_REVIEW || key === "data_quality.view") {
        return (
            access.roleKeys.includes("admin") ||
            access.roleKeys.includes("ops")
        );
    }
    return false;
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
