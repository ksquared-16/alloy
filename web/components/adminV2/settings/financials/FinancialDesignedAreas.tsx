"use client";

import type { ReactNode } from "react";
import { DesignedConfigurationSurface } from "@/components/adminV2/settings/financials/DesignedConfigurationSurface";

/**
 * Designed (not-yet-authorable) Financial Configuration areas (Financial
 * Configuration Convergence). Each is framed around the operational decision it
 * owns, shows the configuration structure that will live there, names the
 * downstream capabilities that will consume it, and states the backend roadmap —
 * so Financials feels like a complete product and shows exactly where Billing,
 * Posting, Payments, and Subsidy plug in later without a redesign.
 *
 * No runtime. No posting/payments/subsidy/responsibility behavior.
 */

export function FinancialPoliciesArea({ children }: { children?: ReactNode }): ReactNode {
    return (
        <DesignedConfigurationSurface
            testId="financials-policies"
            title="Financial Policies"
            decision="How does the organization apply money rules — proration, credits, fees, refunds?"
            status="designed"
            summary="Organization-wide rules that shape every charge. Not posting — policy."
            groups={[
                { heading: "Proration & cadence", decisions: ["Proration method", "Billing cadence", "Mid-period join/leave"] },
                { heading: "Credits & adjustments", decisions: ["Vacation credits", "Credit policy", "Write-off policy", "Adjustment policy"] },
                { heading: "Fees & deposits", decisions: ["NSF fees", "Grace periods", "Deposit policy"] },
                { heading: "Lifecycle", decisions: ["Refund policy", "Withdrawal policy"] },
            ]}
            consumers={["Billing", "Posting", "Payments"]}
            roadmap="Proration method and billing cadence are already effective-dated on each Rate Plan today (see Rate Plans → Plan settings). Organization-level policy authoring (credits, fees, refunds) persists to org configuration next."
        >
            {children}
        </DesignedConfigurationSurface>
    );
}

export function FinancialResponsibilityArea(): ReactNode {
    return (
        <DesignedConfigurationSurface
            testId="financials-responsibility"
            title="Financial Responsibility"
            decision="Who owes what — and how is a charge split across payers?"
            status="designed"
            summary="Defines payer parties and split rules. Today's resolution defaults to the household payer."
            groups={[
                { heading: "Payer parties", decisions: ["Parent", "Split parent", "Employer", "Agency", "Subsidy", "Corporate"] },
                { heading: "Split rules", decisions: ["Percentage / fixed split", "Order of responsibility", "Per-charge-category overrides"] },
            ]}
            consumers={["Billing", "Posting", "Payments", "Subsidy"]}
            roadmap="Charge Resolution already attaches a default responsibility (household payer). Multi-party split authoring is the configuration surface here; runtime resolution lands with Posting."
        />
    );
}

export function PostingConfigurationArea(): ReactNode {
    return (
        <DesignedConfigurationSurface
            testId="financials-posting"
            title="Posting"
            decision="How and when do draft charges become authoritative, billable truth?"
            status="designed"
            summary="Configuration for the Posting stage. This is NOT posting runtime — only how posting will behave."
            groups={[
                { heading: "Cadence & batching", decisions: ["Posting frequency", "Batching", "Charge cutoffs", "Draft lifetime"] },
                { heading: "Review & approval", decisions: ["Approval required", "Review required"] },
                { heading: "Statements & invoices", decisions: ["Statement generation", "Invoice grouping"] },
            ]}
            consumers={["Billing", "Payments", "Accounting"]}
            roadmap="Posting is deliberately separate from Resolution. The Financial Charge Preview already shows what a posting WOULD write (advisory). This area configures the posting engine that ships in a later phase."
        />
    );
}

export function PaymentsConfigurationArea(): ReactNode {
    return (
        <DesignedConfigurationSurface
            testId="financials-payments"
            title="Payments"
            decision="How do families pay, and what are the terms?"
            status="designed"
            summary="Payment configuration. No payment runtime in this product."
            groups={[
                { heading: "Methods & terms", decisions: ["Payment methods", "AutoPay", "Payment terms"] },
                { heading: "Timing & defaults", decisions: ["Late fee timing", "Credits", "Refund defaults"] },
            ]}
            consumers={["Billing", "Posting"]}
            roadmap="Surfaced once a payments backend exists; this defines where payment configuration lives."
        />
    );
}

export function SubsidyConfigurationArea(): ReactNode {
    return (
        <DesignedConfigurationSurface
            testId="financials-subsidy"
            title="Subsidy"
            decision="How are agency-funded authorizations configured and reimbursed?"
            status="designed"
            summary="The obvious future home for subsidy configuration. No subsidy runtime."
            groups={[
                { heading: "Agencies & authorizations", decisions: ["Agencies", "Programs", "Authorizations"] },
                { heading: "Claims & reimbursement", decisions: ["Claim rules", "Processing integration", "Reimbursement"] },
                { heading: "Integration", decisions: ["Future agency integrations"] },
            ]}
            consumers={["Billing", "Posting", "Financial Responsibility", "Accounting"]}
            roadmap="Expected subsidy is L3-derived (never AR). This area will configure agencies, authorizations, and claim rules when the subsidy phase ships."
        />
    );
}
