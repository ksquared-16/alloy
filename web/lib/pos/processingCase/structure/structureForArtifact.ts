/**
 * One source's structure, narrowed to ONE logical artifact.
 *
 * The executable grain is the artifact, not the document. A hosted submission that is really four
 * agreements must publish four Forms, because a signature belongs to the agreement it closes — and
 * on the real packet the six artifacts carry signatures 2/1/0/1/1/1. Collapse them to one Form per
 * source and a single signature would satisfy the Tuition Agreement, the Handbook Acknowledgement
 * and the ACH Authorization at once. That is the defect this projection exists to make impossible.
 *
 * This is a FILTER over already-certified evidence and nothing else. It re-reads no bytes, re-runs
 * no discovery, and reinterprets no label: the artifact already named its own sections when the
 * source was segmented, and this keeps exactly those. If a name here looks wrong, the segmentation
 * is wrong, and that is the right place to fix it.
 *
 * Pure + deterministic. No I/O.
 */

import type { DocumentStructureCandidate, DocumentStructureSection } from "./types";
import type { LogicalArtifact } from "./logicalArtifacts";

export interface ArtifactStructureProjection {
    structure: DocumentStructureCandidate;
    /** The artifact this projection belongs to — carried so callers never re-derive identity. */
    artifact: LogicalArtifact;
    /** Section titles the artifact claimed that the structure does not contain. Should be empty. */
    missing_sections: string[];
}

/**
 * Narrow `structure` to the sections `artifact` spans, in the source's own order.
 *
 * Section order comes from the STRUCTURE, not from `section_titles`: the source's order is the one
 * a family reads, and an artifact's title list is a membership claim rather than a sequence.
 */
export function structureForArtifact(
    structure: DocumentStructureCandidate,
    artifact: LogicalArtifact,
): ArtifactStructureProjection {
    const claimed = new Set(artifact.section_titles);
    const kept: DocumentStructureSection[] = structure.sections.filter((s) => claimed.has(s.title));
    const present = new Set(kept.map((s) => s.title));
    const missing_sections = artifact.section_titles.filter((t) => !present.has(t));

    // Repeating groups belong to the sections they were detected in. A group whose section did not
    // come along would otherwise describe rows this Form no longer contains.
    const repeating = (structure.repeating_groups ?? []).filter((g) => {
        const title = (g as { section_title?: string }).section_title;
        return title === undefined || present.has(title);
    });

    return {
        artifact,
        missing_sections,
        structure: {
            ...structure,
            sections: kept,
            ...(structure.repeating_groups ? { repeating_groups: repeating } : {}),
            // The projected structure knows it is ONE artifact. Leaving the full list here would let
            // a downstream reader segment it again and rediscover siblings that are not in it.
            logical_artifacts: [artifact],
        },
    };
}

/** Every artifact of one source, projected, in the certified artifact order. */
export function projectAllArtifacts(structure: DocumentStructureCandidate): ArtifactStructureProjection[] {
    return (structure.logical_artifacts ?? []).map((a) => structureForArtifact(structure, a));
}

export interface ArtifactPartitionReport {
    ok: boolean;
    /** Destination evidence ids present in the source but in no artifact projection. */
    lost: string[];
    /** Destination evidence ids appearing in more than one artifact projection. */
    duplicated: string[];
    total_source_destinations: number;
    total_projected_destinations: number;
}

/**
 * Does the set of artifact projections partition the source's executable destinations exactly?
 *
 * Slicing is only safe if it loses nothing and duplicates nothing. A lost destination is a question
 * the family is never asked; a duplicated one is a question asked twice, or worse, a signature that
 * appears to execute two artifacts.
 */
export function reconcileArtifactPartition(structure: DocumentStructureCandidate): ArtifactPartitionReport {
    const evidenceOf = (s: DocumentStructureCandidate): string[] =>
        s.sections.flatMap((sec) => sec.fields.map((f) => f.evidence ?? `${sec.title}::${f.label}`));

    const sourceIds = evidenceOf(structure);
    const seen = new Map<string, number>();
    for (const p of projectAllArtifacts(structure)) {
        for (const id of evidenceOf(p.structure)) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    const lost = sourceIds.filter((id) => !seen.has(id));
    const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    return {
        ok: lost.length === 0 && duplicated.length === 0,
        lost,
        duplicated,
        total_source_destinations: sourceIds.length,
        total_projected_destinations: [...seen.values()].reduce((a, b) => a + b, 0),
    };
}
