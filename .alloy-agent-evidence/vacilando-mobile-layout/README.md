# Mobile layout acceptance — live :3020, iPhone 14 Pro

Headless Chromium reports `env(safe-area-inset-*)` as **0**, so it cannot
reproduce the device geometry that caused the defect. `sim-safearea.mjs` serves
the **same** stylesheet with `env()` swapped for a variable holding the real
inset (59px top / 34px bottom) — identical selectors, identical `max()` nesting,
identical cascade, only the leaf value substituted. Every measurement below was
taken that way.

## Root cause and before/after, same viewport

The safe-area inset had **two owners**: `body` (the app shell) and
`.gw-chat-head` (added when the header became sticky). Both applied it in full.

| | before | after |
|---|---|---|
| `body` padding-top | 59px | 59px (the one owner) |
| `.view` padding-top | 8px | 2px |
| `.gw-chat-head` padding-top | **59px** | **6px** |
| Lane name top | **131px** | **72px** |
| Chat first pixel | **187px** | **128px** |
| App-controlled dead space | 72px | 13px |

59px — one whole duplicated inset — returned to the conversation.

A second defect surfaced only under real insets: `.app` was `height:
var(--gw-vvh)` while `body` inset it by the safe areas, so its bottom fell
outside the visible region and the composer sat 25px below the keyboard-shrunk
viewport. The app box now subtracts both insets.

| # | Screenshot | What it proves |
|---|---|---|
| 17 | lane entry | compact header, then chat; `threadScrollTop: 0` at the start of the latest exchange; `diagnosticsBeforeChat: false` |
| 18 | Details open | opened only by the header button; panel visible and interactive |
| 19 | other lane | Details closed on a different lane's entry |
| 20 | re-entry | Details closed again on return — chat-first |
| 21 | keyboard open | compact header kept, composer one row inside the app box (`withinAppBox: true`), 16px, thread 73px and scrollable |
| 22 | Back from Details | panel closed, still in the lane (`hash` unchanged), focus returned to the Details button |
| 23 | long completion | 2,638 characters, thread scrollable, composer reachable |

## Closed Details contributes nothing

`visibility: hidden`, `pointer-events: none`, `inert`, `aria-hidden="true"`,
`x: 393` (off-viewport). A hit test at the right edge, mid-screen, lands on
`.view` — not the panel. Fourteen Tab presses never move focus into it
(`tabProbe.focusEnteredClosedPanel: false`). The chat stage keeps its full
373px width either way.

Off-screen alone was not enough: a transformed element still takes focus and
still answers hit-testing where it sits.
