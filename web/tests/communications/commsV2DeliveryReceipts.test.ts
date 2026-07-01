import { describe, expect, it } from "vitest";
import { receiptStateFromMessage, receiptStateRank } from "@/lib/communications/v2/deliveryReceipts";

/** PKG-03 — pure receipt-state adapter precedence. */
describe("receiptStateFromMessage", () => {
    it("returns queued with no signals", () => {
        expect(receiptStateFromMessage({})).toBe("queued");
    });
    it("escalates sent → delivered → opened → clicked → replied", () => {
        expect(receiptStateFromMessage({ sent_at: "t" })).toBe("sent");
        expect(receiptStateFromMessage({ sent_at: "t", delivered_at: "t" })).toBe("delivered");
        expect(receiptStateFromMessage({ delivered_at: "t", opened_at: "t" })).toBe("opened");
        expect(receiptStateFromMessage({ opened_at: "t", clicked_at: "t" })).toBe("clicked");
        expect(receiptStateFromMessage({ clicked_at: "t", replied_at: "t" })).toBe("replied");
    });
    it("treats reply as most advanced even if earlier receipts are absent", () => {
        expect(receiptStateFromMessage({ replied_at: "t" })).toBe("replied");
    });
    it("maps status sent variants to sent", () => {
        expect(receiptStateFromMessage({ status: "provider_accepted" })).toBe("sent");
        expect(receiptStateFromMessage({ status: "sent_to_provider" })).toBe("sent");
    });
    it("terminal failure/bounce takes precedence over receipts", () => {
        expect(receiptStateFromMessage({ status: "bounced", opened_at: "t" })).toBe("bounced");
        expect(receiptStateFromMessage({ status: "failed", delivered_at: "t" })).toBe("failed");
    });
    it("ignores blank-string timestamps", () => {
        expect(receiptStateFromMessage({ opened_at: "  ", sent_at: "t" })).toBe("sent");
    });
    it("ranks states monotonically along the ladder", () => {
        expect(receiptStateRank("sent")).toBeLessThan(receiptStateRank("delivered"));
        expect(receiptStateRank("opened")).toBeLessThan(receiptStateRank("replied"));
    });
});
