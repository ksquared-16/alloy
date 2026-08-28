# The stage rail reaches the child track

**Run:** `erun_2e9f4e94d9f299f5` · Switcher built · **Browser proof still owed** · Nothing mutated

## 1. What changed

A compact track selector on the Stages rail, bound to the `activeTrackKey` state, its setter and
`stagesForTrack` — all of which already existed. No new state model, no schema, no authority. The
handler is asserted to contain no `fetch` and no `action`: changing which stages you are *looking at*
writes nothing.

**Selection moves with the filter.** Switching keeps the current stage if it belongs to the track
being opened, and otherwise opens that track's first stage — leaving the editor pointing at a stage
the rail no longer lists would reproduce exactly the invisibility this fixes.

**The count now says what it counted.** `4 stages in Family Track`, not `4 configured` sitting beside
an Overview reading `8 stages`. Both numbers were always truthful and read the same authority; the
rail simply never said it was filtered. A process with a single track keeps the plain count and gets
no switcher — one track is not a choice.

## 2. Corrected counts and labels

| Surface | Reads | Shows |
|---|---|---|
| Process Overview / Journey | `activeStagesForProcess` | **8 stages** — unchanged, correct |
| Stages rail · Family Track | `stagesForTrack(…, "family_track")` | **4 stages in Family Track** |
| Stages rail · Child Track | `stagesForTrack(…, "child_track")` | **4 stages in Child Track** |

Verified against the **live tenant draft**, not a fixture:

```
tracks: Family Track (family_case) · Child Track (child_enrollment_track)   → switcher renders
Overview 8  ·  Family 4: lead, tour, decision, closed
            ·  Child  4: waitlist, enrolling, enrolled, closed_withdrawn
Enrolling: present, active, requirements_v1 absent (as expected)
```

## 3. 🛑 Browser proof — still owed, and I will not claim it

The stored slot-4 session is from **26 July** and points at shared dev. This lane still cannot obtain
an authenticated session: manual login only, the rotated credential is not held here, and a
credential-free mint was refused by the sandbox. So I have not seen this render in the running app.

What I did differently this time, because the last click-path was wrong: I stopped reasoning from
source about data I had never read, and checked the **actual tenant payload** drives the control —
two tracks (so `showTracks` is true), and `enrolling` present and active in the child track. That
closes the specific gap that made the previous handoff wrong. It is not a substitute for opening the
page, and the first screen you land on will confirm or refute it in one glance.

## 4. Click path to Enrolling → Requirements

1. **Sign in** — `http://127.0.0.1:3014/login` (the IP literal; the cookie is scoped to it and
   `localhost` bounces you back to login).
2. `http://127.0.0.1:3014/organization/processes` → the **Enrollment** process.
3. Open the **Stages** section. The rail shows **Family Track** with 4 stages and, above the list,
   two pills: **Family Track · Child Track**.
4. Click **Child Track**. The rail becomes Waitlist · **Enrolling** · Enrolled · Closed / Withdrawn.
5. Click **Enrolling**.
6. Open the **Requirements** section (it starts collapsed). Under the field requirements is
   **“Forms this stage requires.”**

Then, as you said you'd do yourself: add the five certified Forms in order at `required`/`blocking`,
**Save requirements**, click **Begin new enrollments in Enrolling**, then **Validate** and **Publish**
in the publication bar at the top of the same editor.

If step 3 shows no pills, stop there and tell me — that is this fix failing, and it is one component.

## 5. Certification evidence — unaffected

Nothing here touches configuration or evidence. Still valid: five executable Forms · Studio Packet
`579327c1` · the requirement-derived packet proof (5 forms, same order, same identities, 3 uploads,
5 signatures, **0** bank-credential asks, zero drift) · entry intent · Participant Runtime · the
Financials deferral · the `description` round-trip repair · the two canonical authoring actions.

Tenant untouched: draft `fa0b9c36` · `draft_revision` 1 · revisions **0** · instances **0** ·
`entry_points_v1` null · `requirements_v1` absent on all 8 stages.

## 6. Recorded, not implemented — compact Enrollment paperwork

The next productization slice, deliberately deferred:

```
Enrollment paperwork
5 forms required
[ Change paperwork ]
```

Choosing a Studio Packet performs a **one-time compile** of its Form identities into canonical
`requirements_v1`. The Packet stays non-authoritative; BP stays authoritative; runtime continues to
derive its packet from requirements. **No live link** between Packet and BP — the compile is a visible
authoring act the operator can edit afterwards, not a subscription.

`StageFormRequirementsEditor` stays exactly where it is as the advanced surface beneath it. BP owns
requirements; requirements live on a stage.
