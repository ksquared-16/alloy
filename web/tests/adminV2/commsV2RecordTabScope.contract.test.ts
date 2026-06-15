import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** PKG-13 — the record tab is relationship-scoped: dark + NO command-center surfaces. */
describe("record tab scope", () => {
    const src = readFileSync(
        join(process.cwd(), "app", "adminV2", "communications", "recordTab", "RecordCommunicationsTab.tsx"),
        "utf8"
    );
    it("self-gates behind comms_v2_record_tab", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_record_tab["']\)/);
        expect(src).toMatch(/return null/);
    });
    it("includes timeline + health + consent + quick reply", () => {
        expect(src).toMatch(/data-cc-record-timeline/);
        expect(src).toMatch(/data-cc-record-health/);
        expect(src).toMatch(/data-cc-record-consent/);
        expect(src).toMatch(/data-cc-record-quickreply/);
    });
    it("excludes inbox/assignment/deliverability/bulk tools", () => {
        const body = src.replace(/\/\*[\s\S]*?\*\//g, ""); // ignore the doc comment
        expect(body).not.toMatch(/deliverability/i);
        expect(body).not.toMatch(/\bbulk\b/i);
        expect(body).not.toMatch(/reassign|unassign|assignment/i);
        expect(body).not.toMatch(/InboxModal|inbox folder/i);
    });
});
