/**
 * Real Enrollment Certification V1 — Slice 2 acceptance, over the whole packet.
 *
 * The corpus is the actual School of Enrichment admissions packet: a 23-page family handbook, the
 * Oregon Certificate of Immunization Status, and the hosted Formsite submission that is itself four
 * agreements. All three are blank/redacted public documents — no family data.
 *
 * The reconciliation assertions are deliberately unforgiving. If any source destination disappears
 * or is counted twice, this fails.
 */

import { beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import { loadCertificationPacket, CERTIFICATION_FIXTURES, HOSTED_FORM_SOURCE_URI } from "@/lib/pos/packetIntake/loadCertificationPacket";
import type { PacketIntakeInput, PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/processing");

/** Pins the corpus. A different byte is a different certification. */
const FIXTURE_SHA256: Record<string, string> = {
    [CERTIFICATION_FIXTURES.handbook]: "feb7ee8018a21a28ffb610fb78ef497e84b1f7b7d93ec22cac022462008abe8a",
    [CERTIFICATION_FIXTURES.cis]: "cda2af9f85f814cee37b7990a0c99c3808e47283457cf76c83cc0146ee357388",
    [CERTIFICATION_FIXTURES.hostedForm]: "10c05372c04c159f128f72f16f4335b7ee97f3e7244711f60ac68e0299dba2ca",
};

/** The measured baseline this slice is certified against. */
const RAW_DESTINATIONS = 182;
const NORMALIZED_DESTINATIONS = 180;

let inputs: PacketIntakeInput[];
let packet: PacketIntakeResult;

beforeAll(async () => {
    inputs = await loadCertificationPacket(FIXTURE_DIR);
    packet = composePacket(inputs);
}, 300_000);

describe("the corpus", () => {
    it("is the packet as supplied, byte for byte", () => {
        for (const [name, expected] of Object.entries(FIXTURE_SHA256)) {
            const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(FIXTURE_DIR, name))).digest("hex");
            expect(sha, `${name} is not the certified bytes`).toBe(expected);
        }
    });

    it("is three source artifacts, each read by the reader its format deserves", () => {
        expect(packet.sources.map((s) => s.reader)).toEqual(["layout", "acroform", "hosted_form"]);
        expect(packet.sources.map((s) => s.fill_intent)).toEqual(["reference", "fillable", "fillable"]);
    });

    it("preserves each source's provenance, including the hosted form's address and hash", () => {
        const hosted = packet.sources.find((s) => s.reader === "hosted_form")!;
        expect(hosted.source_uri).toBe(HOSTED_FORM_SOURCE_URI);
        expect(hosted.mime_type).toBe("text/html");
        // The hash is what makes a capture immutable: the external form can change, this cannot.
        expect(hosted.checksum_sha256).toBe(FIXTURE_SHA256[CERTIFICATION_FIXTURES.hostedForm]);
        expect(packet.sources.every((s) => !!s.checksum_sha256)).toBe(true);
    });
});

describe("reconciliation — no destination may disappear or be counted twice", () => {
    it("balances", () => {
        expect(packet.reconciliation.balanced).toBe(true);
        expect(packet.reconciliation.duplicated).toEqual([]);
        expect(packet.reconciliation.missing).toEqual([]);
        expect(packet.warnings).toEqual([]);
    });

    it("accounts for all 182 raw source destinations, and explains the 2 that normalize away", () => {
        expect(packet.reconciliation.total_raw).toBe(RAW_DESTINATIONS);
        expect(packet.reconciliation.total_reported).toBe(NORMALIZED_DESTINATIONS);
        expect(packet.reconciliation.total_accounted).toBe(NORMALIZED_DESTINATIONS);
        // The gap is exactly the two Yes/No questions: two checkbox elements each, one question each.
        const yesNo = packet.destinations.filter((d) => d.type === "select" && /custody|restraining/i.test(d.label));
        expect(yesNo).toHaveLength(2);
        expect(RAW_DESTINATIONS - NORMALIZED_DESTINATIONS).toBe(yesNo.length);
    });

    it("reports per source", () => {
        expect(packet.reconciliation.by_source.map((b) => [b.document_id, b.raw, b.reported, b.accounted])).toEqual([
            ["doc-handbook", 0, 0, 0],
            ["doc-cis", 85, 85, 85],
            ["doc-formsite", 97, 95, 95],
        ]);
    });

    it("gives every destination a globally unique address inside the packet", () => {
        const ids = packet.destinations.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("fails loudly when a destination goes missing", () => {
        // Positive control: strip a section from one source and the checker must notice.
        const damaged = inputs.map((i, idx) =>
            idx === 1 ? { ...i, structure: { ...i.structure, sections: i.structure.sections.slice(0, 1) } } : i
        );
        const result = composePacket(damaged);
        expect(result.reconciliation.total_accounted).toBeLessThan(NORMALIZED_DESTINATIONS);
    });

    it("fails loudly when a destination is counted twice", () => {
        // Positive control: duplicate a section and the identity check must catch the collision.
        const damaged = inputs.map((i, idx) =>
            idx === 1 ? { ...i, structure: { ...i.structure, sections: [...i.structure.sections, i.structure.sections[0]] } } : i
        );
        const result = composePacket(damaged);
        expect(result.reconciliation.duplicated.length).toBeGreaterThan(0);
        expect(result.reconciliation.balanced).toBe(false);
        expect(result.warnings.join(" ")).toContain("counted twice");
    });
});

describe("AcroForm geometry survives packet composition", () => {
    it("keeps all 85 CIS destinations with page and box", () => {
        const cis = inputs.find((i) => i.artifact.document_id === "doc-cis")!;
        const fields = cis.structure.sections.flatMap((s) => s.fields);
        expect(fields).toHaveLength(85);
        expect(fields.every((f) => Array.isArray(f.bbox) && f.bbox.length === 4)).toBe(true);
        expect(packet.destinations.filter((d) => d.document_id === "doc-cis")).toHaveLength(85);
    });
});

describe("the four Formsite artifacts", () => {
    const of = (id: string) => packet.artifacts.find((a) => a.document_id === "doc-formsite" && a.id === id)!;

    it("are four, not one 97-field form", () => {
        const formsite = packet.artifacts.filter((a) => a.document_id === "doc-formsite");
        expect(formsite.map((a) => a.title)).toEqual([
            "School of Enrichment Admissions Packet",
            "Tuition & Enrollment Agreement",
            "Parent Handbook Acknowledgement",
            "Direct Payment Authorization",
        ]);
    });

    it("partition every destination exactly once", () => {
        const formsite = packet.artifacts.filter((a) => a.document_id === "doc-formsite");
        const all = formsite.flatMap((a) => a.destination_ids);
        expect(all).toHaveLength(95);
        expect(new Set(all).size).toBe(95);
    });

    it("each signed agreement carries exactly one signature, and the collection artifact none", () => {
        expect(of("1:school_of_enrichment_admissions_packet").unsigned).toBe(true);
        expect(of("1:school_of_enrichment_admissions_packet").signature_ids).toEqual([]);
        for (const id of ["2:tuition_enrollment_agreement", "3:parent_handbook_acknowledgement", "4:direct_payment_authorization"]) {
            expect(of(id).signature_ids, id).toHaveLength(1);
            expect(of(id).unsigned).toBe(false);
        }
    });

    it("a signature never reaches beyond the artifact it executes", () => {
        const tuition = of("2:tuition_enrollment_agreement");
        const handbook = of("3:parent_handbook_acknowledgement");
        const ach = of("4:direct_payment_authorization");
        expect(handbook.destination_ids).not.toContain(tuition.signature_ids[0]);
        expect(ach.destination_ids).not.toContain(tuition.signature_ids[0]);
        expect(new Set([...tuition.signature_ids, ...handbook.signature_ids, ...ach.signature_ids]).size).toBe(3);
    });
});

describe("signatures", () => {
    it("finds all six in the packet and scopes each to one artifact", () => {
        expect(packet.signatures).toHaveLength(6);
        expect(packet.signatures.every((s) => s.logical_artifact_id !== null)).toBe(true);
        expect(packet.signatures.every((s) => s.signer_grain === "recipient")).toBe(true);
    });

    it("keeps the CIS re-sign line distinct from the two mandatory attestations", () => {
        const cis = packet.signatures.filter((s) => s.document_id === "doc-cis");
        expect(cis).toHaveLength(3);
        expect(cis.filter((s) => s.variant === "update")).toHaveLength(1);
        expect(cis.filter((s) => s.variant === "initial")).toHaveLength(2);
    });

    it("links every signature to the date the source puts with it", () => {
        expect(packet.signatures.every((s) => s.date_destination_id !== null)).toBe(true);
        // …and no two signatures claim the same date.
        const dates = packet.signatures.map((s) => s.date_destination_id);
        expect(new Set(dates).size).toBe(dates.length);
    });

    it("names the structural evidence for each link rather than asserting it", () => {
        const pdfLink = packet.signatures.find((s) => s.document_id === "doc-cis")!;
        expect(pdfLink.date_signals.join(" ")).toContain("same baseline");
        const hostedLink = packet.signatures.find((s) => s.document_id === "doc-formsite")!;
        expect(hostedLink.date_signals.join(" ")).toContain("source order");
    });
});

describe("cross-artifact correlation — proposed, never silent", () => {
    it("proposes only facts that share a derived canonical identity", () => {
        expect(packet.correlations.map((c) => c.concept_key).sort()).toEqual(["child.date_of_birth", "child.name", "guardian.name"]);
        expect(packet.correlations.every((c) => c.basis === "canonical_concept_key")).toBe(true);
        expect(packet.correlations.every((c) => c.decision_state === "proposed")).toBe(true);
    });

    it("spans more than one artifact by definition, and carries its evidence", () => {
        for (const c of packet.correlations) {
            expect(new Set(c.members.map((m) => m.document_id)).size).toBeGreaterThan(1);
            expect(c.signals.length).toBeGreaterThan(0);
        }
    });

    it("keeps the child's name, the guardian's name and the physician's name apart", () => {
        const childName = packet.correlations.find((c) => c.concept_key === "child.name")!;
        const labels = childName.members.flatMap((m) =>
            inputs.find((i) => i.artifact.document_id === m.document_id)!.discovery.concepts.find((x) => x.id === m.concept_id)!.source.labels
        );
        expect(labels.join(" | ")).not.toMatch(/physician|dentist|guardian|account holder/i);
        expect(labels.some((l) => /student name/i.test(l))).toBe(true);
    });

    it("does not correlate a reference document's concepts as participant facts", () => {
        expect(packet.correlations.every((c) => c.members.every((m) => m.document_id !== "doc-handbook"))).toBe(true);
    });

    it("does not correlate signatures across artifacts — that is what scoping them means", () => {
        expect(packet.correlations.some((c) => c.concept_key.startsWith("signature."))).toBe(false);
    });
});

describe("obligation correlation — merges on identity, never on resemblance", () => {
    it("finds the clauses the packet genuinely prints twice", () => {
        const same = packet.obligations.filter((o) => o.relation === "same_obligation");
        expect(same).toHaveLength(6);
        for (const o of same) {
            expect(new Set(o.members.map((m) => m.document_id))).toEqual(new Set(["doc-handbook", "doc-formsite"]));
            expect(o.signals.join(" ")).toContain("identical clause text");
        }
    });

    it("leaves everything else distinct, and says why", () => {
        const distinct = packet.obligations.filter((o) => o.relation === "distinct_obligation");
        expect(distinct.length).toBeGreaterThan(0);
        expect(distinct.every((o) => o.signals.join(" ").includes("no identical clause"))).toBe(true);
    });

    it("never merges two obligations that merely share vocabulary", () => {
        // The three signature obligations all say "By signing below, I agree…". They stay three.
        const signatureish = packet.obligations.filter((o) => /by signing/i.test(o.members[0]?.label ?? ""));
        expect(signatureish.every((o) => o.relation === "distinct_obligation")).toBe(true);
    });

    it("proposes everything and applies nothing", () => {
        expect(packet.obligations.every((o) => o.decision_state === "proposed")).toBe(true);
    });
});

describe("the handbook contributes understanding, not fields", () => {
    it("produces no participant destinations at all", () => {
        expect(packet.destinations.filter((d) => d.document_id === "doc-handbook")).toHaveLength(0);
    });

    it("still produces the obligations it actually states", () => {
        const handbook = inputs.find((i) => i.artifact.document_id === "doc-handbook")!;
        const kinds = handbook.discovery.concepts.map((c) => c.kind);
        expect(kinds.filter((k) => k === "acknowledgement").length).toBeGreaterThanOrEqual(9);
        expect(kinds).not.toContain("scalar_field");
    });
});

describe("the compression scorecard, guarded", () => {
    const OBLIGATION = new Set(["acknowledgement", "upload_requirement", "signature"]);

    /** Facts, merged across artifacts wherever a correlation proposes it. */
    const uniqueFacts = () => {
        const merge = new Map<string, string>();
        for (const c of packet.correlations) for (const m of c.members) merge.set(`${m.document_id}:${m.concept_id}`, c.concept_key);
        const keys = new Set<string>();
        for (const i of inputs) {
            if (i.artifact.fill_intent === "reference") continue;
            for (const c of i.discovery.concepts) {
                if (OBLIGATION.has(c.kind)) continue;
                keys.add(merge.get(`${i.artifact.document_id}:${c.id}`) ?? `${i.artifact.document_id}|${c.concept_key ?? c.id}`);
            }
        }
        return keys;
    };

    /** Obligations, merged wherever the packet proved the same clause is printed twice. */
    const uniqueObligations = () => {
        const merge = new Map<string, string>();
        for (const o of packet.obligations) if (o.relation === "same_obligation") for (const m of o.members) merge.set(`${m.document_id}:${m.concept_id}`, o.id);
        const keys = new Set<string>();
        for (const i of inputs) {
            for (const c of i.discovery.concepts) {
                if (!OBLIGATION.has(c.kind)) continue;
                keys.add(merge.get(`${i.artifact.document_id}:${c.id}`) ?? `${i.artifact.document_id}|${c.id}`);
            }
        }
        return keys;
    };

    it("182 raw destinations resolve to 86 semantic facts and 32 obligations", () => {
        expect(packet.reconciliation.total_raw).toBe(182);
        expect(uniqueFacts().size).toBe(86);
        expect(uniqueObligations().size).toBe(32);
    });

    it("11 of the 86 facts carry a SAFE proposal, and the one remaining unsafe binding is refused", () => {
        const bound = new Set<string>();
        const merge = new Map<string, string>();
        for (const c of packet.correlations) for (const m of c.members) merge.set(`${m.document_id}:${m.concept_id}`, c.concept_key);
        for (const i of inputs) {
            if (i.artifact.fill_intent === "reference") continue;
            const byCandidate = new Map(i.discovery.proposals.map((pr) => [pr.candidate_id, pr]));
            for (const c of i.discovery.concepts) {
                if (OBLIGATION.has(c.kind)) continue;
                const d = byCandidate.get(c.id)?.disposition;
                if (d === "reuse_canonical_field" || d === "reuse_existing_field") {
                    bound.add(merge.get(`${i.artifact.document_id}:${c.id}`) ?? `${i.artifact.document_id}|${c.concept_key ?? c.id}`);
                }
            }
        }
        // Slice 5 took one fact OUT of this set on purpose. "Regular medications?" used to bind at
        // LOW confidence to the generic child `medical_notes` field — a green "Existing field" chip
        // over a medication record dissolving into a notes blob. It is now HELD for the Health
        // foundation (D-H5), which is a worse-looking number and a better answer.
        expect(bound.size).toBe(7);
        expect([...bound].some((k) => /medication/i.test(k)), "no medication binding may survive").toBe(false);
        expect([...bound].some((k) => /allergies/i.test(k)), "a confident allergy binding must survive").toBe(true);

        // Slice 4 added the care-provider relationships, so the physician's and dentist's name and
        // phone are no longer refusals — they bind to a relationship, which is where they belong.
        const relationshipScalars = inputs.flatMap((i) =>
            i.discovery.proposals.filter((p) => {
                const c = i.discovery.concepts.find((x) => x.id === p.candidate_id);
                return p.disposition === "relationship_binding" && c && c.kind !== "relationship_group";
            })
        );
        expect(relationshipScalars).toHaveLength(4);
        expect(relationshipScalars.map((p) => p.target_relationship_role).sort()).toEqual(["dentist", "dentist", "physician", "physician"]);

        // One refusal remains, and it is the right one: a secondary parent's address is not the
        // household's, and no relationship collects it.
        const refused = inputs.flatMap((i) => i.discovery.proposals.filter((p) => p.refused_binding));
        expect(refused).toHaveLength(1);
        expect(refused[0].refused_binding!.target).toEqual({ entity_type: "customer", field_key: "address" });
        expect(refused[0].refused_binding!.reason.length).toBeGreaterThan(20);
        expect(refused[0].disposition).not.toBe("reuse_canonical_field");
    });

    it("every destination in the packet is claimed by a fact or by an obligation — none is orphaned", () => {
        for (const i of inputs) {
            if (i.artifact.fill_intent === "reference") continue;
            const claimed = new Set<string>();
            for (const c of i.discovery.concepts) {
                for (const l of c.repetition ? c.repetition.member_labels : c.source.labels) claimed.add(l);
            }
            const own = packet.destinations.filter((d) => d.document_id === i.artifact.document_id);
            const orphans = own.filter((d) => !claimed.has(d.label));
            expect(orphans.map((o) => o.label), `${i.artifact.document_id} has semantically orphaned destinations`).toEqual([]);
        }
    });

    it("13 recognized collections and 1 relationship stand for 80 of the packet's destinations", () => {
        const collections = inputs.flatMap((i) => i.discovery.concepts.filter((c) => !!c.repetition));
        expect(collections).toHaveLength(13);
        const relationships = inputs.flatMap((i) => i.discovery.concepts.filter((c) => c.kind === "relationship_group"));
        const covered =
            collections.reduce((n, c) => n + c.repetition!.member_names.length, 0) +
            relationships.reduce((n, c) => n + c.source.labels.length, 0);
        expect(covered).toBe(80);
    });
});

describe("Slice 5 — a settled owner elsewhere is a state, not a blank", () => {
    it("holds every immunization destination on the CIS instead of offering to store it here", () => {
        const held = inputs.flatMap((i) =>
            i.discovery.proposals
                .filter((p) => p.disposition === "held_for_canonical_owner")
                .map((p) => ({ doc: i.artifact.document_id, hold: p.ownership_hold!, proposal: p })),
        );
        const cis = held.filter((h) => h.doc === "doc-cis");
        expect(cis).toHaveLength(9);
        expect(cis.every((h) => h.hold.state === "AWAITING_HEALTH_FOUNDATION")).toBe(true);
        // Eight dose schedules plus the free "other vaccines" table. None of their labels contains a
        // word a general rule could match — `Hib`, `Tdap`, `Hep A`. The dose STRUCTURE is the signal.
        expect(cis.every((h) => h.proposal.proposed_field === undefined)).toBe(true);
    });

    it("holds the two safeguarding questions with NO owner, not as health data", () => {
        const safeguarding = inputs.flatMap((i) =>
            i.discovery.proposals.filter((p) => p.ownership_hold?.state === "NEEDS_CANONICAL_SAFEGUARDING_OWNER"),
        );
        expect(safeguarding).toHaveLength(2);
        expect(safeguarding.every((p) => p.ownership_hold!.owner === null)).toBe(true);
    });

    it("holds twelve facts in total, and creates a field for none of them", () => {
        const held = inputs.flatMap((i) => i.discovery.proposals.filter((p) => p.disposition === "held_for_canonical_owner"));
        expect(held).toHaveLength(12);
        expect(held.every((p) => p.proposed_field === undefined), "a held fact must carry nothing creatable").toBe(true);
        expect(held.every((p) => p.explanation.length > 0), "the operator must be told why").toBe(true);
    });

    it("still counts every held destination — holding is not dropping", () => {
        // The reconciliation checker is the guard: it fails if any source destination disappears or
        // is counted twice, and it runs over the same packet these holds came from.
        const destinations = packet.destinations.length;
        expect(destinations).toBe(NORMALIZED_DESTINATIONS);
    });
});

describe("nothing is published", () => {
    it("every proposal in every source is still proposed", () => {
        for (const i of inputs) expect(i.discovery.proposals.every((p) => p.decision_state === "proposed")).toBe(true);
        expect(packet.correlations.every((c) => c.decision_state === "proposed")).toBe(true);
        expect(packet.obligations.every((o) => o.decision_state === "proposed")).toBe(true);
    });
});
