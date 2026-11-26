/**
 * The question before a terminal outcome closes a Tour that is still ahead is Alloy's own dialog, in the
 * operator's words — the Tour's real date in its own timezone, the outcome's real label, and two named
 * choices — never the browser's "<host> says…".
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatScheduledTourWhen, scheduledTourCloseConfirmRequest } from "@/lib/lifecycle/scheduledTourCloseConfirmation";

describe("scheduledTourCloseConfirmRequest", () => {
    it("names the tour's date in its timezone and the outcome being recorded", () => {
        const req = scheduledTourCloseConfirmRequest({
            confirmation: { kind: "tour_still_scheduled", message: "server message", tour: { booking_id: "b", start_at: "2026-10-23T16:00:00Z", timezone: "America/Los_Angeles" } },
            outcomeLabel: "Tour Completed — Interested",
        });
        expect(req).toMatchObject({ title: "Close scheduled tour?", confirmLabel: "Record outcome", cancelLabel: "Keep tour scheduled" });
        expect(req.body).toBe('This tour is scheduled for Friday, Oct 23 at 9:00 AM. Recording "Tour Completed — Interested" will close the scheduled tour.');
    });

    it("falls back to the server's own sentence when the start is unknown", () => {
        const req = scheduledTourCloseConfirmRequest({ confirmation: { kind: "x", message: "This Tour is still scheduled…" }, outcomeLabel: null });
        expect(req.body).toBe("This Tour is still scheduled…");
        expect(formatScheduledTourWhen("not-a-date", null)).toBeNull();
    });
});

describe("no browser confirm on the operator outcome paths", () => {
    const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    it.each([
        "components/admin/focusPanel/cards/CurrentWorkCard.tsx",
        "app/adminV2/components/MyTasksPanel.tsx",
        "components/admin/focusPanel/cards/BusinessProcessCard.tsx",
    ])("%s asks through Alloy's dialog", (rel) => {
        const src = read(rel);
        expect(src).not.toMatch(/window\.confirm\(/);
        expect(src).toContain("useAlloyConfirm");
    });
});
