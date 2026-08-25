/**
 * A signature, the artifact it executes, and the date that belongs to it.
 *
 * Two things were left open after Slice 1. A signature knew nothing about which artifact it
 * executes — so on a hosted submission carrying four agreements, one signature could appear to
 * satisfy all of them. And the date printed beside a signature stayed an unrelated generic date
 * field, even where the source proves the relationship.
 *
 * Both are answered from source structure. The artifact comes from the segmentation the reader
 * already performed. The date comes from ADJACENCY the source itself draws: a PDF puts the date on
 * the same baseline as the signature it dates, and a hosted form puts it in the item immediately
 * before the signature. Where the source proves nothing, nothing is claimed.
 *
 * Pure + deterministic.
 */

import { PACKET_INTAKE_CONTRACT_VERSION, type PacketDestination, type PacketIntakeInput, type SignatureBinding } from "./contracts";
import type { LogicalArtifact } from "@/lib/pos/processingCase/structure/logicalArtifacts";

/** Same-row tolerance in PDF points. A signature and its date share a baseline, not a pixel. */
const SAME_ROW_TOLERANCE = 12;

function artifactFor(artifacts: LogicalArtifact[], evidence: string): LogicalArtifact | null {
    return artifacts.find((a) => a.destination_ids.includes(evidence)) ?? null;
}

export function bindSignatures(inputs: PacketIntakeInput[], destinations: PacketDestination[]): SignatureBinding[] {
    const out: SignatureBinding[] = [];

    for (const input of inputs) {
        const artifacts = input.structure.logical_artifacts ?? [];
        const ownDestinations = destinations.filter((d) => d.document_id === input.artifact.document_id);

        // Geometry, when the reader recovered it — a PDF proves adjacency by position.
        const geometry = new Map<string, { page: number; bbox: [number, number, number, number]; type: string }>();
        for (const section of input.structure.sections) {
            for (const f of section.fields) {
                if (!f.evidence || !f.bbox || typeof f.page !== "number") continue;
                geometry.set(f.evidence, { page: f.page, bbox: f.bbox, type: f.suggested_type });
            }
        }

        const order = ownDestinations.map((d) => d.evidence);

        for (const sig of ownDestinations.filter((d) => d.type === "signature")) {
            const artifact = artifactFor(artifacts, sig.evidence);
            const variant = variantOf(input, sig.evidence);

            let dateId: string | null = null;
            const signals: string[] = [];

            const sigGeom = geometry.get(sig.evidence);
            if (sigGeom) {
                // Same page, same baseline band, and it is a date. The source drew them on one line.
                const sameRow = ownDestinations.filter((d) => {
                    if (d.evidence === sig.evidence || d.type !== "date") return false;
                    const g = geometry.get(d.evidence);
                    if (!g || g.page !== sigGeom.page) return false;
                    return Math.abs(g.bbox[1] - sigGeom.bbox[1]) <= SAME_ROW_TOLERANCE;
                });
                if (sameRow.length === 1) {
                    dateId = sameRow[0].id;
                    signals.push(`drawn on the same baseline as the signature (page ${sigGeom.page}, within ${SAME_ROW_TOLERANCE}pt)`);
                } else if (sameRow.length > 1) {
                    signals.push(`${sameRow.length} date destinations share the signature's baseline — ambiguous, so none is claimed`);
                }
            }

            if (!dateId) {
                // No geometry: use SOURCE ORDER. A hosted form puts the date immediately before the
                // signature it dates. Only the immediately-preceding destination counts.
                const idx = order.indexOf(sig.evidence);
                const prev = idx > 0 ? ownDestinations[idx - 1] : null;
                if (prev && isDateLike(prev)) {
                    dateId = prev.id;
                    signals.push("the destination immediately before the signature, in source order, is its date");
                }
            }

            if (!dateId && signals.length === 0) signals.push("the source does not relate any date to this signature");

            out.push({
                contract_version: PACKET_INTAKE_CONTRACT_VERSION,
                id: `sig:${sig.id}`,
                document_id: sig.document_id,
                logical_artifact_id: artifact?.id ?? null,
                logical_artifact_title: artifact?.title ?? null,
                destination_id: sig.id,
                label: sig.label,
                variant,
                signer_grain: "recipient",
                date_destination_id: dateId,
                date_signals: signals,
            });
        }
    }

    return out;
}

/** A date destination, whether the reader typed it as one or the label says so. */
function isDateLike(d: PacketDestination): boolean {
    return d.type === "date" || /\bdate\b|\bfecha\b/i.test(d.label);
}

function variantOf(input: PacketIntakeInput, evidence: string): "initial" | "update" {
    for (const section of input.structure.sections) {
        for (const f of section.fields) {
            if (f.evidence === evidence && f.signature_variant) return f.signature_variant;
        }
    }
    return "initial";
}
