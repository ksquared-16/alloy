/**
 * POS-FP16 / M5A — rerun reconciliation certification.
 *
 * A detector rerun must never silently erase operator decisions. Semantic identity is the anchor:
 * decisions survive an inserted page, a renamed section, and a detector-version bump; they go stale
 * only when the concept materially changes; removed concepts stay auditable; new concepts are pending.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { buildLayoutLines } from "@/lib/pos/processingCase/structure/pdfLayoutLines";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import type { LayoutDocument, LayoutTextItem } from "@/lib/pos/processingCase/structure/pdfLayoutTypes";
import { discoverConfiguration } from "@/lib/pos/discovery/discoverConfiguration";
import type { BusinessConceptCandidate } from "@/lib/pos/discovery/contracts";
import {
    reconcileDiscovery,
    semanticConceptIdentity,
    sourceOccurrenceIdentity,
    type DiscoveryDecisionRecord,
} from "@/lib/pos/discovery/reconciliation";

type Geom = { pageCount: number; pages: { page: number; width: number; height: number; items: LayoutTextItem[] }[] };

function fixtureConcepts(): BusinessConceptCandidate[] {
    const g = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/enrollment-record-8.25.geom.json"), "utf8")) as Geom;
    const doc: LayoutDocument = {
        pageCount: g.pageCount,
        ok: true,
        reason: null,
        pages: g.pages.map((p) => ({ page: p.page, width: p.width, height: p.height, lines: buildLayoutLines(p.items.map((it) => ({ s: it.s, x: it.x, y: it.y, w: it.w, h: it.h, fh: it.fh })), p.page) })),
    };
    return discoverConfiguration({ structure: detectLayoutStructure(doc) }).concepts;
}

/** Simulate an operator accepting a concept — a durable decision record. */
function acceptDecision(c: BusinessConceptCandidate): DiscoveryDecisionRecord {
    return {
        semantic_identity: semanticConceptIdentity(c),
        source_occurrence: sourceOccurrenceIdentity(c),
        proposal_identity: `${semanticConceptIdentity(c)}#accepted`,
        decision_state: "accepted",
        actor: "kelly@kurzmancapital.com",
        decided_at: "2026-07-28T00:00:00Z",
    };
}

const concepts = fixtureConcepts();
const childName = concepts.find((c) => c.concept_key === "child.name")!;
const guardians = concepts.find((c) => c.concept_key === "relationship.guardian")!;
const dob = concepts.find((c) => c.concept_key === "child.date_of_birth")!;

describe("M5A — rerun reconciliation", () => {
    it("an identical rerun preserves every decision as unchanged", () => {
        const decisions = [acceptDecision(childName), acceptDecision(guardians), acceptDecision(dob)];
        const r = reconcileDiscovery(decisions, concepts);
        expect(r.counts.unchanged).toBe(3);
        expect(r.counts.stale + r.counts.removed + r.counts.ambiguous).toBe(0);
        expect(r.reconciled.filter((d) => d.decision_state === "accepted").length).toBe(3);
    });

    it("a renamed section moves the decision (semantic identity survives location change)", () => {
        const decisions = [acceptDecision(childName)];
        // Rerun where the section was renamed → source occurrence id changes, concept_key unchanged.
        const renamed = concepts.map((c) =>
            c.concept_key === "child.name"
                ? { ...c, id: c.id.replace(/:[^:]+:/, ":renamed_section:"), source: { ...c.source, section_key: "renamed_section", section_title: "Renamed Section" } }
                : c,
        );
        const r = reconcileDiscovery(decisions, renamed);
        const entry = r.entries.find((e) => e.semantic_identity === semanticConceptIdentity(childName));
        expect(entry?.status).toBe("moved");
        expect(entry?.decision?.decision_state).toBe("accepted");
    });

    it("an inserted page (shifted page numbers) still preserves decisions by semantics", () => {
        const decisions = [acceptDecision(dob)];
        // Simulate every concept's page +1 (a page inserted before) → occurrence changes, semantics not.
        const shifted = concepts.map((c) => ({ ...c, id: c.id.replace(/^\d+:/, (m) => `${parseInt(m) + 1}:`), source: { ...c.source, page: c.source.page + 1 } }));
        const r = reconcileDiscovery(decisions, shifted);
        expect(r.counts.moved).toBe(1);
        expect(r.counts.stale + r.counts.removed).toBe(0);
    });

    it("a detector-version bump with identical structure preserves decisions", () => {
        // Same concepts (a version bump does not change concept_key/subject) → unchanged.
        const decisions = [acceptDecision(childName), acceptDecision(guardians)];
        const r = reconcileDiscovery(decisions, concepts);
        expect(r.counts.unchanged).toBe(2);
    });

    it("a materially changed concept marks the old decision stale and the new one pending", () => {
        const decisions = [acceptDecision(childName)];
        // Rerun where child.name is gone and a different concept appears in its place.
        const changed = concepts
            .filter((c) => c.concept_key !== "child.name")
            .concat([{ ...childName, id: "1:contact_information:field_changed", concept_key: "child.legal_name", label: "Legal Name" }]);
        const r = reconcileDiscovery(decisions, changed);
        // old child.name decision has no match → stale (it was decided); new child.legal_name → new.
        expect(r.entries.some((e) => e.status === "stale" && e.semantic_identity === semanticConceptIdentity(childName))).toBe(true);
        expect(r.entries.some((e) => e.status === "new" && /child\.legal_name/.test(e.semantic_identity))).toBe(true);
    });

    it("a removed concept with only a proposed (undecided) state is kept auditable, not stale", () => {
        const proposed: DiscoveryDecisionRecord = { ...acceptDecision(childName), decision_state: "proposed" };
        const withoutChild = concepts.filter((c) => c.concept_key !== "child.name");
        const r = reconcileDiscovery([proposed], withoutChild);
        expect(r.counts.removed).toBe(1);
        expect(r.counts.stale).toBe(0);
    });

    it("separates source-occurrence identity from semantic identity", () => {
        // Two different source occurrences of the same semantic concept share a semantic identity.
        expect(sourceOccurrenceIdentity(childName)).not.toBe(semanticConceptIdentity(childName));
        expect(semanticConceptIdentity(childName)).toContain("child.name");
    });
});
