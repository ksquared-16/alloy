"use client";

import {
    COMMS_CHIP_SELECTED_CLASS,
    COMMS_CHIP_UNSELECTED_CLASS,
    COMMS_FIELD_LABEL_CLASS,
    COMMS_FIELD_STACK_CLASS,
    COMMS_INPUT_CLASS,
    COMMS_SECTION_HELPER_CLASS,
    CommsSectionCard,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import TourInternalRecipientsMultiSelect from "@/app/adminV2/communications/TourInternalRecipientsMultiSelect";
import {
    TOUR_COMMS_STUDIO_INHERITANCE_HELPER,
    TOUR_COMMS_STUDIO_PARENT_RECIPIENT_LABEL,
    type TourCommsStudioDraft,
    tourTemplateShowsInternalRecipients,
    tourTemplateShowsReminderControls,
} from "@/lib/tours/comms/tourCommsStudioPolicy";
import type { TourSystemTemplateKey } from "@/lib/tours/comms/tourSystemTemplates";
import { TOUR_COMMS_CHANNELS, type TourCommsChannel } from "@/lib/tours/comms/tourCommsConfig";

type Props = {
    eventKey: TourSystemTemplateKey;
    draft: TourCommsStudioDraft;
    disabled?: boolean;
    onChange: (next: TourCommsStudioDraft) => void;
};

function ChannelToggle({
    channel,
    selected,
    disabled,
    onToggle,
}: {
    channel: TourCommsChannel;
    selected: boolean;
    disabled?: boolean;
    onToggle: () => void;
}) {
    const label = channel === "email" ? "Email" : "SMS";
    return (
        <button
            type="button"
            data-tour-delivery-channel={channel}
            aria-pressed={selected}
            disabled={disabled}
            onClick={onToggle}
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                selected ? COMMS_CHIP_SELECTED_CLASS : COMMS_CHIP_UNSELECTED_CLASS
            }`}
        >
            {label}
        </button>
    );
}

export default function TourTemplateDeliveryAutomationCard({ eventKey, draft, disabled = false, onChange }: Props) {
    const showReminder = tourTemplateShowsReminderControls(eventKey);
    const showInternal = tourTemplateShowsInternalRecipients(eventKey);

    const patch = (partial: Partial<TourCommsStudioDraft>) => onChange({ ...draft, ...partial });

    const toggleReminderChannel = (channel: TourCommsChannel) => {
        const next = draft.reminderChannels.includes(channel)
            ? draft.reminderChannels.filter((c) => c !== channel)
            : [...draft.reminderChannels, channel];
        patch({ reminderChannels: next });
    };

    return (
        <CommsSectionCard
            title="Delivery & automation"
            helper="Org-wide Tour scheduling policy — not stored in template content."
            data-tour-delivery-automation="true"
            dense
            className="shrink-0 !p-2.5"
        >
            {showReminder ? (
                <div
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                    data-tour-delivery-reminder="true"
                >
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-alloy-midnight/75">
                        <input
                            type="checkbox"
                            data-tour-reminder-enabled="true"
                            checked={draft.reminderEnabled}
                            disabled={disabled}
                            onChange={(e) => patch({ reminderEnabled: e.target.checked })}
                            className="rounded border-alloy-stone/35 text-alloy-juniper focus:ring-alloy-juniper/30"
                        />
                        Reminder enabled
                    </label>

                    <div className="flex flex-wrap items-end gap-1.5">
                        <label className={COMMS_FIELD_STACK_CLASS}>
                            <span className={COMMS_FIELD_LABEL_CLASS}>Send</span>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                data-tour-reminder-amount="true"
                                value={draft.reminderAmount}
                                disabled={disabled || !draft.reminderEnabled}
                                onChange={(e) => patch({ reminderAmount: Number(e.target.value) })}
                                className={`${COMMS_INPUT_CLASS} !w-[4.25rem]`}
                            />
                        </label>
                        <label className={COMMS_FIELD_STACK_CLASS}>
                            <span className={COMMS_FIELD_LABEL_CLASS}>Unit</span>
                            <select
                                data-tour-reminder-unit="true"
                                value={draft.reminderUnit}
                                disabled={disabled || !draft.reminderEnabled}
                                onChange={() => patch({ reminderUnit: "hours" })}
                                className={`${COMMS_INPUT_CLASS} !w-[5.5rem]`}
                            >
                                <option value="hours">hours</option>
                            </select>
                        </label>
                        <span className="pb-1.5 text-[11px] text-alloy-midnight/55">before tour</span>
                    </div>

                    <div className="flex flex-col gap-1 sm:items-end">
                        <span className={COMMS_FIELD_LABEL_CLASS}>Channels</span>
                        <div className="flex flex-wrap gap-1">
                            {TOUR_COMMS_CHANNELS.map((ch) => (
                                <ChannelToggle
                                    key={ch}
                                    channel={ch}
                                    selected={draft.reminderChannels.includes(ch)}
                                    disabled={disabled || !draft.reminderEnabled}
                                    onToggle={() => toggleReminderChannel(ch)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {showReminder ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className={COMMS_FIELD_STACK_CLASS}>
                        <span className={COMMS_FIELD_LABEL_CLASS}>Parent recipients</span>
                        <input
                            data-tour-parent-recipient-policy="true"
                            value={TOUR_COMMS_STUDIO_PARENT_RECIPIENT_LABEL}
                            readOnly
                            disabled
                            className={`${COMMS_INPUT_CLASS} bg-alloy-stone/[0.04] text-alloy-midnight/60`}
                        />
                    </label>
                    <label className="inline-flex items-center gap-1.5 self-end pb-1.5 text-[11px] font-medium text-alloy-midnight/75">
                        <input
                            type="checkbox"
                            data-tour-ask-parent-confirm="true"
                            checked={draft.askParentConfirmAttendance}
                            disabled={disabled || !draft.reminderEnabled}
                            onChange={(e) => patch({ askParentConfirmAttendance: e.target.checked })}
                            className="rounded border-alloy-stone/35 text-alloy-juniper focus:ring-alloy-juniper/30"
                        />
                        Ask parent to confirm attendance
                    </label>
                </div>
            ) : null}

            {showInternal ? (
                <div className="flex flex-col gap-1.5" data-tour-delivery-internal="true">
                    <p className={COMMS_SECTION_HELPER_CLASS}>{TOUR_COMMS_STUDIO_INHERITANCE_HELPER}</p>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-alloy-midnight/75">
                        <input
                            type="checkbox"
                            data-tour-internal-recipients-enabled="true"
                            checked={draft.internalRecipientsEnabled}
                            disabled={disabled}
                            onChange={(e) => patch({ internalRecipientsEnabled: e.target.checked })}
                            className="rounded border-alloy-stone/35 text-alloy-juniper focus:ring-alloy-juniper/30"
                        />
                        Send internal calendar notifications
                    </label>
                    <TourInternalRecipientsMultiSelect
                        id={`tour-internal-recipients-${eventKey}`}
                        selectedUserIds={draft.internalRecipientUserIds}
                        disabled={disabled || !draft.internalRecipientsEnabled}
                        onChange={(internalRecipientUserIds) => patch({ internalRecipientUserIds })}
                    />
                </div>
            ) : null}

            {!showReminder && !showInternal ? (
                <p className="text-[11px] text-alloy-midnight/55">
                    Delivery for this template follows org Tour communications policy. Edit Confirmation, Reminder,
                    Reschedule, or Cancel templates to configure automation.
                </p>
            ) : null}
        </CommsSectionCard>
    );
}
