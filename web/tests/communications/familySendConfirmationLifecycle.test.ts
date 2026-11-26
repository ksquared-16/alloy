/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    buildFamilySendAckTitle,
    buildFamilySendConfirmChannelLine,
} from "@/lib/communications/v2/familyWorkspace/familySendConfirmationCopy";
import { composerMarkupToPlainText } from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("Shared family send confirmation lifecycle", () => {
    it("Send enters shared centered confirmation (not inline Ready to send)", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toContain("FamilySendConfirmationDialog");
        expect(view).not.toMatch(/rounded-xl border border-alloy-bend-pine\/25[\s\S]{0,80}Ready to send/);
        const dialog = read("components/admin/communications/FamilySendConfirmationDialog.tsx");
        expect(dialog).toContain('data-cc-send-confirm-dialog="true"');
        expect(dialog).toContain("Ready to send");
        expect(dialog).toContain("Confirm send");
        expect(dialog).toContain("Back to edit");
        expect(dialog).toContain("data-cc-send-confirm-preview");
    });

    it("confirmation preview uses the current draft body/subject", () => {
        const dialog = read("components/admin/communications/FamilySendConfirmationDialog.tsx");
        expect(dialog).toContain("subjectDraft");
        expect(dialog).toContain("bodyDraft");
        expect(dialog).toContain("composerMarkupToPlainText(bodyDraft)");
        const url = "http://localhost:3015/a/AbCdEfGh";
        const draft = `Hello Kelly,\n\nChoose a time:\n${url}`;
        expect(composerMarkupToPlainText(draft)).toContain(url);
    });

    it("Back to edit dismisses without acknowledging send-complete", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toContain("onBackToEdit={onDismissSend}");
        expect(view).toMatch(/sendResult\?\.mode === "sent"[\s\S]{0,120}onAcknowledgeSendSuccess/);
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toContain("dismissSendResult");
        expect(runtime).not.toMatch(/dismissSendResult[\s\S]{0,200}dispatchContactFamilySendComplete/);
    });

    it("Confirm send uses confirmInFlight guard and keeps success for acknowledgement", () => {
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toContain("confirmInFlightRef");
        expect(runtime).toContain("acknowledgeSendSuccess");
        expect(runtime).toContain("pendingContactFamilyCompleteRef");
        expect(runtime).toContain("pendingContactFamilyCompleteRef.current = {");
        // Confirm path must not clear sendResult inside the fromCurrentWork success block.
        const fromIdx = runtime.indexOf("if (fromCurrentWork) {");
        const fromBlock = runtime.slice(fromIdx, fromIdx + 2200);
        expect(fromBlock).toContain("pendingContactFamilyCompleteRef.current = {");
        expect(fromBlock).not.toContain("setSendResult(null)");
    });

    it("Done dispatches Contact Family complete once and bumps sendCompleteToken", () => {
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        const ack = runtime.slice(runtime.indexOf("acknowledgeSendSuccess"));
        expect(ack.slice(0, 900)).toContain("dispatchContactFamilySendComplete");
        expect(ack.slice(0, 900)).toContain("setSendCompleteToken");
        expect(ack.slice(0, 900)).toContain("pendingContactFamilyCompleteRef.current = null");
    });

    it("New Message, Reply, and Tour share the same confirmation dialog host", () => {
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(workspace).toContain("onAcknowledgeSendSuccess={runtime.acknowledgeSendSuccess}");
        expect(workspace).toContain("tourInvitationAck={runtime.tourInvitationAck}");
        expect(workspace).toContain("onConfirmSend={() => void runtime.send(true)}");
        expect(workspace).toContain("onSendNow={() => void runtime.send(false)}");
    });

    it("Tour editor link contract stays draft→confirm→send (same bodyDraft)", () => {
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toMatch(/body:\s*bodyDraft/);
        const dialog = read("components/admin/communications/FamilySendConfirmationDialog.tsx");
        expect(dialog).toContain("bodyDraft");
    });

    it("Email vs SMS confirmation presentation differs correctly", () => {
        expect(buildFamilySendConfirmChannelLine({ channel: "email", recipientLabel: "Kelly Kurzman" })).toBe(
            "Email to Kelly Kurzman",
        );
        expect(buildFamilySendConfirmChannelLine({ channel: "sms", recipientLabel: "Kelly Kurzman" })).toBe(
            "SMS to Kelly Kurzman",
        );
        expect(buildFamilySendAckTitle({ tourInvitation: true })).toBe("Tour invitation sent");
        expect(buildFamilySendAckTitle({ tourInvitation: false })).toBe("Message sent");
        const dialog = read("components/admin/communications/FamilySendConfirmationDialog.tsx");
        expect(dialog).toContain('channel === "email" && subjectPreview');
        expect(dialog).toContain("Subject");
        expect(dialog).toContain("Message");
    });

    it("post-send Done closes workspace without handoff summary card", () => {
        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE");
        expect(card).toContain("closeWorkspace()");
        expect(card).toContain("setHandoffNotice(null)");
        expect(card).not.toContain("buildContactFamilySendFollowOnNotice");
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toContain("dispatchOperationalWorkRefresh");
        expect(runtime).toContain("dispatchOpportunityDrawerScopedUpdate");
    });
});
