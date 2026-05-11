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
    startAt: Date;
    endAt: Date;
    timezone?: string | null;
    locationId?: string | null;
    correlationId?: string | null;
};

export type CancelTourBookingInput = {
    canceledBy: string;
    cancelReason?: string | null;
    correlationId?: string | null;
};
