# Programs certification — section 4

**Status:** Implemented — awaiting product certification.  
**Frozen:** Header, Location Navigation, Overview, and every non-Programs tab.

## Critique

The directional model feels premium because the selected object owns the workspace, the sibling list is clearly supporting navigation, and the detail begins with operational understanding before exposing controls.

The previous Programs implementation still felt CRUD because:

- the 13.5rem queue resembled a database-row selector;
- six boxed cells exposed schema-like concepts, including “Ownership: Set here”;
- status was repeated in both the header and metrics;
- list chrome used an uppercase queue label and a whisper-weight “+ Add”;
- the Actions rail duplicated Add Program;
- the detail described fields before establishing participation, capacity, age, and schedule as one operating picture.

## Alloy translation

| Concern | Certified choice | Why |
| --- | --- | --- |
| Master/detail | 16rem supporting collection + primary detail | Selected Program owns the workspace |
| Collection header | Programs + count + compact Add Program | Creation belongs with the collection |
| Program rows | Name + Active/Inactive + rooms + capacity | Operational scan, not stored-field scan |
| Selected state | Shared Bend-Pine wash + 3px inset | Canonical object selection |
| View hierarchy | Header → consequence → operating picture → relationships → attention | Understanding precedes editing |
| View metrics | Participation, Capacity, Age range, Schedule | Removes duplicate status and schema “Ownership” |
| Relationships | Location + room participation as hairline rows | Shows how the object belongs and operates |
| Edit mode | Identity → Capacity → Age range → Schedule → Advanced | Focused configuration; overview is hidden |
| Empty state | Add Program in collection chrome and detail CTA | No dead whitespace |
| Actions | Add inline; Edit on selected object; Apply hidden; no Duplicate | No command is exposed before it has a durable provider |

## View and edit contract

View mode contains no editor fields. Edit mode contains no operating overview. Capacity and participation remain derived from rooms and are therefore explanatory rather than directly editable.

## Screenshots

- Before: `screenshots/programs-before.png`
- After: `screenshots/programs-after.png`

## Scope

No Header, Navigation, Overview, Rooms, Schedule, Tours, Placement, or Access changes belong to this certification.
