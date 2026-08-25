/** @vitest-environment jsdom */

/**
 * The packet review, rendered.
 *
 * This is component verification, not browser verification: it mounts the real component with the
 * real packet composed from the certification corpus and drives the real controls. What it cannot
 * show is the page in a signed-in browser — the slot's QA session expired and the toolkit makes
 * signing in a human step, which is reported rather than simulated.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import PacketIntakeReview, { type PacketFactRow } from "@/app/adminV2/pos/PacketIntakeReview";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import type { PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";
import type { PacketReviewDecision } from "@/lib/pos/packetIntake/packetIntakeDb";

const OBLIGATION = new Set(["acknowledgement", "upload_requirement", "signature"]);

let packet: PacketIntakeResult;
let facts: PacketFactRow[];
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let recorded: Array<Omit<PacketReviewDecision, "decided_by" | "decided_at">>;

beforeAll(async () => {
    const inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing"));
    packet = composePacket(inputs);
    facts = [];
    for (const src of packet.sources) {
        const a = packet.source_analysis[src.document_id];
        if (!a) continue;
        const byCandidate = new Map(a.proposals.map((p) => [p.candidate_id, p]));
        for (const c of a.concepts) {
            if (OBLIGATION.has(c.kind)) continue;
            const proposal = byCandidate.get(c.id);
            if (proposal) facts.push({ id: proposal.id, concept: c, proposal, documentId: src.document_id, documentTitle: src.title });
        }
    }
}, 300_000);

beforeEach(() => {
    recorded = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function mount(decisions: Record<string, PacketReviewDecision> = {}) {
    act(() => {
        root.render(
            <PacketIntakeReview
                packet={packet}
                facts={facts}
                decisions={decisions}
                onDecision={(d) => recorded.push(d)}
                onRenameArtifact={(id, name) => recorded.push({ subject: "artifact", subject_id: id, decision: "renamed", name })}
            />
        );
    });
}
const click = (testId: string) => act(() => {
    container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click();
});

describe("the operator reviews the packet, not three importer runs", () => {
    it("opens on the packet layer with its own reconciliation", () => {
        mount();
        expect(container.querySelector('[data-testid="packet-intake-review"]')).toBeTruthy();
        const recon = container.querySelector('[data-testid="packet-reconciliation"]')!.textContent ?? "";
        expect(recon).toContain("Balanced");
        expect(recon).toContain("180 of 180");
        expect(recon).toContain("97 source → 95 normalized");
    });

    it("shows every logical artifact, and marks the ones needing a name", () => {
        mount();
        for (const a of packet.artifacts) {
            expect(container.querySelector(`[data-testid="packet-artifact-${a.id}"]`), a.id).toBeTruthy();
        }
        const page1 = container.querySelector('[data-testid="packet-artifact-1:page_1"]')!.textContent ?? "";
        expect(page1).toContain("Needs a name");
        const tuition = container.querySelector('[data-testid="packet-artifact-2:tuition_enrollment_agreement"]')!.textContent ?? "";
        expect(tuition).toContain("Tuition & Enrollment Agreement");
        expect(tuition).not.toContain("Needs a name");
    });

    it("reviews at the grain of facts, with destinations underneath as evidence", () => {
        mount();
        click("packet-layer-facts");
        const rows = container.querySelectorAll('[data-testid^="packet-fact-"]');
        expect(rows.length).toBeGreaterThan(0);
        // A fact opens its lineage on demand — the operator is never shown 180 destinations at once.
        const guardian = facts.find((f) => f.documentId === "doc-formsite" && f.concept.concept_key === "guardian.name")!;
        expect(container.querySelector(`[data-testid="packet-fact-lineage-${guardian.id}"]`)).toBeNull();
        click(`packet-fact-evidence-${guardian.id}`);
        const lineage = container.querySelector(`[data-testid="packet-fact-lineage-${guardian.id}"]`)!.textContent ?? "";
        expect(lineage).toContain("hosted_form:q1:RESULT_TextField-7");
        expect(lineage).toContain("Contact Information");
    });

    it("shows a refused binding as a refusal, with its reason", () => {
        mount();
        click("packet-layer-facts");
        const refused = facts.find((f) => !!f.proposal.refused_binding)!;
        const row = container.querySelector(`[data-testid="packet-fact-${refused.id}"]`)!.textContent ?? "";
        expect(row).toContain("refused customer.address");
        expect(row).toContain("belongs to the household");
    });

    it("shows where a fact will live when its owner is a relationship, not a field", () => {
        mount();
        click("packet-layer-facts");
        const provider = facts.find((f) => f.proposal.target_relationship_role === "physician")!;
        const row = container.querySelector(`[data-testid="packet-fact-${provider.id}"]`)!.textContent ?? "";
        // The operator is told WHERE it lands, in their language — not which field key matched.
        expect(row).toContain("A linked person");
        expect(row).toContain("physician relationship");
        expect(row).toContain("linked through the Physicians relationship");
    });

    it("separates collections from scalar facts", () => {
        mount();
        click("packet-layer-collections");
        expect(container.querySelector('[data-testid="packet-collections-list"]'), "the collections layer must render").toBeTruthy();
        const rows = container.querySelectorAll('[data-testid="packet-collections-list"] > [data-testid^="packet-fact-"]');
        expect(rows.length).toBe(facts.filter((f) => !!f.concept.repetition || f.concept.kind === "relationship_group").length);
        expect(container.textContent).toContain("×5");
    });

    it("shows obligations with the artifact each signature executes", () => {
        mount();
        click("packet-layer-obligations");
        const text = container.textContent ?? "";
        expect(text).toContain("Tuition & Enrollment Agreement");
        expect(text).toContain("update");
        expect(container.querySelectorAll('[data-testid^="packet-signature-"]').length).toBe(6);
    });
});

describe("review decisions", () => {
    it("records accept, form-only and reject against the proposal's stable id", () => {
        mount();
        click("packet-layer-facts");
        const f = facts.find((x) => x.proposal.disposition === "reuse_canonical_field")!;
        click(`packet-fact-accept-${f.id}`);
        click(`packet-fact-form-only-${f.id}`);
        click(`packet-fact-reject-${f.id}`);
        expect(recorded.map((d) => d.decision)).toEqual(["accepted", "form_only", "rejected"]);
        expect(recorded.every((d) => d.subject === "fact" && d.subject_id === f.id)).toBe(true);
        // An accepted binding carries the field it was accepted FOR.
        expect(recorded[0].field_source).toEqual(f.proposal.target_field_source);
    });

    it("lets the operator name an artifact the source could not name", () => {
        mount();
        click("packet-artifact-rename-1:page_1");
        const input = container.querySelector<HTMLInputElement>('[data-testid="packet-artifact-rename-input-1:page_1"]')!;
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
            setter.call(input, "Vaccination record");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        click("packet-artifact-rename-save-1:page_1");
        expect(recorded).toEqual([{ subject: "artifact", subject_id: "1:page_1", decision: "renamed", name: "Vaccination record" }]);
    });

    it("confirms an obligation's classification", () => {
        mount();
        click("packet-layer-obligations");
        const o = packet.obligations[0];
        click(`packet-obligation-confirm-${o.id}`);
        expect(recorded).toEqual([{ subject: "obligation", subject_id: o.id, decision: "confirmed" }]);
    });

    it("reflects decisions already recorded, and says nothing is published", () => {
        const f = facts.find((x) => !x.concept.repetition && x.concept.kind !== "relationship_group")!;
        mount({ [`fact:${f.id}`]: { subject: "fact", subject_id: f.id, decision: "accepted", decided_by: "op", decided_at: "now" } });
        expect(container.querySelector('[data-testid="packet-decision-count"]')!.textContent).toContain("1 decision recorded");
        expect(container.textContent).toContain("nothing published");
        click("packet-layer-facts");
        expect(container.querySelector(`[data-testid="packet-fact-${f.id}"]`)!.textContent).toContain("accepted");
    });
});
