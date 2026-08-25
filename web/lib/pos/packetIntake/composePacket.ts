/**
 * Compose one enrollment packet from independently-read source artifacts.
 *
 * Each source is read on its own, exactly as before — this layer never re-reads anything. It puts
 * the results side by side and asks the four questions a packet raises and a document cannot:
 *
 *   which destinations exist, and are they all still here?
 *   which facts are the same fact in more than one artifact?
 *   which obligations are the same obligation printed twice?
 *   which signature executes which artifact?
 *
 * Every answer is a PROPOSAL with its evidence attached. Nothing merges silently, and two questions
 * that merely read alike stay distinct: correlation requires a shared canonical identity, a shared
 * recognized collection, or an identical declared option set — never string similarity.
 *
 * Pure + deterministic. No I/O, no AI.
 */

import type { BusinessConceptCandidate } from "@/lib/pos/discovery/contracts";
import type { LogicalArtifact } from "@/lib/pos/processingCase/structure/logicalArtifacts";
import {
    PACKET_INTAKE_CONTRACT_VERSION,
    type CrossArtifactCorrelation,
    type ObligationCorrelation,
    type PacketDestination,
    type PacketIntakeInput,
    type PacketIntakeResult,
    type PacketReconciliation,
    type SignatureBinding,
} from "./contracts";
import { correlateObligations } from "./correlateObligations";
import { bindSignatures } from "./bindSignatures";

/** Concept keys that name a section subject rather than a fact — never a correlation basis. */
const NON_IDENTIFYING_KEY = /^(child|person|household|enrollment|internal|unknown)\.$/;

/**
 * Keys that are OBLIGATIONS, not facts. A signature is scoped to the artifact it executes and never
 * correlates across artifacts — that is the whole point of scoping it — and acknowledgements and
 * uploads are correlated by `correlateObligations`, which applies a far stricter test than shared
 * key. Correlating them here as well would both double-count them and quietly undo the scoping.
 */
const OBLIGATION_KEY = /^(signature|requirement)\./;

function destinationId(documentId: string, evidence: string): string {
    return `${documentId}::${evidence}`;
}

/** Which logical artifact inside a source owns a destination. */
function artifactIndex(artifacts: LogicalArtifact[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const a of artifacts) for (const d of a.destination_ids) out.set(d, a.id);
    return out;
}

function collectDestinations(inputs: PacketIntakeInput[]): { destinations: PacketDestination[]; reported: Map<string, number> } {
    const destinations: PacketDestination[] = [];
    const reported = new Map<string, number>();
    for (const { artifact, structure } of inputs) {
        const owner = artifactIndex(structure.logical_artifacts ?? []);
        let n = 0;
        for (const section of structure.sections) {
            for (const f of section.fields) {
                n += 1;
                const evidence = f.evidence ?? `${section.title}:${f.label}`;
                destinations.push({
                    id: destinationId(artifact.document_id, evidence),
                    document_id: artifact.document_id,
                    evidence,
                    label: f.label,
                    type: f.suggested_type,
                    required: f.required === true,
                    page: typeof f.page === "number" ? f.page : null,
                    logical_artifact_id: owner.get(evidence) ?? null,
                });
            }
        }
        reported.set(artifact.document_id, n);
    }
    return { destinations, reported };
}

function reconcile(inputs: PacketIntakeInput[], destinations: PacketDestination[], reported: Map<string, number>): PacketReconciliation {
    const seen = new Map<string, number>();
    for (const d of destinations) seen.set(d.id, (seen.get(d.id) ?? 0) + 1);
    const duplicated = [...seen.entries()].filter(([, c]) => c > 1).map(([id]) => id);

    const by_source = inputs.map(({ artifact }) => ({
        document_id: artifact.document_id,
        title: artifact.title,
        raw: artifact.raw_control_count ?? null,
        reported: reported.get(artifact.document_id) ?? 0,
        accounted: destinations.filter((d) => d.document_id === artifact.document_id).length,
    }));

    // A destination goes missing when a reader reported it and the packet cannot address it —
    // which is what a colliding identity looks like from the outside.
    const missing: string[] = [];
    for (const s of by_source) {
        if (s.accounted < s.reported) missing.push(`${s.document_id}: ${s.reported - s.accounted} destination(s) unaddressable`);
    }

    const total_reported = by_source.reduce((n, s) => n + s.reported, 0);
    const total_raw = by_source.reduce((n, s) => n + (s.raw ?? s.reported), 0);
    const total_accounted = destinations.length;
    return {
        by_source,
        total_raw,
        total_reported,
        total_accounted,
        duplicated,
        missing,
        balanced: duplicated.length === 0 && missing.length === 0 && total_reported === total_accounted,
    };
}

/** How many source destinations a concept stands for. */
function conceptWeight(c: BusinessConceptCandidate): number {
    if (c.repetition) return c.repetition.member_names.length;
    return Math.max(1, c.source.labels.length);
}

/**
 * Facts that appear in more than one artifact.
 *
 * The basis is always something the readers DERIVED, never how the words look. Two "Student Name"
 * boxes correlate because both resolved to `child.name`; two identical closed choices correlate
 * because their option sets match exactly. "Physical Address, City, State and Zip" and the ACH
 * form's "City" do not correlate, because nothing derived says they are the same fact — and that
 * is the correct answer, not a miss.
 */
function correlateFacts(inputs: PacketIntakeInput[]): CrossArtifactCorrelation[] {
    type Entry = { input: PacketIntakeInput; concept: BusinessConceptCandidate; artifactId: string | null };
    const byKey = new Map<string, Entry[]>();
    const byOptionSet = new Map<string, Entry[]>();

    for (const input of inputs) {
        // A reference document declares no participant facts. Its concepts are obligations and
        // policy, and they take part in obligation correlation only.
        if (input.artifact.fill_intent === "reference") continue;
        const owner = artifactIndex(input.structure.logical_artifacts ?? []);
        for (const concept of input.discovery.concepts) {
            if (OBLIGATION_KEY.test(concept.concept_key ?? "")) continue;
            const artifactId = concept.source.labels.map((l) => owner.get(l)).find(Boolean) ?? null;
            const entry: Entry = { input, concept, artifactId: artifactId ?? null };
            const key = concept.concept_key ?? "";
            if (key && !NON_IDENTIFYING_KEY.test(key)) {
                byKey.set(key, [...(byKey.get(key) ?? []), entry]);
            }
            if (concept.options && concept.options.length >= 2) {
                const optionKey = concept.options.map((o) => o.trim().toLowerCase()).sort().join("|");
                byOptionSet.set(optionKey, [...(byOptionSet.get(optionKey) ?? []), entry]);
            }
        }
    }

    const out: CrossArtifactCorrelation[] = [];

    const push = (entries: Entry[], basis: CrossArtifactCorrelation["basis"], key: string, signals: string[], explanation: string) => {
        const docs = new Set(entries.map((e) => e.input.artifact.document_id));
        if (docs.size < 2) return; // one artifact is not a cross-artifact correlation
        out.push({
            contract_version: PACKET_INTAKE_CONTRACT_VERSION,
            id: `${key}@${[...docs].sort().join("+")}`,
            concept_key: key,
            label: entries[0].concept.label,
            basis,
            members: entries.map((e) => ({
                document_id: e.input.artifact.document_id,
                concept_id: e.concept.id,
                label: e.concept.label,
                logical_artifact_id: e.artifactId,
            })),
            destinations_covered: entries.reduce((n, e) => n + conceptWeight(e.concept), 0),
            confidence: basis === "canonical_concept_key" ? "high" : "review",
            signals,
            decision_state: "proposed",
            explanation,
        });
    };

    for (const [key, entries] of byKey) {
        push(
            entries,
            "canonical_concept_key",
            key,
            [
                `every member resolved to the canonical semantic key "${key}"`,
                `spans ${new Set(entries.map((e) => e.input.artifact.document_id)).size} source artifacts`,
            ],
            `The same fact, collected in more than one artifact. Bound once, it populates every destination that asks for it.`
        );
    }

    const claimed = new Set(out.flatMap((c) => c.members.map((m) => m.concept_id)));
    for (const [optionKey, entries] of byOptionSet) {
        if (entries.every((e) => claimed.has(e.concept.id))) continue;
        push(
            entries,
            "declared_option_set",
            `options:${optionKey.slice(0, 60)}`,
            [
                "identical declared option sets, option for option",
                `${entries[0].concept.options?.length ?? 0} options`,
            ],
            "The same closed choice asked in two artifacts. The option sets match exactly, which is evidence; the wording of the question is not."
        );
    }

    return out.sort((a, b) => b.destinations_covered - a.destinations_covered || a.id.localeCompare(b.id));
}

export function composePacket(inputs: PacketIntakeInput[]): PacketIntakeResult {
    const warnings: string[] = [];
    if (inputs.length === 0) {
        return {
            contract_version: PACKET_INTAKE_CONTRACT_VERSION,
            sources: [], artifacts: [], destinations: [], correlations: [], obligations: [], signatures: [],
            reconciliation: { by_source: [], total_raw: 0, total_reported: 0, total_accounted: 0, duplicated: [], missing: [], balanced: true },
            warnings: ["no_sources"],
        };
    }

    const { destinations, reported } = collectDestinations(inputs);
    const reconciliation = reconcile(inputs, destinations, reported);
    if (!reconciliation.balanced) {
        warnings.push(
            `Packet reconciliation FAILED: ${reconciliation.total_reported} destination(s) read, ${reconciliation.total_accounted} accounted for` +
                (reconciliation.duplicated.length ? `; ${reconciliation.duplicated.length} counted twice` : "") +
                (reconciliation.missing.length ? `; ${reconciliation.missing.join("; ")}` : "")
        );
    }

    const artifacts = inputs.flatMap(({ artifact, structure }) =>
        (structure.logical_artifacts ?? []).map((a) => ({ ...a, document_id: artifact.document_id }))
    );

    const signatures: SignatureBinding[] = bindSignatures(inputs, destinations);
    const correlations = correlateFacts(inputs);
    const obligations = correlateObligations(inputs);

    return {
        contract_version: PACKET_INTAKE_CONTRACT_VERSION,
        sources: inputs.map((i) => i.artifact),
        artifacts,
        destinations,
        correlations,
        obligations,
        signatures,
        reconciliation,
        warnings,
    };
}
