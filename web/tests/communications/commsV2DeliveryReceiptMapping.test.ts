import { describe, expect, it } from "vitest";
import {
    resendTypeToCanonical,
    twilioStatusToCanonical,
    recipientStateForEvent,
    messageReceiptFieldForEvent,
    resolveProviderEventId,
} from "@/lib/communications/v2/deliveryReceiptMapping";

describe("P2 delivery receipt mapping (pure)", () => {
    it("maps Resend event types to canonical events", () => {
        expect(resendTypeToCanonical("email.sent")).toBe("sent");
        expect(resendTypeToCanonical("email.delivered")).toBe("delivered");
        expect(resendTypeToCanonical("email.opened")).toBe("opened");
        expect(resendTypeToCanonical("email.clicked")).toBe("clicked");
        expect(resendTypeToCanonical("email.bounced")).toBe("bounced");
        expect(resendTypeToCanonical("email.complained")).toBe("complaint");
        expect(resendTypeToCanonical("email.failed")).toBe("failed");
        expect(resendTypeToCanonical("email.delivery_delayed")).toBeNull();
        expect(resendTypeToCanonical("nonsense")).toBeNull();
    });

    it("maps Twilio statuses to canonical events", () => {
        expect(twilioStatusToCanonical("queued")).toBe("queued");
        expect(twilioStatusToCanonical("accepted")).toBe("queued");
        expect(twilioStatusToCanonical("sent")).toBe("sent");
        expect(twilioStatusToCanonical("delivered")).toBe("delivered");
        expect(twilioStatusToCanonical("failed")).toBe("failed");
        expect(twilioStatusToCanonical("undelivered")).toBe("failed");
        expect(twilioStatusToCanonical("read")).toBeNull();
    });

    it("maps canonical events to recipient timestamp column + status", () => {
        expect(recipientStateForEvent("delivered")).toEqual({ field: "delivered_at", status: "delivered" });
        expect(recipientStateForEvent("opened")).toEqual({ field: "opened_at", status: "opened" });
        expect(recipientStateForEvent("complaint")).toEqual({ field: "complained_at", status: "complained" });
        expect(recipientStateForEvent("failed")).toEqual({ field: "failed_at", status: "failed" });
        expect(recipientStateForEvent("inbound")).toEqual({ field: null, status: null });
    });

    it("maps message receipt columns for open/click/reply only", () => {
        expect(messageReceiptFieldForEvent("opened")).toBe("opened_at");
        expect(messageReceiptFieldForEvent("clicked")).toBe("clicked_at");
        expect(messageReceiptFieldForEvent("replied")).toBe("replied_at");
        expect(messageReceiptFieldForEvent("delivered")).toBeNull();
    });

    it("prefers an explicit provider event id, else synthesizes a deterministic one", () => {
        expect(resolveProviderEventId("resend", "pid-1", "delivered", "evt_abc")).toBe("evt_abc");
        expect(resolveProviderEventId("twilio", "SM123", "delivered")).toBe("twilio:SM123:delivered");
        expect(resolveProviderEventId("twilio", "SM123", "delivered", "  ")).toBe("twilio:SM123:delivered");
    });
});
