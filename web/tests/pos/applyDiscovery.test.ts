/**
 * POS-FP16 / M5C — apply approved configuration: certification.
 *
 * Proves apply consumes only approved proposals, produces a structured per-proposal result (not a
 * boolean), writes real field bindings onto the draft, projects relationships through the canonical
 * provider, requires explicit confirmation for new fields, and is idempotent (re-apply → no-op).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { buildLayoutLines } from "@/lib/pos/processingCase/structure/pdfLayoutLines";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import type { LayoutDocument, LayoutTextItem } from "@/lib/pos/processingCase/structure/pdfLayoutTypes";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { discoverConfiguration } from "@/lib/pos/discovery/discoverConfiguration";
import { applyDiscovery } from "@/lib/pos/discovery/applyDiscovery";
import type { ProposalDecisionState } from "@/lib/pos/discovery/contracts";

type Geom = { pageCount: number; pages: { page: number; width: number; height: number; items: LayoutTextItem[] }[] };

function fixture() {
    const g = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/enrollment-record-8.25.geom.json"), "utf8")) as Geom;
    const doc: LayoutDocument = {
        pageCount: g.pageCount, ok: true, reason: null,
        pages: g.pages.map((p) => ({ page: p.page, width: p.width, height: p.height, lines: buildLayoutLines(p.items.map((it) => ({ s: it.s, x: it.x, y: it.y, w: it.w, h: it.h, fh: it.fh })), p.page) })),
    };
    const structure = detectLayoutStructure(doc);
    const draft = buildFormDraftFromStructure({ structure, sourceDocumentId: "doc1", extractedText: "", extractedTextAvailable: true });
    const discovery = discoverConfiguration({ structure });
    draft.configuration_discovery = discovery;
    return { draft, discovery };
}

function acceptAll(discovery: ReturnType<typeof fixture>["discovery"]): Record<string, ProposalDecisionState> {
    const d: Record<string, ProposalDecisionState> = {};
    for (const p of discovery.proposals) d[p.id] = "accepted";
    return d;
}

describe("M5C — apply approved configuration", () => {
    const { draft, discovery } = fixture();
    const decisions = acceptAll(discovery);

    it("produces a structured per-proposal result, not a boolean", () => {
        const { result } = applyDiscovery({ draft, discovery, decisions });
        expect(result.results.length).toBe(discovery.proposals.length);
        expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(discovery.proposals.length);
    });

    it("binds reuse_canonical_field proposals to the draft form questions (real configuration)", () => {
        const { updatedDraft, result } = applyDiscovery({ draft, discovery, decisions });
        const childName = discovery.proposals.find((p) => /Child's Name/.test(discovery.concepts.find((c) => c.id === p.candidate_id)!.label))!;
        const applied = result.results.find((r) => r.proposal_id === childName.id);
        expect(applied?.outcome).toBe("applied");
        expect((applied?.bound_field_ids ?? []).length).toBeGreaterThan(0);
        // the binding is written onto the draft (drives the published form)
        const boundField = updatedDraft.fields.find((f) => applied!.bound_field_ids!.includes(f.id));
        expect(boundField?.field_source).toEqual(expect.objectContaining({ entity_type: "customer_member", field_key: "display_name" }));
    });

    it("projects relationships through the canonical collection provider (not flat fields)", () => {
        const { result } = applyDiscovery({ draft, discovery, decisions });
        const rel = result.results.filter((r) => r.disposition === "relationship_binding" && r.outcome === "applied");
        expect(rel.length).toBe(3);
        expect(rel.some((r) => r.provider_ref === "person.contact_role.emergency_contacts")).toBe(true);
        expect(rel.some((r) => r.provider_ref === "person.contact_role.authorized_pickups")).toBe(true);
    });

    it("requires explicit confirmation before creating a new field", () => {
        const { result } = applyDiscovery({ draft, discovery, decisions });
        const newFieldResults = result.results.filter((r) => r.disposition === "create_proposed_field");
        expect(newFieldResults.every((r) => r.outcome === "requires_confirmation")).toBe(true);
        // when confirmed, the field is PREPARED for the Field System (never silently created here)
        const hospital = discovery.proposals.find((p) => /Preferred Hospital/.test(discovery.concepts.find((c) => c.id === p.candidate_id)!.label))!;
        const confirmed = applyDiscovery({ draft, discovery, decisions, confirmedNewFields: new Set([hospital.id]) });
        const prepared = confirmed.result.results.find((r) => r.proposal_id === hospital.id);
        expect(prepared?.prepared_field?.data_type).toBe("select");
    });

    it("applies requirement/acknowledgement/signature/static/output dispositions", () => {
        const { result } = applyDiscovery({ draft, discovery, decisions });
        for (const disp of ["upload_requirement", "acknowledgement", "signature_requirement", "output_binding"] as const) {
            expect(result.results.some((r) => r.disposition === disp && r.outcome === "applied")).toBe(true);
        }
    });

    it("skips form-only responses and non-accepted proposals", () => {
        // accept nothing
        const { result } = applyDiscovery({ draft, discovery, decisions: {} });
        expect(result.counts.applied).toBe(0);
        expect(result.counts.skipped).toBe(discovery.proposals.length);
    });

    it("is idempotent — re-applying with the ledger is a no-op", () => {
        const first = applyDiscovery({ draft, discovery, decisions });
        const appliedFirst = first.result.counts.applied;
        expect(appliedFirst).toBeGreaterThan(0);
        const second = applyDiscovery({ draft, discovery, decisions, ledger: first.result.ledger });
        expect(second.result.counts.applied).toBe(0);
        expect(second.result.counts.already_applied).toBe(appliedFirst);
        // ledger does not grow on re-apply
        expect(second.result.ledger.length).toBe(first.result.ledger.length);
    });

    it("does not mutate the input draft (apply is pure)", () => {
        const before = JSON.stringify(draft.fields.map((f) => f.field_source ?? null));
        applyDiscovery({ draft, discovery, decisions });
        expect(JSON.stringify(draft.fields.map((f) => f.field_source ?? null))).toBe(before);
    });
});
