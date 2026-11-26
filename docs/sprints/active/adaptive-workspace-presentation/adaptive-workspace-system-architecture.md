---
owner: platform
status: active-sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Adaptive Workspace System — Platform Architecture Realization

> Continuation of slot **3** · `wt3-adaptive-workspace-presentation` · branch `agent/cursor/3-adaptive-workspace-presentation`  
> HEAD `1bfe7d1de` · **0 local commits** · dirty tree · nothing pushed/merged.

## Locked product decision

**BOS is no longer a permanently reserved right rail.**

BOS is a **persistent operator assistant**: always available, not always consuming workspace width.

Floating is the **default** operating mode. Pinned is optional. Closed restores the full operational canvas via a lightweight launcher.

This is permanent Presentation Runtime / Workspace architecture — not a responsive CSS fork.

## Adaptive Workspace System

One shared capability every operational workspace inherits:

| Owns | Does not own |
|------|----------------|
| Assistant presentation (Closed / Floating / Pinned) | BOS intelligence / commands |
| Workspace region negotiation (selection / primary / supporting / assistant) | Queue authority, Focus subject identity |
| Adaptive layout clamps + temporary selection | Module-internal operating models |
| Preference persistence for assistant width/state | Separate mobile runtime |

**Priority:** primary → selection → supporting → assistant.

## Three BOS states (exact)

| State | UI | Reserves width |
|-------|-----|----------------|
| **closed** | Floating launcher only | No |
| **floating** | Floating assistant panel (default) | No |
| **pinned** | Optional right rail, resizable | Yes — workspace reflows |

Migration from prior corrective pass: `hidden→closed`, `docked|compact-docked→pinned`, floating unchanged. Compact-docked deleted.

## Work Units

Side-by-side queue | Focus through laptop widths; temporary selector only below ~700px primary. Never stack permanently at xl/1280.

## Modules

Communications / Processing / Work Items / future ops consume the same system via ambient shell + region attrs — no per-module responsive forks.
