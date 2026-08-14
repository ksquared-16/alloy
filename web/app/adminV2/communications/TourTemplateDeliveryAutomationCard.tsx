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
import { AlloyCheckbox } from "@/app/adminV2/pos/ProcessingAlloyControls";
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
    /** embedded = legacy section card; modal = body-only for centered automation pop-out */
    presentation?: "embedded" | "modal";
    templateName?: string | null;
};

/**
 * Registered relative-time anchors currently resolvable for Tour communications.
 * Do not invent Billing/Payment anchors here — only surfaces that already resolve at runtime.
 */
const TOUR_TEMPORAL_ANCHORS = [{ key: "tour.start", label: "Tour start" }] as const;

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

function AutomationRuleFields({
    eventKey,
    draft,
    disabled = false,
    onChange,
    templateName,
}: Omit<Props, "presentation">) {
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
        <div className="flex flex-col gap-3" data-tour-delivery-automation="true">
            {templateName ? (
                <p className="text-[12px] text-alloy-midnight/65" data-automation-template-preselect="true">
                    Template: <span className="font-semibold text-alloy-midnight">{templateName}</span>
                </p>
            ) : null}

            {showReminder ? (
                <div className="flex flex-col gap-2" data-tour-delivery-reminder="true">
                    <div data-tour-reminder-enabled={draft.reminderEnabled ? "true" : "false"}>
                        <AlloyCheckbox
                            checked={draft.reminderEnabled}
                            disabled={disabled}
                            label="Reminder enabled"
                            testId="tour-reminder-enabled"
                            onChange={(reminderEnabled) => patch({ reminderEnabled })}
                        />
                    </div>

                    <div className="flex flex-wrap items-end gap-1.5">
                        <span className="pb-1.5 text-[11px] font-medium text-alloy-midnight/55">Send</span>
                        <label className={COMMS_FIELD_STACK_CLASS}>
                            <span className={COMMS_FIELD_LABEL_CLASS}>Amount</span>
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
                        <label className={COMMS_FIELD_STACK_CLASS}>
                            <span className={COMMS_FIELD_LABEL_CLASS}>Relation</span>
                            <select
                                data-tour-reminder-relation="true"
                                value="before"
                                disabled={disabled || !draft.reminderEnabled}
                                className={`${COMMS_INPUT_CLASS} !w-[5.5rem]`}
                            >
                                <option value="before">before</option>
                            </select>
                        </label>
                        <label className={COMMS_FIELD_STACK_CLASS}>
                            <span className={COMMS_FIELD_LABEL_CLASS}>When</span>
                            <select
                                data-tour-reminder-anchor="true"
                                value={TOUR_TEMPORAL_ANCHORS[0].key}
                                disabled={disabled || !draft.reminderEnabled}
                                className={`${COMMS_INPUT_CLASS} !min-w-[7.5rem]`}
                            >
                                {TOUR_TEMPORAL_ANCHORS.map((a) => (
                                    <option key={a.key} value={a.key}>
                                        {a.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="flex flex-col gap-1">
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
                        <span className={COMMS_FIELD_LABEL_CLASS}>Recipients</span>
                        <input
                            data-tour-parent-recipient-policy="true"
                            value={TOUR_COMMS_STUDIO_PARENT_RECIPIENT_LABEL}
                            readOnly
                            disabled
                            className={`${COMMS_INPUT_CLASS} bg-alloy-stone/[0.04] text-alloy-midnight/60`}
                        />
                    </label>
                    <div
                        className="self-end pb-0.5"
                        data-tour-ask-parent-confirm={draft.askParentConfirmAttendance ? "true" : "false"}
                    >
                        <AlloyCheckbox
                            checked={draft.askParentConfirmAttendance}
                            disabled={disabled || !draft.reminderEnabled}
                            label="Ask parent to confirm attendance"
                            testId="tour-ask-parent-confirm"
                            onChange={(askParentConfirmAttendance) => patch({ askParentConfirmAttendance })}
                        />
                    </div>
                </div>
            ) : null}

            {showInternal ? (
                <div className="flex flex-col gap-1.5" data-tour-delivery-internal="true">
                    <p className={COMMS_SECTION_HELPER_CLASS}>{TOUR_COMMS_STUDIO_INHERITANCE_HELPER}</p>
                    <div
                        data-tour-internal-recipients-enabled={
                            draft.internalRecipientsEnabled ? "true" : "false"
                        }
                    >
                        <AlloyCheckbox
                            checked={draft.internalRecipientsEnabled}
                            disabled={disabled}
                            label="Send internal calendar notifications"
                            testId="tour-internal-recipients-enabled"
                            onChange={(internalRecipientsEnabled) => patch({ internalRecipientsEnabled })}
                        />
                    </div>
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
                    Delivery for this template follows org Tour communications policy. Configure Reminder,
                    Confirmation, Reschedule, or Cancel automations from those templates.
                </p>
            ) : null}
        </div>
    );
}

/**
 * Tour automation rule fields — content lives in TourCommsConfig (org policy), not the template body.
 * Prefer modal presentation from the Template editor; embedded section is compatibility only.
 */
export default function TourTemplateDeliveryAutomationCard({
    eventKey,
    draft,
    disabled = false,
    onChange,
    presentation = "embedded",
    templateName = null,
}: Props) {
    const body = (
        <AutomationRuleFields
            eventKey={eventKey}
            draft={draft}
            disabled={disabled}
            onChange={onChange}
            templateName={templateName}
        />
    );

    if (presentation === "modal") {
        return body;
    }

    return (
        <CommsSectionCard
            title="Delivery & automation"
            helper="Org-wide Tour scheduling policy — not stored in template content."
            data-tour-delivery-automation-section="true"
            dense
            className="shrink-0 !p-2.5"
        >
            {body}
        </CommsSectionCard>
    );
}
