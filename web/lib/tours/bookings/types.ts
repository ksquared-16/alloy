export type TourBookingStatusKey =
    | "requested"
    | "pending_approval"
    | "confirmed"
    | "rescheduled"
    | "canceled"
    | "completed"
    | "no_show";

export type TourBookingSourceKey = "admin" | "public_link" | "form_submission" | "automation";

export type TourBookingRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    location_id: string;
    primary_person_id: string | null;
    primary_contact_id: string | null;
    requested_by_user_id: string | null;
    start_at: string;
    end_at: string;
    timezone: string;
    status_key: string;
    source: string;
    form_submission_id: string | null;
    form_public_link_id: string | null;
    canceled_at: string | null;
    canceled_by: string | null;
    cancel_reason: string | null;
    rescheduled_from_booking_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
};

export type CreateTourBookingInput = {
    orgId: string;
    opportunityId: string;
    locationId: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    source: TourBookingSourceKey;
    requestedByUserId?: string | null;
    primaryPersonId?: string | null;
    primaryContactId?: string | null;
    formSubmissionId?: string | null;
    formPublicLinkId?: string | null;
    metadata?: Record<string, unknown>;
    correlationId?: string | null;
    /**
     * Defer the confirmation send to the caller.
     *
     * `createTourBooking` is the canonical DOMAIN service: it owns the booking row and
     * the lifecycle event, and it must never own public action credentials, public
     * template URLs, or invitation-channel assumptions. But the public booking flow
     * cannot render a useful confirmation until it has minted the scoped
     * reschedule/cancel credentials, which can only exist AFTER the booking commits.
     *
     * Sending inside the transaction therefore produced a confirmation with no
     * actions in it. Setting this to `true` makes the caller responsible for invoking
     * the SAME tour communications orchestrator once, after minting.
     *
     * Default `false` preserves existing admin/non-public behaviour exactly: those
     * callers have no public credentials to mint and still get their confirmation
     * from here.
     */
    deferConfirmationComms?: boolean;
    /**
     * When set, overrides `approvalRequired` default for initial `status_key`.
     */
    initialStatus?: "requested" | "pending_approval" | "confirmed";
    /**
     * When true, initial status is `pending_approval`.
     * When false, initial status is `confirmed` unless `initialStatus` is set.
     */
    approvalRequired: boolean;
};

export type RescheduleTourBookingInput = {
    /**
     * Defer the lifecycle notification to the caller — same contract as
     * `CreateTourBookingInput.deferConfirmationComms`. The public flow mints fresh
     * scoped credentials AFTER this commits, and a message sent before they exist
     * offers the parent no way to act. Default `false` keeps admin behaviour intact.
     */
    deferLifecycleComms?: boolean;

    startAt: Date;
    endAt: Date;
    timezone?: string | null;
    locationId?: string | null;
    correlationId?: string | null;
};

export type CancelTourBookingInput = {
    /**
     * Defer the lifecycle notification to the caller — same contract as
     * `CreateTourBookingInput.deferConfirmationComms`. The public flow mints fresh
     * scoped credentials AFTER this commits, and a message sent before they exist
     * offers the parent no way to act. Default `false` keeps admin behaviour intact.
     */
    deferLifecycleComms?: boolean;

    canceledBy: string;
    cancelReason?: string | null;
    correlationId?: string | null;
};
