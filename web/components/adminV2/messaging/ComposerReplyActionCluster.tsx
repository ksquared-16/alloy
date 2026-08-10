"use client";

import { BosButton } from "@/app/adminV2/components/bos/identity/BosButton";

type ComposerReplyActionClusterProps = {
    sendLabel?: string;
    sendDisabled?: boolean;
    sendBusy?: boolean;
    onSend?: () => void;
    onSendLater?: () => void;
    onBosEnhance?: () => void;
    compact?: boolean;
};

export default function ComposerReplyActionCluster({
    sendLabel = "Send now",
    sendDisabled = false,
    sendBusy = false,
    onSend,
    onSendLater,
    onBosEnhance,
    compact = false,
}: ComposerReplyActionClusterProps) {
    const secondaryClass = compact
        ? "rounded-md border border-alloy-stone/18 bg-white px-2 py-1 text-[10px] font-semibold text-alloy-midnight/55 hover:bg-alloy-stone/6"
        : "rounded-md border border-alloy-stone/18 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-alloy-midnight/55 hover:bg-alloy-stone/6";

    return (
        <div
            className="flex flex-wrap items-center justify-end gap-1.5"
            data-adminv2-inbox-reply-actions="true"
            aria-label="Message actions"
        >
            <button
                type="button"
                onClick={onSendLater}
                title="Schedule this message for later"
                className={secondaryClass}
                data-adminv2-composer-send-later="true"
            >
                Send later
            </button>
            <BosButton
                variant="secondary"
                size="sm"
                label="BOS"
                onClick={onBosEnhance}
                title="Polish this message with BOS"
                data-adminv2-composer-bos-assist="true"
            />
            <button
                type="button"
                disabled={sendDisabled || sendBusy}
                onClick={onSend}
                className="rounded-md bg-[#00A283] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#009276] disabled:cursor-not-allowed disabled:opacity-45"
            >
                {sendBusy ? "Sending…" : sendLabel}
            </button>
        </div>
    );
}
