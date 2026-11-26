export {
    TOUR_BOOKING_BLOCKING_STATUS_KEYS,
    TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS,
    TOUR_LIFECYCLE_EVENT_TYPES,
    TOUR_BOOKING_ENTITY_TYPE,
} from "./constants";
export type { TourLifecycleEventType, TourBookingBlockingStatusKey, TourBookingActiveNonTerminalStatusKey } from "./constants";

export { computeAvailableTourSlots } from "./availability/computeAvailableTourSlots";
export type { ComputeAvailableTourSlotsParams, AvailableTourSlot, TourAvailabilityRuleRow, TourBookingOverlapRow } from "./availability/types";
export {
    computeSlotsFromRulesAndBookings,
    dayOfWeekSun0FromUtc,
    parsePgTimeToParts,
    isSlotOffered,
} from "./availability/internalCompute";

export {
    createTourBooking,
    confirmTourBooking,
    rescheduleTourBooking,
    cancelTourBooking,
    markTourBookingCompleted,
    markTourBookingNoShow,
} from "./bookings/tourBookingService";
export type { CreateTourBookingInput, RescheduleTourBookingInput, CancelTourBookingInput, TourBookingRow } from "./bookings/types";

export { emitTourBookingLifecycleEvent } from "./events/tourLifecycleEvents";
export type { EmitTourLifecycleContext } from "./events/tourLifecycleEvents";

export {
    applyTourBookingOpportunityIntegration,
    deriveTourMetadataMirrorFromBooking,
    TOUR_BOOKING_OPPORTUNITY_STATUS,
} from "./opportunity/tourBookingOpportunityIntegration";
export type { TourBookingOpportunityIntegrationKind } from "./opportunity/tourBookingOpportunityIntegration";

export {
    DEFAULT_TOUR_COMMS_CONFIG,
    TOUR_COMMS_CHANNELS,
    TOUR_COMMS_EVENT_KEYS,
    TOUR_COMMS_SCHEDULED_SEND_METADATA,
    TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE,
    extractTourCommsMetadataRoot,
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
} from "./comms/tourCommsConfig";
export type {
    ResolveTourCommsConfigInput,
    ResolveTourCommsConfigResult,
    TourCommsChannel,
    TourCommsConfig,
    TourCommsConfigMetadataFragment,
    TourCommsEventKey,
    TourCommsInternalRecipientsPolicy,
    TourCommsIcsPolicy,
    TourCommsParentRecipientPolicy,
    TourCommsQuietHoursConfig,
    TourCommsTemplate,
    TourCommsTemplates,
    TourReminderOffset,
    TourSchedulingScheduledSendSource,
} from "./comms/tourCommsConfig";
export { resolveTourCommsConfig } from "./comms/resolveTourCommsConfig";
export {
    applyTourCommsPlaceholders,
    getDefaultTourCommsTemplateSet,
    normalizeTourCommsEventKey,
    omitEmptyOptionalTourCommsLines,
    renderTourCommsTemplate,
} from "./comms/tourCommsTemplates";
export type {
    RenderedTourCommsEmail,
    RenderedTourCommsMessage,
    RenderedTourCommsSms,
    RenderTourCommsTemplateInput,
    TourCommsDefaultTemplateSet,
    TourCommsTemplateEventAlias,
} from "./comms/tourCommsTemplates";
export {
    buildTourCommsMergeFields,
    formatTourCommsDateTimeLabels,
} from "./comms/tourCommsTemplateContext";
export type { TourCommsFormattedDateTimeLabels, TourCommsTemplateContext } from "./comms/tourCommsTemplateContext";
export {
    buildGoogleCalendarUrl,
    buildOutlookCalendarUrl,
    buildTourAddToCalendarLinks,
    buildTourAddToCalendarLinksFromContext,
    buildTourIcsDownloadPath,
    buildTourIcsDownloadUrl,
    resolveTourCalendarAbsoluteUrl,
    tourAddToCalendarEventFromContext,
    withTourAddToCalendarLinks,
} from "./comms/tourAddToCalendarLinks";
export type {
    TourAddToCalendarEventInput,
    TourAddToCalendarLinks,
    TourIcsDownloadPathInput,
} from "./comms/tourAddToCalendarLinks";
export {
    buildTourBookingIcs,
    buildTourBookingIcsUid,
    escapeIcsText,
    formatIcsUtcDateTime,
    tourBookingStatusKeyToIcsStatus,
} from "./comms/tourBookingIcs";
export type {
    BuildTourBookingIcsInput,
    TourBookingIcsEventStatus,
    TourBookingIcsMethod,
} from "./comms/tourBookingIcs";
export {
    buildTourReminderSchedulePlans,
    computeTourReminderInstant,
    deferTourReminderFromQuietHours,
    evaluateTourReminderScheduledTime,
    isInstantInQuietHours,
    isTourBookingEligibleForReminders,
    isTourBookingTerminalForReminders,
    resolveTourReminderTimezone,
} from "./comms/tourReminderTiming";
export type {
    TourReminderSchedulePlan,
    TourReminderSuppressionReason,
    TourReminderTimingResult,
} from "./comms/tourReminderTiming";
export {
    TOUR_COMMS_OUTBOUND_METADATA,
    TOUR_COMMS_OUTBOUND_SOURCE,
} from "./comms/tourCommsConfig";
export { loadTourCommsContext } from "./comms/loadTourCommsContext";
export type { LoadedTourCommsContext, LoadTourCommsContextInput } from "./comms/loadTourCommsContext";
export {
    resolveTourCommsParentRecipient,
    tourCommsRecipientHasChannel,
} from "./comms/resolveTourCommsRecipient";
export type { TourCommsParentRecipient } from "./comms/resolveTourCommsRecipient";
export {
    buildTourCommsImmediateIdempotencyKey,
    buildTourCommsImmediateOutboundMetadata,
    hasExistingTourCommsImmediateSend,
    orchestrateTourBookingCanceled,
    orchestrateTourBookingCompleted,
    orchestrateTourBookingConfirmed,
    orchestrateTourBookingNoShow,
    orchestrateTourBookingRescheduled,
    orchestrateTourCommsForBooking,
    resolveTourCommsActorUserId,
    resolveTourCommsScheduleGeneration,
    runTourCommsOrchestratorBestEffort,
} from "./comms/tourCommsOrchestrator";
export type {
    TourCommsImmediateSendResult,
    TourCommsOrchestrationResult,
    TourCommsOrchestrateInput,
    TourCommsOrchestratorDeps,
    TourCommsReminderActionResult,
} from "./comms/tourCommsOrchestrator";
export {
    TOUR_REMINDER_EVENT_KEY,
    TOUR_SCHEDULING_REMINDER_BODY_PLACEHOLDER,
    TOUR_SCHEDULING_REMINDER_SUBJECT_PLACEHOLDER,
    buildTourSchedulingReminderMetadata,
    cancelPendingTourSchedulingRemindersForBooking,
    insertTourSchedulingReminderSend,
    listPendingTourSchedulingRemindersForBooking,
    replaceTourSchedulingRemindersForBooking,
    resolveTourSchedulingReminderApprovedAtIso,
    scheduleTourSchedulingRemindersForBooking,
} from "./comms/tourSchedulingScheduledSends";
export type {
    ReplaceTourSchedulingRemindersResult,
    ScheduleTourSchedulingRemindersForBookingInput,
    ScheduleTourSchedulingRemindersResult,
    TourSchedulingReminderBookingRef,
    TourSchedulingReminderMetadata,
    TourSchedulingReminderSnapshot,
    TourSchedulingReminderSuppressed,
} from "./comms/tourSchedulingScheduledSends";
