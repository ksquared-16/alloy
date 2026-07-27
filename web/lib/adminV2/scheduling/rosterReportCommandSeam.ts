/**
 * Future Roster Report seam — do not surface a disabled/coming-soon action.
 *
 * When Generate Roster Report ships, it must consume the same canonical
 * Assignment roster projection (`AssignmentRosterSubject` / `buildAssignmentRosterReadModel`)
 * with the operator's current:
 *   - site
 *   - date range / week
 *   - roster filters / selection
 *
 * Command shape (future): filters + selection → Generate Roster Report
 * Truth owner: shared roster projection (not a report-specific duplicate).
 */
export const ROSTER_REPORT_COMMAND_SEAM = "assignment.generate_roster_report" as const;
