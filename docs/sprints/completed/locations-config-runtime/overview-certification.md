# Overview certification — section 3

**Status:** Certified and frozen for Configuration Runtime V1.
**Frozen:** Header, Location Navigation.
**Sources:** Directional “At a glance” mock + current Overview screenshot + configuration visual language.

**Screenshots:** `screenshots/overview-before.png`, `screenshots/overview-after.png`, `screenshots/121-overview-final.png`

**Final V1 resolution:** the top row is At a Glance (two-thirds) plus Operational Readiness (one-third). The bottom row is Needs Attention plus How this Location Runs at equal weight. At a Glance is the focal operating picture; Readiness visibly reconciles every dimension; issue actions remain attached to problem and impact; Tours, Placement, and Access remain one capability region. This final composition supersedes the intermediate region ordering discussed below.

---

## 1. Critique — why the mock feels stronger

- **One composed picture:** “At a glance” reads as a single operational summary (metrics + utilization), not four widgets.
- **Health before inventory:** Capacity meaning (enrolled / open / unavailable) is visual before counts.
- **Calm hierarchy:** Large numbers, quiet labels, one accent — feels like running a place.
- **No competing CTAs** in the summary band.

## 2. Critique — why the current Overview feels weaker

- **Card stack:** Health card → Operating summary → Operating now → How this location runs = four separate boxes on stone. Feels administrative.
- **Operating summary vs Operating now** duplicate the same facts (capacity/rooms/programs/hours) in two presentations.
- **How this location runs** is three mini-cards with “Open →” — navigation chrome, not an operating answer.
- **Needs Attention** is correct in data (problem → consequence → next) but visually shares weight with readiness and sits inside a busy mosaic.
- **Readiness** still competes (donut + checklist + percent) beside attention instead of supporting it quietly.
- Mock’s enrolled / open seats are **not** available from an authoritative Overview provider today.

## 3. Region decisions

| Region | Decision |
| --- | --- |
| **Needs Attention** | Keep. Strongest. Full-width lead. Disappears when empty. Action attached to each row (trailing). |
| **Operational Readiness** | Keep as **supporting understanding** beside/under attention — not a second call-to-action. Collapses to a single calm line at 100%. |
| **Operating summary + Operating now** | **Merge** into one **At a glance** region (configuration summary as operational picture). |
| **How this location runs** | **Rebuild** as one quiet owned-concerns list (Tours / Placement / Access) — not three CTA cards. Answers: “What else does this place run?” |
| **Living region** (closures / activity / recent changes) | **Defer.** Schedule tab already states no date-specific closure records; no authoritative activity feed on Overview. Do not fabricate. |

## 4. Proposed Alloy translation

### Composition (layout first)

```text
Stone canvas
└─ Region A — Health (one white surface)
   ├─ Needs attention (lead; omit if empty)
   └─ Operational readiness (support; understanding)
└─ Region B — At a glance (one white surface)
   ├─ Capacity · Rooms · Programs · Hours (one metric rhythm)
   └─ Capacity setup bar from authoritative room/capacity facts
      (not enrollment — no provider)
└─ Region C — How this location runs (one white surface, hairline rows)
   └─ Tours · Placement · Access as quiet status rows
```

### Needs Attention
- Problem / impact / next already in model.
- Trailing next-step control on each row so the action feels attached.
- Section omitted when no Fix/Improve items (no filler).

### Operational Readiness
- Secondary to attention: muted typography, checklist as understanding.
- At 100%: single “Operational readiness complete” line (doctrine).

### At a glance
- One cohesive summary — not four widgets and not a second “Operating now” list.
- Hierarchy: Capacity → Rooms → Programs → Hours.
- Utilization-style bar = **room capacity setup** segments from authoritative data:
  - rooms with capacity set
  - rooms needing capacity
  - never invent enrolled/open seats

### How this location runs
- One region, hairline rows, no “Open →” tile grid.
- Each row: concern name + one status phrase; whole row navigates.

### Living information
- Documented absence: no Overview provider for recent changes, closures, or activity. Revisit when Schedule closures or an activity feed is authoritative.

## 5. Layout decisions (implemented)

| Decision | Why |
| --- | --- |
| Three composed regions (health → glance → owned concerns) | One operating surface; fewer boxes than the prior four-card stack |
| Attention trailing actions | Next step attached to the issue, not a floating page CTA |
| Readiness muted when attention present | Supports health; does not compete as a second task list |
| Merge summary + operating now → At a glance | One operational picture; Capacity → Rooms → Programs → Hours |
| Room capacity setup bar | Utilization grammar from mock, using authoritative room/capacity facts only |
| No enrolled / open seats | No Overview provider — documented, not fabricated |
| How this location runs as hairline rows | Answers owned concerns without three “Open →” mini-cards |
| No living activity/closures region | No authoritative feed on Overview path |
| Header / nav untouched | Frozen certifications |

## 6. Explicit non-goals

- Do not touch header or location navigation.
- Do not fabricate enrollment metrics or activity.
- Do not keep duplicate Operating summary + Operating now.
