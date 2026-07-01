import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TaskAssistCompactDraftCard from "@/components/admin/taskAssist/TaskAssistCompactDraftCard";
import TaskAssistCompactReminderCard from "@/components/admin/taskAssist/TaskAssistCompactReminderCard";
import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";

const draftPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/admin/taskAssist/TaskAssistCompactDraftCard.tsx"
);
const reminderPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/admin/taskAssist/TaskAssistCompactReminderCard.tsx"
);

const draftBootstrap: TaskAssistCommandBootstrap = {
    intent_type: "draft_message",
    channel_hint: "sms",
    instruction: "Follow up on tour",
    timing_hint_text: null,
    reminder_title: null,
    reminder_due_hint: null,
};

const reminderBootstrap: TaskAssistCommandBootstrap = {
    intent_type: "create_reminder",
    channel_hint: null,
    instruction: null,
    timing_hint_text: "tomorrow 9am",
    reminder_title: "Call family back",
    reminder_due_hint: null,
};

describe("Task Assist OperationalProposalCardFrame migration", () => {
    it("draft card source uses OperationalProposalCardFrame", () => {
        const src = readFileSync(draftPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("STALE_OPERATIONAL_PROPOSAL_MESSAGE");
        expect(src).toContain("data-task-assist-compact-send-now");
        expect(src).not.toMatch(/\bAI thinks\b/i);
        expect(src).not.toContain("Copilot");
    });

    it("reminder card source uses OperationalProposalCardFrame", () => {
        const src = readFileSync(reminderPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("TASK_ASSIST_REMINDER_PROPOSAL_TYPE_LABEL");
        expect(src).toContain("data-task-assist-compact-reminder-submit");
        expect(src).toContain("mutationsBlocked");
    });

    it("reminder card renders frame when Task Assist V1 UI is enabled", () => {
        const prev = process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED;
        process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED = "true";
        try {
            const html = renderToStaticMarkup(
                <TaskAssistCompactReminderCard
                    entityId="opp-1"
                    entityLabel="Chen household"
                    bootstrap={reminderBootstrap}
                    bootstrapKey="k1"
                />
            );
            expect(html).toContain("data-operational-proposal-card-frame");
            expect(html).toContain("Operational proposal");
            expect(html).toContain("Task Assist · Reminder proposal");
            expect(html).toContain("Using active record");
            expect(html).toContain("Chen household");
            expect(html).toContain("Approval required");
            expect(html).toContain("data-task-assist-compact-reminder-submit");
        } finally {
            if (prev === undefined) delete process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED;
            else process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED = prev;
        }
    });

    it("draft review phase renders frame with approval and actions", () => {
        const html = renderToStaticMarkup(
            <TaskAssistCompactDraftCard
                entityId="opp-1"
                entityLabel="Chen household"
                bootstrap={draftBootstrap}
                bootstrapKey="k1"
                autoPropose={false}
            />
        );
        expect(html).toContain("data-operational-proposal-card-frame");
        expect(html).toContain("Operational proposal");
        expect(html).toContain("Task Assist · Message draft");
        expect(html).toContain("Approval required");
        expect(html).toContain("data-task-assist-compact-send-now");
    });

    it("draft card shows stale governance when mutations blocked", () => {
        const html = renderToStaticMarkup(
            <TaskAssistCompactDraftCard
                entityId="opp-1"
                entityLabel="Chen household"
                bootstrap={draftBootstrap}
                bootstrapKey="k2"
                autoPropose={false}
                mutationsBlocked
            />
        );
        expect(html).toContain("data-operational-proposal-blocked");
        expect(html).toContain("different active record");
    });
});
