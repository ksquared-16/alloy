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
    s === true || s === "opted_in" ? "text-[#0f6b4a]" : s === false || s === "opted_out" ? "text-red-600" : "text-alloy-midnight/40";

export function statusDisplay(status: string | null | undefined): { label: string; cls: string } | null {
    switch (status) {
        case "failed": return { label: "Failed", cls: "text-red-600" };
        case "replied": return { label: "Replied", cls: "text-[#0f6b4a]" };
        case "opened": return { label: "Opened", cls: "text-[#0f6b4a]" };
        case "delivered": return { label: "Delivered", cls: "text-alloy-midnight/45" };
        case "sent": return { label: "Sent", cls: "text-alloy-midnight/45" };
        case "queued": return { label: "Queued", cls: "text-alloy-midnight/40" };
        default: return null;
    }
}
