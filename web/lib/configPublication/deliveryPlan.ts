import { createHash } from "node:crypto";
import type {
    ConfigurationDeliveryPlan,
    ConfigurationDeliveryTarget,
    ConfigurationPublicationRecord,
} from "@/lib/configPublication/types";

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

export function normalizeConfigurationTargets(
    targets: readonly ConfigurationDeliveryTarget[],
): ConfigurationDeliveryTarget[] {
    const unique = new Map<string, ConfigurationDeliveryTarget>();
    for (const target of targets) {
        const locationId = target.locationId.trim();
        if (!locationId || unique.has(locationId)) continue;
        unique.set(locationId, {
            locationId,
            locationLabel: target.locationLabel.trim() || "Location",
        });
    }
    return [...unique.values()].sort((a, b) => a.locationId.localeCompare(b.locationId));
}

/**
 * A plan identity is stable across retries and independent of selection order.
 * A different publication, provider version, or target set is a different run.
 */
export function buildConfigurationDeliveryPlan(input: {
    publication: ConfigurationPublicationRecord;
    providerKey: string;
    providerVersion: number;
    targets: readonly ConfigurationDeliveryTarget[];
}): ConfigurationDeliveryPlan {
    const targets = normalizeConfigurationTargets(input.targets);
    if (targets.length === 0) throw new Error("Choose at least one Location.");
    if (!input.providerKey.trim()) throw new Error("A delivery provider is required.");
    if (!Number.isInteger(input.providerVersion) || input.providerVersion < 1) {
        throw new Error("A valid delivery provider version is required.");
    }

    const targetSetChecksum = sha256(targets.map((target) => target.locationId).join("\n"));
    const identity = [
        input.publication.orgId,
        input.publication.domainKey,
        input.publication.id,
        input.providerKey,
        String(input.providerVersion),
        targetSetChecksum,
    ].join(":");

    return {
        orgId: input.publication.orgId,
        domainKey: input.publication.domainKey,
        providerKey: input.providerKey,
        providerVersion: input.providerVersion,
        publicationId: input.publication.id,
        revisionId: input.publication.revision.id,
        targets,
        targetSetChecksum,
        idempotencyKey: sha256(identity),
    };
}
