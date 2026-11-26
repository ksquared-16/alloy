/**
 * What an operator actually reads on the packet.
 *
 * A record that exists only in metadata does not distinguish "held" from "lost" — the distinction
 * has to reach a screen. This renders the panel from the SHAPE the realization writes, so a change
 * to that record that empties the panel fails here.
 *
 * Server-rendered to a string on purpose: this asserts the words, and it is deliberately NOT a
 * substitute for opening the page.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PacketDeferredCapabilities from "@/app/adminV2/pos/PacketDeferredCapabilities";

const RECORDED = {
    obligation: "PAYMENT_SETUP_REQUIRED",
    owner_label: "Financials / Payments",
    reason: "Payment setup. The family authorizes a payment method with the payment provider and Alloy keeps the authorization that comes back.",
    clause: "To update information provided in your ACH account, please complete an updated electronic ACH form by the 10th of the month prior to the change.",
    source_document_title: "school-of-enrichment-family-handbook.pdf",
    deferred_artifact_ids: ["4:direct_payment_authorization"],
};

describe("the deferred-capability panel", () => {
    it("names the obligation, the owner and the school's own sentence", () => {
        const html = renderToStaticMarkup(<PacketDeferredCapabilities items={[RECORDED]} />);
        expect(html).toContain("Held for another area");
        expect(html).toContain("Payment setup");
        expect(html).toContain("Financials / Payments");
        expect(html).toContain("electronic ACH form");
        expect(html).toContain("school-of-enrichment-family-handbook.pdf");
        // The held paper form is accounted for, not silently absent.
        expect(html).toMatch(/paper form for this is kept with the case/i);
    });

    it("says how many requirements the packet does not ask for", () => {
        const html = renderToStaticMarkup(<PacketDeferredCapabilities items={[RECORDED]} />);
        expect(html).toContain("1 requirement");
        expect(html).toContain("does not ask for");
    });

    it("renders nothing when nothing is deferred", () => {
        // An empty panel on every other packet would train an operator to ignore it.
        expect(renderToStaticMarkup(<PacketDeferredCapabilities items={[]} />)).toBe("");
    });

    it("sits collapsed as provenance, not as a headline", () => {
        // It is a statement about what this packet deliberately does NOT ask for — real, provable,
        // and not the first thing an operator opening a packet needs.
        const html = renderToStaticMarkup(<PacketDeferredCapabilities items={[RECORDED]} />);
        expect(html).toContain("<details");
        expect(html).toContain("<summary");
        expect(html).not.toContain("open=");
    });

    it("does not read as an error", () => {
        const html = renderToStaticMarkup(<PacketDeferredCapabilities items={[RECORDED]} />);
        expect(html).not.toMatch(/error|failed|missing|warning/i);
    });
});
