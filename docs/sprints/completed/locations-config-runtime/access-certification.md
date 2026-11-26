# Access certification

**Status:** Complete and acceptance-tested for Configuration Runtime V1.

## Certified behavior

- Access stays within the selected Location workspace while using the existing organization member and scope authority.
- View mode summarizes team members and administrators with access, then lists the current people and roles.
- Manage Location Access is an intentional edit disclosure. Each member shows role hierarchy and whether access is organization-wide or selected-location scoped.
- Add/Remove remains attached to the affected member. The editor prevents a restricted member from being saved with no locations.
- No privileged client write or parallel access model was introduced.

## Mutation certification

- Add Location access — authoritative response PASS; local member list/count PASS; hard refresh PASS.
- Remove Location access — authoritative response PASS; local member list/count PASS; hard refresh PASS.
- Existing organization-wide scope restored after certification.
- Overview Access readiness is recomputed through the same member provider after committed changes.

## Evidence

- `screenshots/134-access-view-final.png`
- `screenshots/135-access-edit-final.png`
