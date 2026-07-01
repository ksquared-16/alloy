/**
 * Platform doctrine: every create action must produce durable, linked, navigable records.
 * See docs/system/action-creation-contract.md
 */

export type ActionCreationContract = {
    actionKey: string;
    canonicalEntity: string;
    canonicalIdKey: string;
    relationshipWrites: readonly string[];
    contextWrites: readonly string[];
    affectedProjections: readonly string[];
    linkabilityTargets: readonly string[];
};

function trimId(value: unknown): string {
    return value != null ? String(value).trim() : "";
}

export function assertCanonicalIdPresent(
    result: Record<string, unknown>,
    canonicalIdKey: string,
    actionKey: string,
): string {
    const id = trimId(result[canonicalIdKey]);
    if (!id) {
        throw new Error(
            `Action "${actionKey}" is incomplete: missing canonical ID "${canonicalIdKey}".`,
        );
    }
    return id;
}

export function assertRelationshipIdsPresent(
    result: Record<string, unknown>,
    keys: readonly string[],
    actionKey: string,
): void {
    for (const key of keys) {
        assertCanonicalIdPresent(result, key, actionKey);
    }
}

export function validateActionCreationContractDeclared(contract: ActionCreationContract): void {
    if (!trimId(contract.actionKey)) throw new Error("ActionCreationContract.actionKey is required.");
    if (!trimId(contract.canonicalEntity)) throw new Error("ActionCreationContract.canonicalEntity is required.");
    if (!trimId(contract.canonicalIdKey)) throw new Error("ActionCreationContract.canonicalIdKey is required.");
    if (!contract.relationshipWrites.length) {
        throw new Error(`ActionCreationContract.relationshipWrites is empty for ${contract.actionKey}.`);
    }
    if (!contract.affectedProjections.length) {
        throw new Error(`ActionCreationContract.affectedProjections is empty for ${contract.actionKey}.`);
    }
    if (!contract.linkabilityTargets.length) {
        throw new Error(`ActionCreationContract.linkabilityTargets is empty for ${contract.actionKey}.`);
    }
}
