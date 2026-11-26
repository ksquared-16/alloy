/**
 * Process Engine — the participation contract.
 *
 * The MINIMAL declaration a Business Process gives the engine. The engine knows only
 * subject · context · stage · state. It knows nothing about grain, table names, creation rules, or
 * any process's constants — those live in the process Definition and in Presentation.
 *
 * Enrollment is ONE contract instance (see definitions/enrollment). Billing/Staffing/Compliance add
 * their own contract + projection + semantics in their own folders with ZERO engine edits.
 */

export type ProcessParticipationContract = {
    /** process_instances.process_key this contract governs (e.g. "enrollment"). */
    processKey: string;
    /** process_instances.subject_type for this process (Enrollment: "child"). */
    subjectType: string;
    /** process_instances.context_type for this process (Enrollment: "opportunity"). */
    contextType: string;
    /**
     * Whether a participant with no own stage inherits its context's stage (the coalesce). Replaces
     * the old `"opportunities.stage_key"` literal — the engine never names a table. `false` → the
     * participant stage stands alone.
     */
    inheritsContextStage: boolean;
};
