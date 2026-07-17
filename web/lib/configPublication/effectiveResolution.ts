import type {
    ConfigurationFieldDefinition,
    EffectiveConfigurationField,
} from "@/lib/configPublication/types";

export type EffectiveResolutionInput = {
    organizationValues: Readonly<Record<string, unknown>>;
    locationOverrides?: Readonly<Record<string, unknown>>;
    locationValues?: Readonly<Record<string, unknown>>;
    runtimeValues?: Readonly<Record<string, unknown>>;
};

function hasOwn(source: Readonly<Record<string, unknown>> | undefined, key: string): boolean {
    return source != null && Object.prototype.hasOwnProperty.call(source, key);
}

/**
 * Server-authoritative field resolution.
 *
 * Explicit presence is used throughout so false, zero, null, and an empty
 * string remain authored values. Unknown override keys and disallowed
 * overrides are rejected rather than silently ignored.
 */
export function resolveEffectiveConfiguration(
    fields: readonly ConfigurationFieldDefinition[],
    input: EffectiveResolutionInput,
): EffectiveConfigurationField[] {
    const definitions = new Map(fields.map((field) => [field.key, field]));
    for (const key of Object.keys(input.locationOverrides ?? {})) {
        const definition = definitions.get(key);
        if (!definition) throw new Error(`Unknown configuration override: ${key}`);
        if (definition.policy !== "location_may_override") {
            throw new Error(`Location override is not allowed for ${key}`);
        }
    }

    return fields.map((field): EffectiveConfigurationField => {
        const required = field.policy === "location_must_supply";

        if (field.policy === "runtime_derived") {
            const present = hasOwn(input.runtimeValues, field.key);
            return {
                key: field.key,
                policy: field.policy,
                value: present ? input.runtimeValues?.[field.key] : undefined,
                source: present ? "runtime_derived" : "missing",
                required: false,
                missing: !present,
            };
        }

        if (field.policy === "location_must_supply") {
            const present = hasOwn(input.locationValues, field.key);
            return {
                key: field.key,
                policy: field.policy,
                value: present ? input.locationValues?.[field.key] : undefined,
                source: present ? "location" : "missing",
                required,
                missing: !present,
            };
        }

        if (field.policy === "location_may_override" && hasOwn(input.locationOverrides, field.key)) {
            return {
                key: field.key,
                policy: field.policy,
                value: input.locationOverrides?.[field.key],
                source: "location_override",
                required: false,
                missing: false,
            };
        }

        if (hasOwn(input.organizationValues, field.key)) {
            return {
                key: field.key,
                policy: field.policy,
                value: input.organizationValues[field.key],
                source: "organization",
                required: false,
                missing: false,
            };
        }

        if (Object.prototype.hasOwnProperty.call(field, "platformDefault")) {
            return {
                key: field.key,
                policy: field.policy,
                value: field.platformDefault,
                source: "platform_default",
                required: false,
                missing: false,
            };
        }

        return {
            key: field.key,
            policy: field.policy,
            value: undefined,
            source: "missing",
            required: false,
            missing: true,
        };
    });
}
