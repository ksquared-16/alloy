/**
 * Who is IN a repeatable group — read-only member classification for participant surfaces.
 *
 * One implementation, owned by the Forms submission authority, so the participant review counts
 * "at least 2 emergency contacts" exactly the way the submission is judged. Surfaces that only read
 * (the compiled participant review) import it from here rather than reaching into the submission
 * module.
 */
export {
    completeGroupMemberCount,
    groupMemberState,
    outstandingRequiredCollections,
    type GroupMemberState,
} from "./validateSubmission";
