import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import {
    formatOperationalProposalTypeLine,
    OPERATIONAL_PROPOSAL_APPROVAL_REQUIRED_COPY,
    OPERATIONAL_PROPOSAL_CAPABILITY_LABELS,
    OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY,
    OPERATIONAL_PROPOSAL_STATUS_LABELS,
    operationalProposalStatusLabel,
} from "@/lib/adminV2/bos/operationalProposalPresentation";

const framePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/bos/OperationalProposalCardFrame.tsx"
);
const presentationPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../lib/adminV2/bos/operationalProposalPresentation.ts"
);

describe("operationalProposalPresentation", () => {
    it("maps capability keys and status to operator labels", () => {
        expect(OPERATIONAL_PROPOSAL_CAPABILITY_LABELS.task_assist).toBe("Task Assist");
        expect(operationalProposalStatusLabel("validated")).toBe("Ready to review");
        expect(formatOperationalProposalTypeLine({
            capabilityKey: "workflow_assist",
            proposalTypeLabel: "Create workflow draft",
        })).toBe("Workflow Assist · Create workflow draft");
    });

    it("exports status labels for all BosProposalStatus values", () => {
        expect(OPERATIONAL_PROPOSAL_STATUS_LABELS.applied).toBe("Applied");
        expect(OPERATIONAL_PROPOSAL_STATUS_LABELS.draft).toBe("Draft");
    });
});

describe("OperationalProposalCardFrame", () => {
    it("renders header, type, context, and reason regions", () => {
        const html = renderToStaticMarkup(
            <OperationalProposalCardFrame
                proposalTitle="Send tour confirmation follow-up"
                proposalTypeLabel="Draft message"
                capabilityKey="task_assist"
                status="draft"
                entityContextLabel="Chen household"
                reasonLabel="Why"
                reasonDetail="Inquiry waiting for outbound response"
                sourceLabel="Operational attention"
                summary="SMS draft for primary contact"
            />
        );
        expect(html).toContain("Operational proposal");
        expect(html).toContain("Send tour confirmation follow-up");
        expect(html).toContain("Task Assist · Draft message");
        expect(html).toContain("Using active record");
        expect(html).toContain("Chen household");
        expect(html).toContain("Operational attention");
        expect(html).toContain("Inquiry waiting for outbound response");
        expect(html).toContain("data-operational-proposal-region=\"header\"");
        expect(html).toContain("data-operational-proposal-region=\"why\"");
        expect(html).toContain('data-operational-proposal-status-badge="true"');
        expect(html).toContain("Draft");
    });

    it("renders approval required and footer actions", () => {
        const html = renderToStaticMarkup(
            <OperationalProposalCardFrame
                proposalTitle="Reminder for follow-up"
                proposalTypeLabel="Operational task"
                capabilityKey="task_assist"
                requiresApproval
                riskLevel="medium"
                mutationBoundaryCopy="Does not send until you approve."
                footer={<button type="button">Approve and send</button>}
            />
        );
        expect(html).toContain(OPERATIONAL_PROPOSAL_APPROVAL_REQUIRED_COPY);
        expect(html).toContain("Medium risk");
        expect(html).toContain("Approve and send");
        expect(html).toContain("data-operational-proposal-region=\"actions\"");
        expect(html).toContain("data-operational-proposal-approval-required=\"true\"");
    });

    it("renders blocked/stale state", () => {
        const html = renderToStaticMarkup(
            <OperationalProposalCardFrame
                proposalTitle="Draft for prior record"
                proposalTypeLabel="Draft message"
                capabilityKey="task_assist"
                stale
                entityContextLabel="Patel household"
            />
        );
        expect(html).toContain("data-operational-proposal-variant=\"stale\"");
        expect(html).toContain("data-operational-proposal-blocked=\"true\"");
        expect(html).toContain(OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY);
    });

    it("renders receipt/status for applied proposals", () => {
        const html = renderToStaticMarkup(
            <OperationalProposalCardFrame
                proposalTitle="Workflow enabled"
                proposalTypeLabel="Workflow change"
                capabilityKey="workflow_assist"
                status="applied"
                receipt={<p>Message sent to Chen household at 2:15 PM.</p>}
            />
        );
        expect(html).toContain("data-operational-proposal-variant=\"applied\"");
        expect(html).toContain("Applied");
        expect(html).toContain('data-operational-proposal-receipt="true"');
        expect(html).toContain("Message sent to Chen household");
    });

    it("renders validation errors", () => {
        const html = renderToStaticMarkup(
            <OperationalProposalCardFrame
                proposalTitle="Layout change"
                proposalTypeLabel="Section move"
                capabilityKey="config_layout_assist"
                validationErrors={["Target field is not on this layout"]}
            />
        );
        expect(html).toContain("data-operational-proposal-validation-errors");
        expect(html).toContain("Target field is not on this layout");
    });

    it("uses accessible article heading", () => {
        const html = renderToStaticMarkup(
            <OperationalProposalCardFrame
                proposalTitle="Test"
                proposalTypeLabel="Reminder"
                capabilityKey="task_assist"
            />
        );
        expect(html).toContain('aria-labelledby="operational-proposal-title"');
        expect(html).toContain('id="operational-proposal-title"');
    });
});

describe("OperationalProposalCardFrame copy contract", () => {
    it("avoids chatbot and AI-marketing language in source", () => {
        const mutationPath = join(process.cwd(), "lib/adminV2/bos/bosMutationBoundaryCopy.ts");
        const src =
            readFileSync(framePath, "utf8") +
            readFileSync(presentationPath, "utf8") +
            readFileSync(mutationPath, "utf8");
        expect(src).not.toMatch(/\bAI thinks\b/i);
        expect(src).not.toContain("Copilot");
        expect(src).not.toContain("Magic");
        expect(src).not.toContain("Autonomous");
        expect(src).not.toContain("Assistant recommends");
        expect(src).toContain("Operational proposal");
        expect(src).toContain("OPERATIONAL_PROPOSAL_APPROVAL_REQUIRED_COPY");
        expect(src).toContain("MUTATION_BOUNDARY_APPROVAL_REQUIRED");
    });

    it("frame is presentational only", () => {
        const src = readFileSync(framePath, "utf8");
        expect(src).not.toContain("fetch(");
        expect(src).not.toContain("/api/admin");
        expect(src).toContain("presentational only");
    });
});
