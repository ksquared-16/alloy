"use client";

export type ComposerChannel = "email" | "sms";

export type ComposerChannelToggleProps = {
    channel: ComposerChannel;
    onChange: (channel: ComposerChannel) => void;
    emailDisabled?: boolean;
    smsDisabled?: boolean;
    emailDisabledTitle?: string;
    smsDisabledTitle?: string;
    compact?: boolean;
    showSmsUnavailableLabel?: boolean;
    className?: string;
};

export default function ComposerChannelToggle({
    channel,
    onChange,
    emailDisabled = false,
    smsDisabled = false,
    emailDisabledTitle = "Email is not available",
    smsDisabledTitle = "SMS is not available yet",
    compact = false,
    showSmsUnavailableLabel = true,
    className = "",
}: ComposerChannelToggleProps) {
    const base = compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
    const inactive =
        "border border-alloy-stone/18 bg-white text-alloy-midnight/60 hover:bg-alloy-stone/6 disabled:cursor-not-allowed disabled:opacity-45";
    const active = "bg-[#00A283]/15 text-alloy-midnight ring-1 ring-[#00A283]/30";

    return (
        <div
            className={`flex flex-wrap gap-1 ${className}`}
            role="group"
            aria-label="Message channel"
            data-adminv2-composer-channel-toggle="true"
        >
            <button
                type="button"
                disabled={emailDisabled}
                title={emailDisabled ? emailDisabledTitle : "Send by email"}
                onClick={() => onChange("email")}
                className={`rounded-md font-semibold ${base} ${channel === "email" ? active : inactive}`}
            >
                Email
            </button>
            <button
                type="button"
                disabled={smsDisabled}
                title={smsDisabled ? smsDisabledTitle : "Send by SMS"}
                onClick={() => onChange("sms")}
                className={`rounded-md font-semibold ${base} ${channel === "sms" ? active : inactive}`}
            >
                SMS
                {showSmsUnavailableLabel && smsDisabled ? (
                    <span className="ml-1 font-normal opacity-70">(unavailable)</span>
                ) : null}
            </button>
        </div>
    );
}
