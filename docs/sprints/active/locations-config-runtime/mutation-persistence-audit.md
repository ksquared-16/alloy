# Locations Configuration Runtime — mutation persistence audit

**Status:** Release-blocking audit complete for every mutation provider available in the local organization.  
**Evidence date:** 2026-07-16.  
**Method:** mutate through the UI, inspect the authoritative mutation response, verify local state, hard-refresh, reopen the same object, verify the read surface, then restore or delete all audit data.

## Mutation matrix

### Location

- **Create location — PASS.** Name, address/locality, phone, timezone, and active state were present in the POST response, local selector, and hard-refresh read model. Temporary location deleted.
- **Name — PASS.** PATCH response, local editor, hard refresh, and object identity agreed.
- **Address / locality — PASS.** Street, city, state, and postal code survived hard refresh and updated location identity.
- **Phone — PASS.** `metadata.site_phone` survived hard refresh.
- **Timezone — PASS.** `metadata.timezone` survived hard refresh and the readiness model consumed it.
- **Active state — PASS.** Boolean false was returned and survived hard refresh.

### Program

- **Create program — PASS.** The created category row appeared locally and after hard refresh. Temporary category deleted.
- **Name — PASS.** `label` returned, updated locally, and survived hard refresh.
- **Active state — PASS.** Boolean false returned and survived hard refresh.
- **Age-range start — PASS.** The zero string `"0"` returned in metadata and survived hard refresh.
- **Age-range end — PASS.** Returned in metadata and survived hard refresh.
- **Age-range unit — PASS.** Returned in metadata and survived hard refresh.
- **Default room types — PASS.** Returned in `metadata.default_room_types` and rehydrated in the editor. This field has no derived readiness or operating-summary consumer by current product design.
- **Other editable fields — PASS.** Sort order remains supported by the route; no sort-order editor is currently exposed in this workspace.

### Room

- **Create room — PASS after fix.** The POST response now contains the owning `parent_location_id`; the new room appears locally and after hard refresh. Temporary room deleted.
- **Name — PASS.**
- **Program — PASS.** `metadata.category` returned and the Program participation summary consumed it.
- **Capacity — PASS.** `metadata.capacity` returned and location/program capacity summaries consumed it.
- **Staffing thresholds — PASS.** Serialized `student_teacher_ratio` returned, rendered locally, and survived hard refresh.
- **Age range — PASS.** Start, end, and unit returned and survived hard refresh.
- **Active state — PASS.**

### Schedule

- **Create pattern — PASS after fix.** Name and weekdays returned, appeared locally, survived hard refresh, and the temporary pattern was deleted.
- **Pattern name — PASS.**
- **Weekdays — PASS.** Array response and hard-refresh selection agreed.
- **Active state — PASS.**
- **Edit pattern — PASS.** Mutation response, local editor, hard refresh, and schedule summary agreed.
- **Closures / holidays — NOT EXPOSED.** The surface explicitly states that no date-specific closure provider is available and renders no mutation control.

### Tours

- **Create availability window — PASS.** Day, start/end, timezone, duration, buffer, booking limit, and approval requirement returned, rendered locally, and survived hard refresh.
- **Active state — PASS.** Toggle response and hard-refresh inactive state agreed.
- **Delete window — PASS.** DELETE returned `{ ok: true }`; audit records were removed.

### Placement

- **Enabled, ordering mode, factor selection, factor order — CODE PASS / RUNTIME NOT APPLICABLE.** The local organization has no waitlist-enabled Business Process, so the workspace exposes no save control. The route deep-merges and validates `placement_priority_v1`; the UI now refuses success unless the authoritative response contains the submitted layer.

### Access

- **Add/remove location access — PASS.** Authoritative response, local member row, hard refresh, and member count agreed. The tested all-sites admin scope was restored immediately afterward.

### Cross-location Apply

- **REMOVED FROM EXPOSED ACTIONS.** The previous dialog only displayed a “Ready to apply” notice and performed no mutation. It is now hidden across Overview, Programs, Rooms, Schedule, and Tours until an authoritative copy provider exists.

## Root causes and fixes

1. **Program age range false success**
   - Editor and read model both used `location_program_categories.metadata`.
   - The client sent the complete metadata object.
   - The PATCH responder accepted only label, sort order, and active state, silently ignored metadata, returned HTTP 200, and echoed the old row.
   - Fix: validate and persist metadata, preserve zero/null/empty-object semantics, return the authoritative row, and require the client to prove that the response contains the requested patch before closing.

2. **Room creation lost its owner**
   - The client sent `parent_location_id`.
   - The Location POST responder omitted that field from the insert, producing an orphan `unit` that could not appear in the selected location’s room collection.
   - Fix: require a parent for room units, verify that the parent is an org-scoped site, persist the FK, and apply the authoritative POST row locally.

3. **Schedule creation action self-cancelled**
   - The action set create mode to true and immediately called `navigate`, whose shared reset set it back to false.
   - Fix: the Schedule-only action now enters create mode without the conflicting navigation reset.

4. **HTTP success was treated as persistence proof**
   - Several clients accepted `2xx`, then refreshed or closed without checking the returned fields.
   - Fix: Location, Program, Room, Schedule, Tours, Placement, Access, and create paths now validate authoritative response contents, including arrays, nested metadata, false, null, and zero.

5. **Apply implied a mutation without one**
   - The dialog performed no copy and showed success-adjacent notice text.
   - Fix: remove the actions until a durable copy substrate exists; doctrine now forbids exposing Apply before its provider.

## Evidence

- Runtime acceptance: Location create/edit; Program create/edit; Room create/edit; Schedule create/edit; Tours create/toggle/delete; Access add/remove.
- Test data cleanup: zero temporary Location, Program, Schedule, or Tour rows remain.
- Focused tests: `43 passed`.
- Production typecheck: passed.
- Test-graph typecheck: recorded in the sprint handoff.

## Intentionally deferred gaps

- Placement runtime acceptance requires an eligible waitlist-enabled Business Process. No mutation control is exposed without one.
- Closures/holidays remain read-only because no provider exists.
- Cross-location Apply remains hidden until its authoritative provider is implemented and acceptance-tested.
