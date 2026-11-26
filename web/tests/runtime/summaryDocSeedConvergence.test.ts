// @vitest-environment jsdom
/**
 * S5-3 — THE SUMMARY DOCUMENT IS IDENTIFIED, NOT RETRANSMITTED.
 *
 * MEASURED (Slices 5/7): `provisioning.focusPanelSummaryDoc.doc` is byte-identical to the published
 * record the client already owns via `usePublishedFocusPanelSummaryDoc`, and the seed carried a bare
 * `{ doc }` with no identity — so omission could not even be expressed. ~27 KB rode every answer.
 *
 * The contract is now `{ id, version, doc? }`, and the two properties that make omission safe are:
 *   IDENTITY — `id` AND `version` together. Two published records can share a version number, so
 *              version-only matching would serve one record's document for another.
 *   KEYED    — the client's claim changes what the answer CONTAINS, so it must be part of the
 *              provisioning request key (the Slice 2 coalescing law, as applied in Slice 12).
 */

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { provisioningAnswerUrl } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import {
    heldFocusPanelSummaryIdentities,
    __focusPanelSummaryFreshnessTestApi as api,
} from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
const composer = read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts");
const route = read("app/api/admin/work-units/[id]/provisioning-answer/route.ts");
const hook = read("lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc.ts");

beforeEach(() => api.reset());

describe("what the client claims to hold", () => {
    it("claims nothing when it holds nothing", () => {
        expect(heldFocusPanelSummaryIdentities()).toEqual([]);
    });

    it("claims id:version pairs, never versions alone", () => {
        // A claim is only meaningful with both halves — this is the shape the server compares.
        expect(String(heldFocusPanelSummaryIdentities())).not.toMatch(/^\d+$/);
        expect(composer).toMatch(/`\$\{summaryRecord\.id\}:\$\{summaryRecord\.version\}`/);
    });
});

describe("the claim participates in the provisioning request key", () => {
    it("changes the URL, so an omitting answer is never confused with an including one", () => {
        const plain = provisioningAnswerUrl("all", "wv6", "subj");
        const claimed = provisioningAnswerUrl("all", "wv6", "subj", null, null, undefined, ["rec-1:153"]);
        expect(claimed).not.toBe(plain);
        expect(claimed).toContain("summary_cfg=rec-1%3A153");
    });

    it("is stable and order-independent, so a prewarm and the click that consumes it coalesce", () => {
        const a = provisioningAnswerUrl("all", "wv6", "subj", null, null, undefined, ["b:2", "a:1"]);
        const b = provisioningAnswerUrl("all", "wv6", "subj", null, null, undefined, ["a:1", "b:2"]);
        expect(a).toBe(b);
    });

    it("distinguishes different held identities", () => {
        const a = provisioningAnswerUrl("all", "wv6", "subj", null, null, undefined, ["a:1"]);
        const b = provisioningAnswerUrl("all", "wv6", "subj", null, null, undefined, ["a:2"]);
        expect(a).not.toBe(b);
    });
});

describe("LOCKS — the server validates, the client only claims", () => {
    it("compares the claim against the record IT resolved, with BOTH id and version", () => {
        expect(composer).toMatch(/summaryConfigHeldIds \?\? \[\]\)\.includes\(`\$\{summaryRecord\.id\}:\$\{summaryRecord\.version\}`\)/);
    });

    it("always carries identity, and omits only the document", () => {
        expect(composer).toMatch(/id: summaryRecord\?\.id \?\? null/);
        expect(composer).toMatch(/\.\.\.\(summaryHeldByClient \? \{\} : \{ doc: summaryRecord\?\.doc \?\? null \}\)/);
    });

    it("parses the claim strictly as id:version", () => {
        expect(route).toMatch(/\[0-9a-f-\]\{36\}:/);
    });

    it("never treats a doc-less seed as a rendered document", () => {
        // Rendering `{doc: undefined, loaded: true}` would blank the Summary while identity resolves.
        expect(hook).toMatch(/const seedDoc = seed\?\.doc \?\? heldDocForIdentity\(/);
        expect(hook).toMatch(/if \(!fetched\.loaded && seedDoc != null\)/);
    });

    it("resolves an omitted document from what it already holds, rather than refetching", () => {
        expect(hook).toMatch(/function heldDocForIdentity/);
        expect(hook).toMatch(/slot\.id === id && slot\.version === version && slot\.doc != null/);
    });
});
