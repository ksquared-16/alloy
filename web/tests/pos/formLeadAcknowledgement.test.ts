import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildApprovalResultView } from "@/lib/pos/approvalResultPresentation";
import { buildLeadAcknowledgementView } from "@/lib/pos/leadAcknowledgementPresentation";
import { processingStatusFolderCounts } from "@/lib/pos/processingQueueBadgeCounts";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const records = { household: "h1", child: "c1", person: "p1", lead: "o1", participation: "ocm1" };

describe("post-approval acknowledgement", () => {
    it("a new family: Lead created, Open Lead first, every record with a destination offered", () => {
        const v = buildLeadAcknowledgementView({
            kind: "lead",
            recordId: "o1",
            records,
            createdRecords: { household: true, child: true, person: true, lead: true },
            matchedExisting: false,
        });
        expect(v.title).toBe("Lead created");
        expect(v.matched).toBe(false);
        expect(v.actions).toEqual(["open_lead", "contact_family", "update_information", "open_person", "open_child"]);
    });

    it("a matched family never reads as created", () => {
        const v = buildLeadAcknowledgementView({
            kind: "lead",
            recordId: "o1",
            records,
            createdRecords: { household: false, child: false, person: false, lead: true },
            matchedExisting: true,
        });
        expect(v.matched).toBe(true);
        expect(v.title).toBe("Lead added to an existing family");
        expect(v.body).toMatch(/No new family was created/);
        expect(`${v.title} ${v.body}`).not.toMatch(/new family is now/i);
    });

    it("offers no destination that does not exist", () => {
        const v = buildLeadAcknowledgementView({ kind: "lead", recordId: null, records: null });
        expect(v.actions).toEqual([]);
        const noChild = buildLeadAcknowledgementView({ kind: "lead", recordId: "o1", records: { ...records, child: null } });
        expect(noChild.actions).not.toContain("open_child");
    });

    it("linked records are listed as Linked, not Created, once the server states created-vs-linked", () => {
        const view = buildApprovalResultView({
            cards: [
                { role: "parent", name: "Ravi Smith", basisTone: "new" } as never,
                { role: "child", name: "Kai Ravi", basisTone: "new" } as never,
            ],
            records,
            createdRecords: { household: false, child: false, person: false, lead: true },
        });
        expect(view.created.map((l) => l.primary)).not.toContain("Ravi Smith");
        expect(view.created.map((l) => l.primary)).not.toContain("Kai Ravi");
        expect(view.linked.map((l) => l.primary)).toEqual(expect.arrayContaining(["Ravi Smith", "Kai Ravi"]));
    });

    it("Processing never advances on its own after approval", () => {
        const src = read("app/adminV2/pos/PosProcessingWorkspace.tsx");
        expect(src).not.toMatch(/setTimeout\(/);
        expect(src).toContain("onNextItem");
        expect(src).toContain("onReturnToQueue");
    });

    it("records open through the canonical focus paths, never a blind router.push", () => {
        const src = read("app/adminV2/pos/ProcessingLeadAcknowledgement.tsx");
        expect(src).toContain("resolveOpenLeadFocusPanelHref(");
        expect(src).toContain("openCreatedLead(");
        expect(src).toContain("useOperatorRecordFocus(");
        // The only push is the one openCreatedLead uses for a genuine cold entry.
        expect(src.match(/router\.push\(/g) ?? []).toHaveLength(1);
        expect(src).toContain("push: (h) => router.push(h)");
    });
});

describe("Incoming / Completed badges", () => {
    it("count every open case org-wide, not the loaded page", () => {
        expect(
            processingStatusFolderCounts(
                { received: 139, needs_resolution: 6, needs_review: 2, completed: 40, archived: 2 },
                { incoming: 25, completed: 0 },
            ),
        ).toEqual({ incoming: 147, completed: 42 });
    });

    it("a new submission moves Incoming", () => {
        const before = processingStatusFolderCounts({ needs_resolution: 30 }, { incoming: 25, completed: 0 });
        const after = processingStatusFolderCounts({ needs_resolution: 31 }, { incoming: 25, completed: 0 });
        expect(after.incoming).toBe(before.incoming + 1);
    });

    it("falls back to loaded rows when the server sent no counts", () => {
        expect(processingStatusFolderCounts(undefined, { incoming: 3, completed: 1 })).toEqual({ incoming: 3, completed: 1 });
    });
});
