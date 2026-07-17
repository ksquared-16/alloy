/**
 * The Operational Calculations Registry — the single canonical catalog of every
 * governed Operational Calculation Definition.
 *
 * The registry is the code catalog; the governed unit it holds is a Definition
 * (doc 06 §1.2). It is the ONE resolution path: every consumer resolves a key
 * here, and resolution FAILS CLOSED — `getOperationalCalculationDefinition`
 * throws on an unregistered key (the generalized `isKnownOipMetricKey` gate,
 * doc 05 §8.3). A key that names math that does not exist cannot resolve.
 *
 * V1 registers exactly one family (Resource Requirements & Capacity). Adding a
 * future family is a registration — append its Definitions here — never a
 * redesign of this module.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/05-registration-architecture.md
 */

import type {
    OperationalCalculationConsumer,
    OperationalCalculationDefinition,
} from "@/lib/operationalCalculations/definition";
import type { OperationalCalculationFamily } from "@/lib/operationalCalculations/resultContract";
import { RESOURCE_AND_CAPACITY_DEFINITIONS } from "@/lib/operationalCalculations/families/resourceRequirementsAndCapacity";

/**
 * The registered families, in registration order. Future families are appended
 * here as additional Definition arrays.
 */
const REGISTERED_DEFINITIONS: readonly OperationalCalculationDefinition[] = [
    ...RESOURCE_AND_CAPACITY_DEFINITIONS,
];

function buildRegistry(
    definitions: readonly OperationalCalculationDefinition[],
): ReadonlyMap<string, OperationalCalculationDefinition> {
    const map = new Map<string, OperationalCalculationDefinition>();
    for (const def of definitions) {
        if (map.has(def.key)) {
            throw new Error(`Duplicate Operational Calculation key "${def.key}" in the registry.`);
        }
        map.set(def.key, def);
    }
    return map;
}

const REGISTRY = buildRegistry(REGISTERED_DEFINITIONS);
const REGISTRY_LIST: readonly OperationalCalculationDefinition[] = Object.freeze([...REGISTRY.values()]);

/** True when `key` names a registered Operational Calculation Definition. */
export function isKnownCalculationKey(key: string): boolean {
    return REGISTRY.has(key);
}

/**
 * Resolve a Definition by key. FAILS CLOSED: throws on an unregistered key so a
 * binding to math that does not exist can never silently return nothing.
 */
export function getOperationalCalculationDefinition(key: string): OperationalCalculationDefinition {
    const def = REGISTRY.get(key);
    if (!def) {
        throw new Error(`Unknown Operational Calculation key "${key}" — not registered.`);
    }
    return def;
}

/** Resolve a Definition by key, or null when unregistered (non-throwing lookup). */
export function findOperationalCalculationDefinition(
    key: string,
): OperationalCalculationDefinition | null {
    return REGISTRY.get(key) ?? null;
}

/** All registered Definitions, in registration order. */
export function listOperationalCalculationDefinitions(): readonly OperationalCalculationDefinition[] {
    return REGISTRY_LIST;
}

export function listOperationalCalculationDefinitionsByFamily(
    family: OperationalCalculationFamily,
): readonly OperationalCalculationDefinition[] {
    return Object.freeze(REGISTRY_LIST.filter((d) => d.family === family));
}

export function listOperationalCalculationDefinitionsByConsumer(
    consumer: OperationalCalculationConsumer,
): readonly OperationalCalculationDefinition[] {
    return Object.freeze(REGISTRY_LIST.filter((d) => d.consumers.includes(consumer)));
}
