/** Default persons.status_key for adults/children created through enrollment intake. */
export const ENROLLMENT_INTAKE_PERSON_STATUS_KEY = "pre_enrolled";

export function enrollmentIntakePersonStatusFields(): { status_key: string } {
    return { status_key: ENROLLMENT_INTAKE_PERSON_STATUS_KEY };
}
