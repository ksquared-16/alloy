/**
 * Lifecycle Builder — operator-facing configuration constants (Enrollment first).
 */

import type { LifecycleProcessKey } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

/** Composite / conditional rules — not selectable fields; hidden from palette. */
export const DEPRECATED_LIFECYCLE_FIELD_RULE_IDS: ReadonlySet<string> = new Set([
    "person:email_or_phone",
]);

export type LifecyclePrimaryEntityKey = "opportunity";

export type LifecyclePrimaryEntityOption = {
    key: LifecyclePrimaryEntityKey;
    label: string;
    description: string;
};

export const LIFECYCLE_PRIMARY_ENTITIES: readonly LifecyclePrimaryEntityOption[] = [
    {
        key: "opportunity",
        label: "Opportunity / Lead",
        description: "Primary record for the enrollment lifecycle.",
    },
] as const;

export type LifecycleStatusEntityKey = "opportunities" | "person" | "inquiry_child";

export type LifecycleStatusEntityOption = {
    key: LifecycleStatusEntityKey;
    label: string;
    enabled: boolean;
    disabledReason?: string;
};

export const LIFECYCLE_STATUS_ENTITY_OPTIONS: readonly LifecycleStatusEntityOption[] = [
    {
        key: "opportunities",
        label: "Opportunity / Lead",
        enabled: true,
    },
    {
        key: "person",
        label: "Person",
        enabled: false,
        disabledReason: "Person status mapping in Lifecycle is coming soon.",
    },
    {
        key: "inquiry_child",
        label: "Child",
        enabled: false,
        disabledReason: "Child status mapping in Lifecycle is coming soon.",
    },
] as const;

export function defaultPrimaryEntityForProcess(_processKey: LifecycleProcessKey): LifecyclePrimaryEntityKey {
    return "opportunity";
}

export function defaultStatusEntityForProcess(processKey: LifecycleProcessKey): LifecycleStatusEntityKey {
    if (processKey === ENROLLMENT_PROCESS_KEY) return "opportunities";
    return "opportunities";
}

export function sanitizeLifecycleFieldRuleIds(ruleIds: readonly string[]): string[] {
    const out: string[] = [];
    for (const id of ruleIds) {
        if (DEPRECATED_LIFECYCLE_FIELD_RULE_IDS.has(id)) continue;
        if (!out.includes(id)) out.push(id);
    }
    return out;
}

export function isDeprecatedLifecycleFieldRule(ruleId: string): boolean {
    return DEPRECATED_LIFECYCLE_FIELD_RULE_IDS.has(ruleId);
}

/** Related entities for requirements (not primary lifecycle record). */
export const LIFECYCLE_REQUIREMENT_ENTITY_KEYS: readonly LifecycleRequirementEntityKey[] = [
    "person",
    "child",
    "opportunity",
    "customer",
];
