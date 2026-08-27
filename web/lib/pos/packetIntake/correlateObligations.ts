/**
 * Are two obligations in different artifacts the same obligation?
 *
 * The real packet asks this three times over. The handbook's Parent Authorizations page carries the
 * same seven permissions the tuition agreement repeats word for word — one obligation printed
 * twice. The handbook also states that immunization records must be provided, while the state
 * certificate is the artifact that provides them — an instruction and the requirement that
 * satisfies it. And the three signatures look alike and are not alike at all.
 *
 * Getting this wrong is worse than not answering. Merging two distinct commitments means a parent
 * agrees to something they were never shown; splitting one commitment in two means asking twice.
 * So the bar is deliberately high: obligations merge only on VERBATIM clause identity after
 * normalization — the same sentence, printed in two places. Similar language is reported as
 * distinct, which is the safe answer and usually the true one.
 *
 * Pure + deterministic. No AI, no fuzzy matching, no similarity score.
 */

import type { BusinessConceptCandidate } from "@/lib/pos/discovery/contracts";
import type { LogicalArtifact } from "@/lib/pos/processingCase/structure/logicalArtifacts";
import { PACKET_INTAKE_CONTRACT_VERSION, type ObligationCorrelation, type PacketIntakeInput } from "./contracts";

const OBLIGATION_KINDS = new Set(["acknowledgement", "upload_requirement", "signature"]);

/** Normalize a clause to its words. Punctuation, case and spacing are not the commitment. */
export function clauseIdentity(text: string): string {
    return (text ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The document a sentence NAMES, when it names one. This is how an instruction about a document is
 * linked to the artifact that is that document — the only cross-artifact link drawn from wording,
 * and it links an instruction to a requirement rather than merging two commitments.
 */
const NAMED_DOCUMENT = /\b(immunization|immunisation|vaccination|handbook|tuition agreement|enrollment agreement|physical|health care plan|birth certificate|custody order|guardianship)\b/gi;

function namedDocuments(text: string): string[] {
    return [...new Set((text.toLowerCase().match(NAMED_DOCUMENT) ?? []).map((s) => s.trim()))];
}

function artifactIndex(artifacts: LogicalArtifact[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const a of artifacts) for (const d of a.destination_ids) out.set(d, a.id);
    return out;
}

interface Entry {
    documentId: string;
    concept: BusinessConceptCandidate;
    artifactId: string | null;
    /** The source artifact's own intent — an instruction lives in something you read. */
    fillIntent: "fillable" | "reference" | "unknown";
    text: string;
}

export function correlateObligations(inputs: PacketIntakeInput[]): ObligationCorrelation[] {
    const entries: Entry[] = [];
    for (const input of inputs) {
        const owner = artifactIndex(input.structure.logical_artifacts ?? []);
        for (const concept of input.discovery.concepts) {
            if (!OBLIGATION_KINDS.has(concept.kind)) continue;
            const artifactId = concept.source.labels.map((l) => owner.get(l)).find(Boolean) ?? null;
            entries.push({
                documentId: input.artifact.document_id,
                concept,
                artifactId: artifactId ?? null,
                fillIntent: input.artifact.fill_intent,
                text: concept.label,
            });
        }
    }

    const out: ObligationCorrelation[] = [];
    const member = (e: Entry) => ({
        document_id: e.documentId,
        concept_id: e.concept.id,
        label: e.concept.label,
        logical_artifact_id: e.artifactId,
    });

    // ── same obligation: the identical clause, printed in two artifacts ──
    const byClause = new Map<string, Entry[]>();
    for (const e of entries) {
        if (e.concept.kind !== "acknowledgement") continue;
        const id = clauseIdentity(e.text);
        if (id.length < 24) continue; // too short to be a commitment
        byClause.set(id, [...(byClause.get(id) ?? []), e]);
    }
    const merged = new Set<string>();
    for (const [id, group] of byClause) {
        const docs = new Set(group.map((g) => g.documentId));
        if (docs.size < 2) continue;
        group.forEach((g) => merged.add(g.concept.id));
        out.push({
            contract_version: PACKET_INTAKE_CONTRACT_VERSION,
            id: `same:${id.slice(0, 60)}`,
            relation: "same_obligation",
            kind: "acknowledgement",
            members: group.map(member),
            confidence: "high",
            signals: [
                "identical clause text after normalization — the same sentence, printed in two artifacts",
                `appears in ${docs.size} source artifacts`,
            ],
            decision_state: "proposed",
            explanation:
                "One commitment the packet prints twice. Acknowledged once if the operator accepts — but which artifact carries it is a Requirements decision, not this layer's.",
        });
    }

    // ── instruction + requirement: a reference document names a document another artifact IS ──
    const uploads = entries.filter((e) => e.concept.kind === "upload_requirement");
    for (const instruction of uploads.filter((e) => e.fillIntent === "reference")) {
        const named = namedDocuments(instruction.text);
        if (named.length === 0) continue;
        for (const other of inputs) {
            if (other.artifact.document_id === instruction.documentId) continue;
            const title = `${other.artifact.title} ${other.artifact.source_name ?? ""}`.toLowerCase();
            const hit = named.find((n) => title.includes(n));
            if (!hit) continue;
            out.push({
                contract_version: PACKET_INTAKE_CONTRACT_VERSION,
                id: `instruction:${instruction.concept.id}->${other.artifact.document_id}`,
                relation: "instruction_and_requirement",
                kind: "upload_requirement",
                members: [
                    member(instruction),
                    {
                        document_id: other.artifact.document_id,
                        concept_id: `artifact:${other.artifact.document_id}`,
                        label: other.artifact.title,
                        logical_artifact_id: null,
                    },
                ],
                confidence: "review",
                signals: [
                    `the instruction names "${hit}"`,
                    `another source artifact in this packet IS that document`,
                    "the instruction is in a reference document; the requirement is the artifact itself",
                ],
                decision_state: "proposed",
                explanation:
                    "A rule stated in one artifact and the artifact that satisfies it. Not two obligations — one obligation and the document that discharges it.",
            });
        }
    }

    // ── everything else stays distinct, and says so ──
    for (const e of entries) {
        if (merged.has(e.concept.id)) continue;
        if (out.some((o) => o.members.some((m) => m.concept_id === e.concept.id))) continue;
        out.push({
            contract_version: PACKET_INTAKE_CONTRACT_VERSION,
            id: `distinct:${e.documentId}:${e.concept.id}`,
            relation: "distinct_obligation",
            kind: e.concept.kind as ObligationCorrelation["kind"],
            members: [member(e)],
            confidence: "high",
            signals: ["no identical clause elsewhere in the packet"],
            decision_state: "proposed",
            explanation: "Its own obligation. Similar wording elsewhere in the packet is not evidence that it is the same commitment.",
        });
    }

    return out;
}
