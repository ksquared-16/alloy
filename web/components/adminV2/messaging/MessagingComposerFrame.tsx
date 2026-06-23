"use client";

import { useRef, type ReactNode } from "react";

import ComposerChannelToggle, { type ComposerChannel } from "@/components/adminV2/messaging/ComposerChannelToggle";
import ComposerMessageTextToolbar from "@/components/adminV2/messaging/ComposerMessageTextToolbar";
import ComposerReplyActionCluster from "@/components/adminV2/messaging/ComposerReplyActionCluster";

export type MessagingComposerFrameProps = {
    compact?: boolean;
    heading?: string | null;
    headingExtra?: ReactNode;
    channel: ComposerChannel;
    onChannelChange: (channel: ComposerChannel) => void;
    emailDisabled?: boolean;
    smsDisabled?: boolean;
    emailDisabledTitle?: string;
    smsDisabledTitle?: string;
    channelHint?: string | null;
    subject?: string;
    onSubjectChange?: (value: string) => void;
    showSubject?: boolean;
    body: string;
    onBodyChange: (value: string) => void;
    bodyDisabled?: boolean;
    bodyPlaceholder?: string;
    bodyRows?: number;
    bodyMinHeightClass?: string;
    sendDisabled?: boolean;
    sendBusy?: boolean;
    sendLabel?: string;
    onSend?: () => void;
    onSendLater?: () => void;
    onBosEnhance?: () => void;
    error?: string | null;
    okNote?: string | null;
    okNoteTone?: "success" | "warning";
    footerNote?: string | null;
    className?: string;
    dataTestId?: string;
};

export default function MessagingComposerFrame({
    compact = false,
    heading = null,
    headingExtra = null,
    channel,
    onChannelChange,
    emailDisabled = false,
    smsDisabled = false,
    emailDisabledTitle,
    smsDisabledTitle,
    channelHint = null,
    subject = "",
    onSubjectChange,
    showSubject = true,
    body,
    onBodyChange,
    bodyDisabled = false,
    bodyPlaceholder = "Write your message…",
    bodyRows = 3,
    bodyMinHeightClass = "",
    sendDisabled = false,
    sendBusy = false,
    sendLabel = "Send now",
    onSend,
    onSendLater,
    onBosEnhance,
    error = null,
    okNote = null,
    okNoteTone = "success",
    footerNote = null,
    className = "",
    dataTestId = "adminv2-messaging-composer",
}: MessagingComposerFrameProps) {
    const inputClass = compact
        ? "w-full rounded-md border border-alloy-stone/18 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 disabled:opacity-50"
        : "w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-pine/40 focus:outline-none focus:ring-2 focus:ring-alloy-pine/15 disabled:opacity-60";

    const bodyRef = useRef<HTMLTextAreaElement | null>(null);

    return (
        <div className={className} data-adminv2-messaging-composer="true" data-testid={dataTestId}>
            {heading || headingExtra ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                    {heading ? (
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            {heading}
                        </p>
                    ) : (
                        <span />
                    )}
                    {headingExtra}
                </div>
            ) : null}

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <ComposerChannelToggle
                    compact={compact}
                    channel={channel}
                    onChange={onChannelChange}
                    emailDisabled={emailDisabled}
                    smsDisabled={smsDisabled}
                    emailDisabledTitle={emailDisabledTitle}
                    smsDisabledTitle={smsDisabledTitle}
                />
            </div>

            {channelHint ? <p className="mb-2 text-[10px] text-alloy-midnight/50">{channelHint}</p> : null}

            {showSubject && channel === "email" ? (
                <input
                    type="text"
                    value={subject}
                    onChange={(e) => onSubjectChange?.(e.target.value)}
                    disabled={bodyDisabled || sendBusy}
                    placeholder="Subject"
                    className={`mb-2 ${inputClass}`}
                    autoComplete="off"
                />
            ) : null}

            <ComposerMessageTextToolbar
                compact={compact}
                value={body}
                onChange={onBodyChange}
                textareaRef={bodyRef}
                className="mb-2"
            />

            <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                disabled={bodyDisabled || sendBusy}
                placeholder={bodyPlaceholder}
                rows={bodyRows}
                className={`${inputClass} resize-none leading-snug disabled:cursor-not-allowed disabled:bg-alloy-stone/[0.04] disabled:opacity-70 ${bodyMinHeightClass}`.trim()}
            />

            {error ? <p className="mt-2 text-[11px] text-red-700/90">{error}</p> : null}
            {okNote ? (
                <p
                    className={`mt-2 text-[11px] ${
                        okNoteTone === "warning" ? "text-amber-900/90" : "text-[#007a62]"
                    }`}
                >
                    {okNote}
                </p>
            ) : null}
            {footerNote ? <p className="mt-1 text-[10px] text-alloy-midnight/50">{footerNote}</p> : null}

            <div className="mt-2">
                <ComposerReplyActionCluster
                    compact={compact}
                    sendBusy={sendBusy}
                    sendDisabled={sendDisabled}
                    sendLabel={sendLabel}
                    onSend={onSend}
                    onSendLater={onSendLater}
                    onBosEnhance={onBosEnhance}
                />
            </div>
        </div>
    );
}
