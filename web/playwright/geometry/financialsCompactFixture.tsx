/**
 * THE REAL APPROVED FINANCIALS CARD, compact, at the authored 4-column width.
 *
 * The Focus Panel places Financials at colStart 9 / colSpan 4, which measures ~286px on a 1440
 * viewport. That is the placement the Compact variant exists for, so it is the width the card is
 * certified at — not a convenient one.
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import ApprovedFinancialsCard from "@/components/operationalCards/FinancialsCard";
import { adaptFinancialsVmToFinancialsCard } from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

declare global {
    interface Window {
        __fin: {
            setWidth: (px: number) => Promise<void>;
            setCase: (name: string) => Promise<void>;
            measure: () => FinancialsCompactMeasurement;
        };
    }
}

export type FinancialsCompactMeasurement = {
    card: { width: number; left: number; right: number; height: number };
    /** The UniversalCard insight slot — the headline. Null when the card renders none. */
    headline: string | null;
    lines: { label: string; value: string; labelRight: number; valueLeft: number; clipped: boolean }[];
    commands: string[];
    statusChip: string | null;
    /**
     * Text that does not fit the box drawing it, named.
     *
     * Only elements that actually CARRY TEXT are considered. A scan of every descendant reports
     * container divs whose scrollWidth exceeds clientWidth for layout reasons that no operator can
     * see, and it is font-sensitive — it passed on a machine with the design fonts installed and
     * failed on CI's fallback stack, which is a property of the runner rather than of the card.
     */
    clippedText: string[];
    /** Content taller/wider than its scroll box — the card overflowing its own placement. */
    overflowX: number;
};

const base = (over: Partial<FinancialsCardVM["reconciliation"]>, pastDue: FinancialsCardVM["pastDue"]) =>
    ({
        account: { customerId: "cust-1", label: "Household" },
        period: { key: "2026-09", start: "2026-09-01", end: "2026-09-30", label: "September 2026" },
        payers: [],
        responsibility: { parties: [], unassignedCents: 0, allocatedCents: 0, hasUnresolvedCharges: false },
        expectedFunding: [],
        collectible: { outstandingCents: 0, expectedSubsidyCents: 0, submittedClaimSuppressionCents: 0, actualSubsidyReceivedCents: 0, unresolvedVarianceCents: 0, currentlyCollectibleCents: 0 },
        subjects: [],
        reductions: [],
        rows: [],
        reconciliation: { grossCents: 4300, discountsCents: 0, fundingCents: 0, adjustmentsCents: 0, responsibilityCents: 4300, paymentsCents: 0, balanceCents: 4300, scheduledCents: 0, draftCents: 0, ...over },
        reconciliationBySubject: {},
        pastDue,
        pastDueBySubject: {},
        ledgerPeriods: [],
        payments: [],
        chargeTemplates: [],
        unavailable: [],
        paymentSetup: null,
        paymentCapabilities: null,
        payerCandidates: [],
        achAvailable: false,
        openCollections: [],
        unavailableReason: null,
    }) as unknown as FinancialsCardVM;

const CASES: Record<string, { vm: FinancialsCardVM; payable: boolean }> = {
    // Wrigley's shape: September settled in full.
    zero_balance: { vm: base({ paymentsCents: 4300, balanceCents: 0 }, null), payable: false },
    ordinary_balance: { vm: base({}, null), payable: true },
    past_due: {
        vm: base({ balanceCents: 7500, responsibilityCents: 7500, grossCents: 7500 }, { amountCents: 7500, oldestDueDate: "2026-08-01", agingDays: 31 } as never),
        payable: true,
    },
    // A long label at the narrowest authored width — where truncation would show first.
    long_labels: { vm: base({ balanceCents: 1234567, responsibilityCents: 1234567, grossCents: 1234567 }, null), payable: true },
};

function App() {
    const [width, setWidth] = useState(286);
    const [name, setName] = useState("zero_balance");
    useEffect(() => {
        window.__fin.setWidth = async (px: number) => setWidth(px);
        window.__fin.setCase = async (n: string) => setName(n);
    }, []);
    const c = CASES[name] ?? CASES.zero_balance!;
    const vm = c.vm;
    return (
        <div style={{ width: `${width}px` }} data-financials-host="true">
            <ApprovedFinancialsCard
                span={1}
                evidence={adaptFinancialsVmToFinancialsCard({ vm, reconciliation: vm.reconciliation, pastDue: vm.pastDue, rows: [], currency: "USD" })}
                onDetails={() => {}}
                onAddCharge={() => {}}
                /* Payment is offered only where canonical payable truth exists — the panel's rule. */
                onPayNow={c.payable ? () => {} : undefined}
            />
        </div>
    );
}

function measure(): FinancialsCompactMeasurement {
    const card = document.querySelector('[data-financials-card="compact"]') as HTMLElement | null;
    if (!card) throw new Error("the compact financials card did not render");
    const box = card.getBoundingClientRect();
    const insight = card.querySelector(".alloy-os-ucard__insight") as HTMLElement | null;
    const chip = card.querySelector(".alloy-os-ucard__chip, [class*='chip']") as HTMLElement | null;
    const lines = Array.from(card.querySelectorAll(".alloy-os-billing__lines > *")).map((el) => {
        const label = el.querySelector("span, dt, .alloy-os-billing__label") as HTMLElement | null;
        const value = el.querySelector("strong, dd, .alloy-os-billing__value") as HTMLElement | null;
        const kids = Array.from(el.children) as HTMLElement[];
        const l = label ?? kids[0] ?? (el as HTMLElement);
        const v = value ?? kids[kids.length - 1] ?? (el as HTMLElement);
        return {
            label: (l.textContent ?? "").trim(),
            value: (v.textContent ?? "").trim(),
            labelRight: +l.getBoundingClientRect().right.toFixed(2),
            valueLeft: +v.getBoundingClientRect().left.toFixed(2),
            clipped: l.scrollWidth > Math.ceil(l.getBoundingClientRect().width) + 1,
        };
    });
    const clippedText = Array.from(card.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
            // Leaf text only: an element whose own text is what would be truncated.
            if (el.children.length > 0) return false;
            const text = (el.textContent ?? "").trim();
            if (!text) return false;
            return el.scrollWidth > Math.ceil(el.getBoundingClientRect().width) + 1;
        })
        .map((el) => `${el.tagName.toLowerCase()}.${el.className || "-"}: ${(el.textContent ?? "").trim().slice(0, 40)}`);
    return {
        card: { width: +box.width.toFixed(2), left: +box.left.toFixed(2), right: +box.right.toFixed(2), height: +box.height.toFixed(2) },
        headline: insight ? (insight.textContent ?? "").trim() || null : null,
        lines,
        commands: Array.from(card.querySelectorAll("[data-financials-command],[data-financials-nav]")).map((n) => (n.textContent ?? "").trim()),
        statusChip: chip ? (chip.textContent ?? "").trim() || null : null,
        clippedText,
        overflowX: +(card.scrollWidth - card.clientWidth).toFixed(2),
    };
}

window.__fin = { setWidth: async () => {}, setCase: async () => {}, measure };
createRoot(document.getElementById("root")!).render(<App />);
