import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    formatMessagingThreadContextLine,
    formatMessagingThreadMetadataLine,
    shouldShowMessagingHouseholdFallback,
} from "@/lib/adminV2/messaging/messagingThreadContextLines";
import {
    DRAWER_COMMUNICATIONS_ENTITY_TYPES,
    drawerTypeToCommunicationsEntityType,
} from "@/lib/adminV2/messaging/drawerCommunicationsEntity";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("drawer communications Messaging V2 alignment", () => {
    it("CommunicationsDrawerSection uses shared bubbles and drawer composer", () => {
        const section = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(section).toContain("MessagingThreadMessageBubble");
        expect(section).toContain("DrawerMessagingComposer");
        expect(section).toContain("data-comms-drawer-layout=\"split-workspace\"");
        expect(section).not.toContain("bg-alloy-midnight/[0.9]");
    });

    it("drawer communications uses side-by-side thread and composer columns", () => {
        const section = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(section).toContain("data-comms-drawer-thread-column=\"true\"");
        expect(section).toContain("data-comms-drawer-composer-column=\"true\"");
        expect(section).toContain("min-[540px]:w-[40%]");
        expect(section).toContain("min-[540px]:w-[60%]");
        expect(section).toContain("min-[540px]:flex-row");
        expect(section).toContain('data-comms-thread-scroll="true"');
        expect(section).toContain("columnLayout");
    });

    it("drawer thread column scrolls internally and stacks on narrow widths", () => {
        const section = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(section).toContain("overflow-y-auto overscroll-contain");
        expect(section).toContain("max-[539px]:max-h-[min(38vh,14rem)]");
        expect(section).toContain("COMMS_DRAWER_SPLIT_LAYOUT_CLASS");
    });

    it("drawer thread header omits duplicate contact name", () => {
        const section = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(section).not.toContain("drawerPrimaryLabel");
        expect(section).toContain("drawerContextLine");
        expect(section).toContain("drawerMetadataLine");
    });

    it("drawer columns use stronger separation between thread and composer", () => {
        const section = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(section).toContain("border-alloy-stone/28");
        expect(section).toContain("min-[540px]:shadow-[-8px_0_16px_-12px_rgba(49,57,77,0.14)]");
        const composer = read("components/adminV2/messaging/DrawerMessagingComposer.tsx");
        expect(composer).toContain("min-[540px]:border-alloy-stone/28");
    });

    it("DrawerMessagingComposer wires Send later and BOS Assist modals", () => {
        const composer = read("components/adminV2/messaging/DrawerMessagingComposer.tsx");
        expect(composer).toContain("MessagingComposerFrame");
        expect(composer).toContain("ComposerScheduleSendModal");
        expect(composer).toContain("ComposerBosEnhanceModal");
        expect(composer).toContain("columnLayout");
    });

    it("background preload keeps warming while tab is inactive", () => {
        const section = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        expect(section).toContain("backgroundPreload");
        expect(section).toContain("const dataLayerActive = active || backgroundPreload");
        expect(section).toContain("if (active || backgroundPreload) return");
    });

    it("prefetch module dedupes arm while slot exists", () => {
        const prefetch = read("lib/admin/communications/communicationsDrawerPrefetch.ts");
        expect(prefetch).toContain("if (slots.has(key))");
        expect(prefetch).toContain("takeCommunicationsDrawerPrefetch");
        expect(prefetch).toContain("markCommunicationsDrawerPrefetchConsumed");
    });

    it("supports opportunities, jobs, persons, and customers entity types", () => {
        expect(DRAWER_COMMUNICATIONS_ENTITY_TYPES).toEqual(
            expect.arrayContaining(["opportunities", "jobs", "persons", "customers"]),
        );
        expect(drawerTypeToCommunicationsEntityType("opportunities")).toBe("opportunities");
        expect(drawerTypeToCommunicationsEntityType("jobs")).toBe("jobs");
        expect(drawerTypeToCommunicationsEntityType("persons")).toBe("persons");
        expect(drawerTypeToCommunicationsEntityType("customers")).toBe("customers");
    });
});

describe("inbox and drawer compact metadata", () => {
    it("formats location · status · channel without duplicate labels", () => {
        expect(
            formatMessagingThreadContextLine({
                location: "North Campus",
                status: "Tour Scheduled",
                channel: "email",
            }),
        ).toBe("North Campus · Tour Scheduled · Email");
    });

    it("formats children and related contacts on one metadata line", () => {
        expect(
            formatMessagingThreadMetadataLine({
                children: "Ava Rivera",
                relatedContacts: "Claire Walsh, Eric Rivera",
            }),
        ).toBe("Children: Ava Rivera · Related contacts: Claire Walsh, Eric Rivera");
    });

    it("hides household unless it adds fallback context", () => {
        expect(
            shouldShowMessagingHouseholdFallback({
                contactDisplay: "Priya Rivera",
                householdDisplay: "Rivera household",
            }),
        ).toBe(true);
        expect(
            shouldShowMessagingHouseholdFallback({
                contactDisplay: "Priya Rivera",
                householdDisplay: "Priya Rivera",
            }),
        ).toBe(false);
    });

    it("InboxPanel uses compact metadata helpers", () => {
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).toContain("formatMessagingThreadContextLine");
        expect(panel).toContain("formatMessagingThreadMetadataLine");
        expect(panel).toContain("shouldShowMessagingHouseholdFallback");
        expect(panel).not.toContain("Status:");
        expect(panel).not.toContain("Household:");
    });
});

describe("BOS Command Center messaging alignment", () => {
    it("TaskAssistCompactDraftCard uses Messaging V2 compact controls", () => {
        const card = read("components/admin/taskAssist/TaskAssistCompactDraftCard.tsx");
        expect(card).toContain("ComposerChannelToggle");
        expect(card).toContain("ComposerReplyActionCluster");
        expect(card).toContain("ComposerBosEnhanceModal");
        expect(card).not.toContain("Schedule for later");
        expect(card).not.toContain("bg-alloy-midnight/[0.9]");
    });

    it("Command surface routes draft cards through TaskAssistCompactDraftCard", () => {
        const thread = read("app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx");
        expect(thread).toContain("TaskAssistCompactDraftCard");
    });
});
