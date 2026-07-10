import { describe, expect, it } from "vitest";
import {
    conversationDisplayTitle,
    conversationDisplayTopic,
    conversationDisplayChildren,
    conversationDisplayRecipient,
    formatConversationContactDisplay,
    countDistinctQueueFamilies,
    type ConversationSummary,
} from "@/lib/communications/v2/commandCenterViewModel";

const base: ConversationSummary = {
    id: "thread-1",
    family_label: "Kurzman Family",
    topic_label: "Tour Scheduling",
    channel: "sms",
    recipient_key: "+16022904816",
    child_names: ["Ava", "Liam"],
};

describe("command center queue projection", () => {
    it("shows family name and topic separately", () => {
        expect(conversationDisplayTitle(base)).toBe("Kurzman Family");
        expect(conversationDisplayTopic(base)).toBe("Tour Scheduling");
        expect(conversationDisplayChildren(base)).toBe("Ava, Liam");
    });

    it("formats phone numbers for queue contact display", () => {
        expect(formatConversationContactDisplay("+16022904816")).toBe("+1 (602) 290-4816");
        expect(conversationDisplayRecipient(base)).toBe("+1 (602) 290-4816");
    });

    it("counts distinct families when multiple topic rows share a household", () => {
        const rows: ConversationSummary[] = [
            { ...base, id: "t1", customer_id: "cust-1" },
            { ...base, id: "t2", customer_id: "cust-1", topic_label: "Enrollment Packet" },
            { ...base, id: "t3", customer_id: "cust-2", family_label: "Smith Family" },
        ];
        expect(countDistinctQueueFamilies(rows)).toBe(2);
    });

    it("falls back topic to General when absent", () => {
        expect(conversationDisplayTopic({ id: "x", channel: "email" })).toBe("General");
    });
});
