/**
 * Command inventory — Enrollment Focus Panel / What's Next presentation audit.
 * Convergence targets shared Command Surface / Current Work hosts; do not rebuild conforming hosts.
 */

export type EnrollmentCommandAuditRow = {
    command: string;
    existingRuntime: string;
    existingPresentation: string;
    immediateOpen: boolean;
    confirmPattern: string;
    needsConvergence: boolean;
    notes: string;
};

/** Snapshot of currently exposed Enrollment commands after this sprint's host wiring. */
export const ENROLLMENT_COMMAND_SURFACE_AUDIT: EnrollmentCommandAuditRow[] = [
    {
        command: "Contact Family",
        existingRuntime: "communications_composer → CommunicationsDrawerSection",
        existingPresentation: "Centered Current Work composer",
        immediateOpen: true,
        confirmPattern: "Composer Confirm send / Send now",
        needsConvergence: false,
        notes: "Already on shared communications host",
    },
    {
        command: "Add Child",
        existingRuntime: "header_delegate → relationship / inquiry child modal",
        existingPresentation: "Relationship modal (semantics unchanged)",
        immediateOpen: true,
        confirmPattern: "Modal save",
        needsConvergence: true,
        notes: "Presentation convergence only — Bend Pine / shell grammar follow-up if modal not yet matching",
    },
    {
        command: "Add Family Member",
        existingRuntime: "header_delegate → relationship action",
        existingPresentation: "Relationship modal",
        immediateOpen: true,
        confirmPattern: "Modal save",
        needsConvergence: true,
        notes: "Same relationship host as Add Child",
    },
    {
        command: "Schedule Tour",
        existingRuntime: "inline_form → OpportunityTourScheduleActionModal",
        existingPresentation: "Centered Current Work panel",
        immediateOpen: true,
        confirmPattern: "Schedule confirm in panel",
        needsConvergence: false,
        notes: "Already inline_form host",
    },
    {
        command: "Send Tour Invitation",
        existingRuntime: "communications_composer → CurrentWorkTourInvitationPanel (prepare → compose → mark_sent)",
        existingPresentation: "Centered command card + editable compose",
        immediateOpen: true,
        confirmPattern: "Confirm send (no silent send)",
        needsConvergence: false,
        notes: "Converged this sprint; Manage path prepare + QuickMessage seed",
    },
    {
        command: "Move to Waitlist",
        existingRuntime: "subject_selector → waitlist_child execute per OCM",
        existingPresentation: "Centered select → preview → confirm",
        immediateOpen: true,
        confirmPattern: "Confirm Move to Waitlist",
        needsConvergence: false,
        notes: "Multi-select + household→OCM ensure this sprint",
    },
    {
        command: "Make Primary Contact",
        existingRuntime: "header_delegate → relationship",
        existingPresentation: "Relationship / registry path",
        immediateOpen: true,
        confirmPattern: "Confirm in relationship host",
        needsConvergence: true,
        notes: "Presentation only",
    },
    {
        command: "Record Outcome",
        existingRuntime: "record_outcome workspace phase",
        existingPresentation: "Centered outcome picker when workspace open",
        immediateOpen: true,
        confirmPattern: "Existing outcome confirm",
        needsConvergence: false,
        notes: "Semantics preserved; shell when already on Current Work workspace",
    },
    {
        command: "Reschedule Tour",
        existingRuntime: "inline_form",
        existingPresentation: "Centered tour form",
        immediateOpen: true,
        confirmPattern: "Form confirm",
        needsConvergence: false,
        notes: "Tour ▾ member",
    },
    {
        command: "Cancel Tour",
        existingRuntime: "header_delegate / registered action",
        existingPresentation: "Confirm then execute",
        immediateOpen: true,
        confirmPattern: "confirmationPolicy",
        needsConvergence: false,
        notes: "Tour ▾ member",
    },
    {
        command: "Confirm Tour",
        existingRuntime: "registered confirm_tour",
        existingPresentation: "Execute with confirm",
        immediateOpen: true,
        confirmPattern: "confirmationPolicy",
        needsConvergence: false,
        notes: "Tour ▾ member",
    },
    {
        command: "Conduct Tour",
        existingRuntime: "registered / header_delegate",
        existingPresentation: "Execute path",
        immediateOpen: true,
        confirmPattern: "Existing",
        needsConvergence: false,
        notes: "Tour ▾ member when eligible",
    },
];
