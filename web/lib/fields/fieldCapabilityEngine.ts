/**
 * Field capability engine — derived surface availability.
 *
 * Availability = Registry exists → Resolver exists → Renderer exists →
 *                Builder supports → Publish supported → Available
 *
 * No manual badge lists. Badges derive from resolver registry + publish gates.
 *
 * @see docs/sprints/07_2026/field-runtime-unification.md
 */

import {
    canSurfaceResolveField,
    type FieldResolverInput,
    type SurfaceResolverResult,
    resolverInputFromComputedField,
} from "@/lib/fields/fieldResolverRegistry";
import type {
    FieldConsumerSurface,
    FieldRegistryAvailabilityInput,
    FieldSurfaceAvailabilityRow,
    FieldSurfaceAvailabilityStatus,
} from "@/lib/fields/fieldSurfaceAvailability";
import { FIELD_CONSUMER_SURFACE_LABELS } from "@/lib/fields/fieldSurfaceAvailability";
import { isValidatorAllowedQueueRecordFieldRefKey } from "@/lib/layout/queueRecordValidatorAllowList";
import { isChildcareOperatorPickerVisible } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { FORM_PICKER_ENTITY_TYPES } from "@/lib/fields/formFieldRegistryPicker";
import type { PlatformFieldDefinition } from "@/lib/fields/platformFieldCatalog";
import type { ComputedFieldDefinition } from "@/lib/fields/computedFieldCatalog";
import {
    availabilityContextForSurface,
    type FieldAvailabilityContext,
} from "@/lib/fields/fieldAvailabilityContext";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

export type CapabilityLayer =
    | "registry"
    | "resolver"
    | "renderer"
    | "builder"
    | "publish";

export type CapabilityCheckResult = {
    layer: CapabilityLayer;
    passed: boolean;
    reason: string;
};

export type DerivedFieldCapability = {
    surface: FieldConsumerSurface;
    status: FieldSurfaceAvailabilityStatus;
    reason: string;
    resolver: SurfaceResolverResult;
    layers: CapabilityCheckResult[];
};

const SURFACE_ORDER: FieldConsumerSurface[] = [
    "drawer",
    "forms",
    "table",
    "queue_row",
    "focus_panel",
    "business_process",
    "documents",
];

function resolverInputFromRegistry(input: FieldRegistryAvailabilityInput): FieldResolverInput {
    return {
        entity_type: input.entity_type,
        field_key: input.field_key,
        field_type: input.field_type,
        label: input.label,
        is_system: input.is_system,
        is_active: input.is_active,
        is_visible_in_form: input.is_visible_in_form,
        is_visible_in_drawer: input.is_visible_in_drawer,
        is_visible_in_table: input.is_visible_in_table,
        config: input.config,
        is_platform_native: false,
    };
}

function resolverInputFromPlatform(row: PlatformFieldDefinition): FieldResolverInput {
    return {
        entity_type: row.entity_type,
        field_key: row.field_key,
        refKey: row.refKey,
        field_type: row.field_type,
        label: row.label,
        is_system: true,
        is_active: true,
        is_visible_in_form: row.ownership !== "computed",
        is_visible_in_drawer: true,
        is_visible_in_table: row.field_key === "status_key" || row.field_key === "created_at",
        is_platform_native: row.ownership !== "computed",
        is_computed: row.ownership === "computed",
    };
}

function resolverInputFromComputed(row: ComputedFieldDefinition): FieldResolverInput {
    return resolverInputFromComputedField(row);
}

function registryLayer(input: FieldResolverInput): CapabilityCheckResult {
    if (input.is_computed) {
        return { layer: "registry", passed: true, reason: "Computed field catalog entry" };
    }
    if (input.is_platform_native) {
        return { layer: "registry", passed: true, reason: "Platform-owned native column" };
    }
    if (input.is_active === false) {
        return { layer: "registry", passed: false, reason: "Inactive in field_definitions registry" };
    }
    return { layer: "registry", passed: true, reason: "field_definitions registry row" };
}

function builderLayer(surface: FieldConsumerSurface, input: FieldResolverInput, resolver: SurfaceResolverResult): CapabilityCheckResult {
    if (!resolver.supported) {
        return { layer: "builder", passed: false, reason: "Resolver unsupported — builder cannot expose" };
    }
    switch (surface) {
        case "queue_row":
        case "focus_panel":
            return { layer: "builder", passed: true, reason: "Composition builder reads resolver-backed catalog" };
        case "forms": {
            if (input.is_computed) {
                return {
                    layer: "builder",
                    passed: false,
                    reason: "Not available in Forms because this value is calculated at runtime.",
                };
            }
            const et = input.entity_type.trim().toLowerCase();
            const inPicker = new Set<string>([...FORM_PICKER_ENTITY_TYPES, "customer_member"]).has(et);
            return {
                layer: "builder",
                passed: inPicker && (input.is_platform_native || isChildcareOperatorPickerVisible(et, input.field_key, input)),
                reason: inPicker ? "Forms builder library" : "Entity not in Forms builder grain",
            };
        }
        case "drawer":
            return { layer: "builder", passed: true, reason: "Layout field-catalog builder" };
        case "table":
            return { layer: "builder", passed: true, reason: "Table column builder uses registry visibility" };
        case "business_process":
            return { layer: "builder", passed: resolver.supported, reason: "Lifecycle stage requirements picker" };
        case "documents":
            return { layer: "builder", passed: resolver.supported, reason: "Documents use Forms builder seam" };
        default:
            return { layer: "builder", passed: false, reason: "Unknown builder surface" };
    }
}

function publishLayer(surface: FieldConsumerSurface, refKey: string, resolver: SurfaceResolverResult): CapabilityCheckResult {
    if (!resolver.supported) {
        return { layer: "publish", passed: false, reason: "Resolver unsupported — publish blocked" };
    }
    if (surface === "queue_row") {
        const pipeline = isValidatorAllowedQueueRecordFieldRefKey(refKey, false);
        const waitlist = isValidatorAllowedQueueRecordFieldRefKey(refKey, true);
        if (!pipeline && !waitlist) {
            return { layer: "publish", passed: false, reason: "Not on queue publish validator allow-list" };
        }
        return { layer: "publish", passed: true, reason: "Queue row publish validator" };
    }
    if (surface === "focus_panel") {
        return { layer: "publish", passed: true, reason: "Focus panel composition publish" };
    }
    return { layer: "publish", passed: true, reason: "Surface publish gate satisfied" };
}

function rendererLayer(surface: FieldConsumerSurface, resolver: SurfaceResolverResult): CapabilityCheckResult {
    if (!resolver.supported) {
        return { layer: "renderer", passed: false, reason: "No runtime renderer without resolver" };
    }
    const renderers: Record<FieldConsumerSurface, string> = {
        drawer: "LayoutRuntimeFieldInput / drawer layout runtime",
        forms: "Form field schema renderer",
        table: "Admin table column renderer",
        queue_row: "QueueRecordFieldRenderer",
        focus_panel: "Focus panel card composition",
        business_process: "Lifecycle requirement evaluator",
        documents: "Document field mapping renderer",
    };
    return { layer: "renderer", passed: true, reason: renderers[surface] };
}

function refKeyForInput(input: FieldResolverInput): string {
    if (input.refKey?.trim()) return input.refKey.trim();
    const et = input.entity_type.trim().toLowerCase();
    const fk = input.field_key.trim();
    if (et === "customer_member") return `child.${fk === "dob" ? "date_of_birth" : fk}`;
    return `${et}.${fk}`;
}

/** Derive full capability for one field on one surface. */
export function deriveFieldCapability(
    surface: FieldConsumerSurface,
    input: FieldResolverInput,
    options?: { hub_entity?: SettingsHubEntityKey; availability_context?: FieldAvailabilityContext },
): DerivedFieldCapability {
    const context =
        options?.availability_context ??
        (options?.hub_entity ? availabilityContextForSurface(options.hub_entity, surface) : undefined);
    const resolverInput: FieldResolverInput = {
        ...input,
        availability_context:
            surface === "focus_panel" || surface === "business_process" ? context : input.availability_context,
    };
    const refKey = refKeyForInput(resolverInput);
    const resolver = canSurfaceResolveField(surface, resolverInput);
    const registry = registryLayer(resolverInput);
    const resolverLayer: CapabilityCheckResult = {
        layer: "resolver",
        passed: resolver.supported,
        reason: resolver.reason,
    };
    const renderer = rendererLayer(surface, resolver);
    const builder = builderLayer(surface, resolverInput, resolver);
    const publish = publishLayer(surface, refKey, resolver);
    const layers = [registry, resolverLayer, renderer, builder, publish];
    const available = layers.every((l) => l.passed);
    const firstFailure = layers.find((l) => !l.passed);
    return {
        surface,
        status: available ? "available" : "unavailable",
        reason: available ? resolver.reason : (firstFailure?.reason ?? "Unavailable"),
        resolver,
        layers,
    };
}

/** Derive availability rows for a registry field_definitions row. */
export function deriveRegistryFieldAvailability(
    input: FieldRegistryAvailabilityInput,
    options?: { hub_entity?: SettingsHubEntityKey },
): FieldSurfaceAvailabilityRow[] {
    const resolverInput = resolverInputFromRegistry(input);
    return SURFACE_ORDER.map((surface) => {
        const cap = deriveFieldCapability(surface, resolverInput, options);
        return {
            surface,
            status: cap.status,
            reason: cap.reason,
        };
    });
}

/** Derive availability rows for a computed catalog field. */
export function deriveComputedFieldAvailability(
    row: ComputedFieldDefinition,
    options?: { hub_entity?: SettingsHubEntityKey },
): FieldSurfaceAvailabilityRow[] {
    const resolverInput = resolverInputFromComputed(row);
    return SURFACE_ORDER.map((surface) => {
        const cap = deriveFieldCapability(surface, resolverInput, options);
        return {
            surface,
            status: cap.status,
            reason: cap.reason,
        };
    });
}

/** Derive availability rows for a platform native field. */
export function derivePlatformFieldAvailability(
    row: PlatformFieldDefinition,
    options?: { hub_entity?: SettingsHubEntityKey },
): FieldSurfaceAvailabilityRow[] {
    const resolverInput = resolverInputFromPlatform(row);
    return SURFACE_ORDER.map((surface) => {
        const cap = deriveFieldCapability(surface, resolverInput, options);
        return {
            surface,
            status: cap.status,
            reason: cap.reason,
        };
    });
}

export { FIELD_CONSUMER_SURFACE_LABELS };
