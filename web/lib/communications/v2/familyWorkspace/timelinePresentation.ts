// UI-6 — shared pure presentation helpers for the Family Communication Workspace (modal + drawer).
import type { ConsentState } from "./types";

export const relTime = (iso: string | null | undefined): string => {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms)) return "";
    const h = Math.round(ms / 3.6e6);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
};

export const dirLabel = (d: string | null | undefined): string =>
    d === "outbound" ? "Sent" : d === "inbound" ? "Received" : "Internal";

export const consentMark = (s: ConsentState | boolean): string =>
    s === true || s === "opted_in" ? "✓" : s === false || s === "opted_out" ? "✗" : "—";

export const consentTone = (s: ConsentState | boolean): string =>
    s === true || s === "opted_in" ? "text-alloy-juniper" : s === false || s === "opted_out" ? "text-red-600" : "text-alloy-midnight/40";

export function consentReadableLabel(channel: "email" | "sms" | "marketing", state: ConsentState | boolean | undefined): string | null {
    const s = state ?? "unset";
    if (s === true || s === "opted_in") {
        if (channel === "email") return "Email allowed";
        if (channel === "sms") return "SMS allowed";
        return "Marketing allowed";
    }
    if (s === false || s === "opted_out") {
        if (channel === "email") return "Email blocked";
        if (channel === "sms") return "SMS blocked";
        return "Marketing blocked";
    }
    return null;
}

export function statusDisplay(status: string | null | undefined): { label: string; cls: string } | null {
    switch (status) {
        case "failed": return { label: "Failed", cls: "text-red-600" };
        case "replied": return { label: "Replied", cls: "text-alloy-juniper" };
        case "opened": return { label: "Opened", cls: "text-alloy-juniper" };
        case "delivered": return { label: "Delivered", cls: "text-alloy-midnight/45" };
        case "sent": return { label: "Sent", cls: "text-alloy-midnight/45" };
        case "queued": return { label: "Queued", cls: "text-alloy-midnight/40" };
        case "received": return { label: "Received", cls: "text-alloy-midnight/45" };
        default: return null;
    }
}

/** Lightweight delivery/read copy for message metadata — never fakes SMS read. */
export function messageDeliveryDisplay(
    status: string | null | undefined,
    channel: string | null | undefined,
    opts?: { openedAt?: string | null; deliveredAt?: string | null },
): { label: string; cls: string } | null {
    if (channel === "sms" && (status === "opened" || status === "replied") && !opts?.openedAt) {
        return null;
    }
    return statusDisplay(status);
}

export function threadReadAvailabilityHint(channel: string | null | undefined): string | null {
    return channel === "sms" ? "Read unavailable for SMS" : null;
}
