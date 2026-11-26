import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Messaging composer shared controls", () => {
    it("MessagingComposerFrame bundles channel toggle, toolbar, and action cluster", () => {
        const frame = read("components/adminV2/messaging/MessagingComposerFrame.tsx");
        expect(frame).toContain("ComposerChannelToggle");
        expect(frame).toContain("ComposerMessageTextToolbar");
        expect(frame).toContain("ComposerReplyActionCluster");
        expect(frame).toContain('data-adminv2-messaging-composer="true"');
        expect(frame).toContain("onSendLater");
        expect(frame).toContain("onBosEnhance");
        expect(frame).toContain('placeholder="Subject"');
        expect(frame).not.toContain("Subject (optional)");
    });

    it("inline reply and compose new both use MessagingComposerFrame", () => {
        const reply = read("components/adminV2/messaging/InboxThreadReplyBox.tsx");
        const compose = read("app/adminV2/components/QuickMessageModal.tsx");
        expect(reply).toContain("MessagingComposerFrame");
        expect(compose).toContain("MessagingComposerFrame");
        expect(compose).toContain("Compose New");
        expect(compose).not.toContain("Quick message");
        expect(compose).toContain('dataTestId="compose-new"');
        expect(reply).toContain("ComposerScheduleSendModal");
        expect(reply).toContain("ComposerBosEnhanceModal");
        expect(compose).toContain("ComposerScheduleSendModal");
        expect(compose).toContain("ComposerBosEnhanceModal");
    });

    it("QuickMessageModal keeps hooks before early return", () => {
        const compose = read("app/adminV2/components/QuickMessageModal.tsx");
        const scheduleMemo = compose.indexOf("const scheduleContext = useMemo(");
        const earlyReturn = compose.indexOf("if (!open || !portalReady || typeof document === \"undefined\") return null;");
        expect(scheduleMemo).toBeGreaterThan(-1);
        expect(earlyReturn).toBeGreaterThan(scheduleMemo);
    });

    it("channel toggle uses consistent Bend Pine active state and SMS unavailable copy", () => {
        const toggle = read("components/adminV2/messaging/ComposerChannelToggle.tsx");
        expect(toggle).toContain("bg-[#00A283]/15");
        expect(toggle).toContain("(unavailable)");
        expect(toggle).not.toContain("bg-alloy-midnight text-white");
    });

    it("Send later and BOS are active entry points", () => {
        const actions = read("components/adminV2/messaging/ComposerReplyActionCluster.tsx");
        expect(actions).toContain("Send later");
        expect(actions).toContain('label="BOS"');
        expect(actions).toContain('data-adminv2-composer-bos-assist="true"');
        expect(actions).not.toContain("BOS Assist");
        expect(actions).not.toContain("BOS Enhance");
    });

    it("Send later modal uses date/time only and local combine helper", () => {
        const modal = read("components/adminV2/messaging/ComposerScheduleSendModal.tsx");
        expect(modal).toContain('type="date"');
        expect(modal).toContain('type="time"');
        expect(modal).not.toContain('type="datetime-local"');
        expect(modal).not.toContain('placeholder="Subject"');
        expect(modal).toContain("combineLocalDateAndTime");
    });

    it("BOS modal exposes intent choices and coming-next gap", () => {
        const modal = read("components/adminV2/messaging/ComposerBosEnhanceModal.tsx");
        const intents = read("lib/adminV2/messaging/messagingComposerBosEnhance.ts");
        expect(modal).toContain('title="BOS"');
        expect(modal).not.toContain("BOS Assist");
        expect(modal).not.toContain("BOS Enhance");
        expect(modal).toContain("MESSAGING_BOS_ENHANCE_INTENTS");
        expect(intents).toContain("Make clearer");
        expect(modal).toContain('data-adminv2-composer-bos-coming-next="true"');
    });

    it("conversation composer is labeled Continue conversation, not Reply", () => {
        const reply = read("components/adminV2/messaging/InboxThreadReplyBox.tsx");
        expect(reply).toContain('heading="Continue conversation"');
        expect(reply).not.toMatch(/heading="Reply"/);
    });
});

describe("Inbox thread history rendering", () => {
    it("InboxPanel loads full thread messages with cache and auto-scroll anchor", () => {
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).toContain("InboxThreadMessageHistory");
        expect(panel).toContain("scrollToLatestKey");
        expect(panel).toContain("data-adminv2-inbox-search");
        expect(read("components/adminV2/messaging/InboxThreadMessageHistory.tsx")).toContain(
            "data-adminv2-inbox-thread-scroll-latest"
        );
    });

    it("message bubbles use local timezone formatter", () => {
        const bubble = read("components/adminV2/messaging/MessagingThreadMessageBubble.tsx");
        expect(bubble).toContain("formatMessagingDateTimeLocal");
    });

    it("QuickMessage thread preview uses shared bubble component without midnight styling", () => {
        const compose = read("app/adminV2/components/QuickMessageModal.tsx");
        expect(compose).toContain("MessagingThreadMessageBubble");
        expect(compose).toContain("data-adminv2-composer-add-recipient");
        expect(compose).toContain('bodyRows={8}');
        expect(compose).toContain('bodyMinHeightClass="min-h-[12rem]"');
        expect(compose).toContain('data-compose-editor-min-rows="8"');
        expect(compose).toContain('data-compose-template="true"');
        expect(compose).toContain("fetchCommunicationTemplateCurrentVersion");
        expect(compose).not.toContain("bg-alloy-midnight/[0.9]");
    });
});
