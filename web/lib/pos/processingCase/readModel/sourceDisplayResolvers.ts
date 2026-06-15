/**
 * POS-FP2 — source descriptor resolution (Deliverable 4: batched per source kind).
 *
 * Turns source references into display-only descriptors by calling each kind's
 * resolver exactly once per page (no N+1). Unknown kinds and missing ids fall
 * back to a safe generic descriptor — never an error, never a dropped case.
 *
 * Pure: no I/O of its own. The production resolver registry (which reads the
 * owning systems) lives in `processingCaseReadModelDb.ts`.
 */

import type { ProcessingCaseSourceKind } from "../types";
import type { SourceDisplayDescriptor, SourceDisplayResolverRegistry, SourceRef } from "./types";

/** Stable map key for a (kind, id) source reference. */
export function descriptorKey(kind: ProcessingCaseSourceKind, id: string): string {
    return `${kind}::${id}`;
}

/** Generic, display-only fallback for unknown kinds / missing sources. Marked `resolved=false`. */
export function genericFallbackDescriptor(ref: SourceRef): SourceDisplayDescriptor {
    return {
        kind: ref.kind,
        id: ref.id,
        label: ref.kind,
        receivedAt: ref.linkedAt,
        channel: null,
        resolved: false,
    };
}

/**
 * Resolve descriptors for refs, batched per source kind. Each registered resolver
 * is invoked at most once (with all ids of that kind). Returns a map keyed by
 * `${kind}::${id}`.
 */
export async function resolveSourceDescriptors(
    refs: SourceRef[],
    registry: SourceDisplayResolverRegistry
): Promise<Map<string, SourceDisplayDescriptor>> {
    const out = new Map<string, SourceDisplayDescriptor>();

    // De-dupe and group refs by kind.
    const seen = new Set<string>();
    const refsByKind = new Map<ProcessingCaseSourceKind, SourceRef[]>();
    for (const ref of refs) {
        const key = descriptorKey(ref.kind, ref.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const list = refsByKind.get(ref.kind) ?? [];
        list.push(ref);
        refsByKind.set(ref.kind, list);
    }

    for (const [kind, kindRefs] of refsByKind) {
        const resolver = registry.get(kind);
        if (!resolver) {
            for (const ref of kindRefs) out.set(descriptorKey(kind, ref.id), genericFallbackDescriptor(ref));
            continue;
        }
        const resolved = await resolver(kindRefs.map((r) => r.id)); // exactly one call per kind
        for (const ref of kindRefs) {
            const label = resolved.get(ref.id);
            out.set(
                descriptorKey(kind, ref.id),
                label
                    ? { kind, id: ref.id, label: label.label, receivedAt: label.receivedAt, channel: label.channel, resolved: true }
                    : genericFallbackDescriptor(ref)
            );
        }
    }

    return out;
}
