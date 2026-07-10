/**
 * Consumer capability declarations — which provider kinds/shapes each surface supports.
 *
 * Consumers bind to the canonical provider library and declare supported capabilities.
 * Unsupported providers are excluded from pickers and blocked at publish validation.
 */

import type {
    CanonicalDataConsumerSurface,
    CanonicalDataProvider,
    CanonicalDataProviderKind,
    CanonicalDataShape,
} from "@/lib/fields/canonicalDataProviderModel";

export type ConsumerProviderCapability = {
    /** Provider kinds offered in the builder picker. */
    pickerKinds: ReadonlySet<CanonicalDataProviderKind>;
    /** Output shapes allowed in the picker. */
    pickerShapes: ReadonlySet<CanonicalDataShape>;
    /** Provider kinds allowed in published configuration. */
    publishKinds: ReadonlySet<CanonicalDataProviderKind>;
    /** Output shapes allowed in published configuration. */
    publishShapes: ReadonlySet<CanonicalDataShape>;
    /** Collection providers require an explicit consumer renderer. */
    collectionProjectionsAllowed: boolean;
    /** Relationship leaf scalars allowed (not the relationship object itself). */
    relationshipLeavesAllowed: boolean;
};

const SCALAR_FIELD_KINDS: CanonicalDataProviderKind[] = [
    "business_field",
    "platform_field",
    "calculated_field",
    "runtime_signal",
];

const QUEUE_ROW_CAPABILITY: ConsumerProviderCapability = {
    pickerKinds: new Set([
        ...SCALAR_FIELD_KINDS,
        "relationship",
        "collection",
    ]),
    pickerShapes: new Set(["scalar"]),
    publishKinds: new Set([
        ...SCALAR_FIELD_KINDS,
        "relationship",
        "collection",
    ]),
    publishShapes: new Set(["scalar"]),
    collectionProjectionsAllowed: true,
    relationshipLeavesAllowed: true,
};

const FOCUS_PANEL_CAPABILITY: ConsumerProviderCapability = {
    ...QUEUE_ROW_CAPABILITY,
};

const FORMS_CAPABILITY: ConsumerProviderCapability = {
    pickerKinds: new Set(["business_field", "platform_field"]),
    pickerShapes: new Set(["scalar"]),
    publishKinds: new Set(["business_field", "platform_field"]),
    publishShapes: new Set(["scalar"]),
    collectionProjectionsAllowed: false,
    relationshipLeavesAllowed: false,
};

const DRAWER_CAPABILITY: ConsumerProviderCapability = {
    pickerKinds: new Set([
        ...SCALAR_FIELD_KINDS,
        "relationship",
        "collection",
    ]),
    pickerShapes: new Set(["scalar", "object", "collection"]),
    publishKinds: new Set([
        ...SCALAR_FIELD_KINDS,
        "relationship",
        "collection",
    ]),
    publishShapes: new Set(["scalar", "object", "collection"]),
    collectionProjectionsAllowed: true,
    relationshipLeavesAllowed: true,
};

const DEFAULT_CAPABILITY: ConsumerProviderCapability = {
    pickerKinds: new Set(SCALAR_FIELD_KINDS),
    pickerShapes: new Set(["scalar"]),
    publishKinds: new Set(SCALAR_FIELD_KINDS),
    publishShapes: new Set(["scalar"]),
    collectionProjectionsAllowed: false,
    relationshipLeavesAllowed: false,
};

const CAPABILITIES: Record<CanonicalDataConsumerSurface, ConsumerProviderCapability> = {
    queue_row: QUEUE_ROW_CAPABILITY,
    focus_panel: FOCUS_PANEL_CAPABILITY,
    forms: FORMS_CAPABILITY,
    drawer: DRAWER_CAPABILITY,
    table: DEFAULT_CAPABILITY,
    business_process: DEFAULT_CAPABILITY,
    documents: FORMS_CAPABILITY,
};

export function consumerProviderCapability(consumer: CanonicalDataConsumerSurface): ConsumerProviderCapability {
    return CAPABILITIES[consumer] ?? DEFAULT_CAPABILITY;
}

function providerShapeForCapability(provider: CanonicalDataProvider): CanonicalDataShape {
    if (provider.kind === "collection" && provider.collectionProjection) {
        return "scalar";
    }
    if (provider.kind === "relationship" && provider.relationship) {
        return "scalar";
    }
    return provider.outputShape;
}

export function consumerSupportsProviderInPicker(
    consumer: CanonicalDataConsumerSurface,
    provider: CanonicalDataProvider,
): boolean {
    const cap = consumerProviderCapability(consumer);
    if (provider.legacyOnly) return false;
    if (!cap.pickerKinds.has(provider.kind)) return false;
    const shape = providerShapeForCapability(provider);
    if (!cap.pickerShapes.has(shape)) return false;
    if (provider.kind === "collection" && provider.collectionProjection && !cap.collectionProjectionsAllowed) {
        return false;
    }
    if (provider.kind === "relationship" && provider.relationship && !cap.relationshipLeavesAllowed) {
        return false;
    }
    if (provider.kind === "collection" && !provider.collectionProjection) {
        return false;
    }
    return true;
}

export function consumerSupportsProviderAtPublish(
    consumer: CanonicalDataConsumerSurface,
    provider: CanonicalDataProvider,
    isWaitlist: boolean,
): boolean {
    const cap = consumerProviderCapability(consumer);
    if (!cap.publishKinds.has(provider.kind)) return false;
    const shape = providerShapeForCapability(provider);
    if (!cap.publishShapes.has(shape)) return false;
    if (provider.kind === "collection" && provider.collectionProjection && !cap.collectionProjectionsAllowed) {
        return false;
    }
    if (provider.kind === "relationship" && provider.relationship && !cap.relationshipLeavesAllowed) {
        return false;
    }
    if (provider.kind === "collection" && !provider.collectionProjection) {
        return false;
    }
    return isWaitlist ? provider.availability.waitlist : provider.availability.pipeline;
}
