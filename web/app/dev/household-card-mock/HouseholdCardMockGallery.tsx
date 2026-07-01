"use client";

import { useState } from "react";

/* eslint-disable react/no-unescaped-entities */

/**
 * Household Card — reviewable visual mock (Identity archetype design freeze).
 *
 * This is a PRESENTATION MOCK using local fixtures. It is intentionally
 * self-contained (its own scoped `hcm-` styles) so it renders identically with
 * or without the AdminV2 runtime stylesheet, and it does NOT import or modify the
 * production `HouseholdCard`. Approve this before production implementation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — shaped as the Operational Context a card observes (truth elided;
// presentational evidence is derived once, conceptually, from `context.truth`).
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_CONTEXT = {
    subject: { type: "opportunity", id: "demo-johnson", label: "Johnson Household" },
    businessProcess: { key: "enrollment", label: "Tour scheduled", stageKey: "tour" },
    perspective: { missionLabel: "Confirm enrollment readiness" },
    capabilities: { canMutate: true, maskedChannels: false },
    status: "ready" as const,
};

const PRIMARY = { name: "Sarah Johnson", role: "Parent / Primary contact", phone: "(555) 123-4567", email: "sarah@example.com", prefers: "Text messages" };
const OTHER_PARENT = { name: "Michael Johnson", role: "Parent / Guardian", phone: "(555) 111-2222" };
// Children are BELONGING-ONLY inside Household: names + count. No age, program,
// room, schedule, or status — that operational truth lives in the Children card.
const CHILDREN = ["Emma", "Liam", "Noah"];
const ADDITIONAL = [{ name: "Aunt Lisa", role: "Family friend" }];
const EMERGENCY = [
    { name: "Grandma Mary", phone: "(555) 333-4444", rank: "Primary" },
    { name: "Aunt Lisa", phone: "(555) 444-5555", rank: "Secondary" },
];
const PICKUPS = [
    { name: "Grandma Mary", status: "Approved" },
    { name: "Uncle Tom", status: "Approved" },
];
const ADDRESS = "742 Evergreen Terrace · Springfield, OR 97403";

type Perspective = "overview" | "evidence" | "focused" | "edit";
type GroupKey =
    | "primary_contact"
    | "other_parent_guardian"
    | "children"
    | "household_members"
    | "emergency_contacts"
    | "authorized_pickups"
    | "address"
    | "billing_contact";

function initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Platform-style home icon — monochrome outline, matches Lucide Home (no emoji). */
function HomeIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            className="hcm-home-icon"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M3 9.5 12 3l9 6.5" />
            <path d="M5 10v10h14V10" />
            <path d="M9 20v-6h6v6" />
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card chrome (mock-only, scoped)
// ─────────────────────────────────────────────────────────────────────────────

function MockCard({
    children,
    density = "summary",
    tone,
    state,
}: {
    children: React.ReactNode;
    density?: "queue" | "summary" | "work" | "focused" | "mobile";
    tone?: "warn" | "block";
    state?: string;
}) {
    return (
        <article
            className={`hcm-card hcm-card--${density}${tone ? ` hcm-card--${tone}` : ""}`}
            data-hcm-state={state}
        >
            {children}
        </article>
    );
}

function Identity({ toggle, onToggle }: { toggle?: "▸" | "▾"; onToggle?: () => void }) {
    return (
        <div className="hcm-id">
            <span className="hcm-glyph"><HomeIcon /></span>
            <span className="hcm-title">Johnson Household</span>
            {toggle ? (
                <button type="button" className="hcm-toggle" onClick={onToggle} aria-label="Toggle evidence">
                    {toggle}
                </button>
            ) : null}
        </div>
    );
}

function PrimaryAnswer({ masked = false }: { masked?: boolean }) {
    return (
        <div className="hcm-primary">
            <span className="hcm-avatar">{initials(PRIMARY.name)}</span>
            <div className="hcm-primary-main">
                <div className="hcm-primary-name">
                    {PRIMARY.name}
                    <span className="hcm-chip hcm-chip--primary">Primary</span>
                </div>
                {masked ? (
                    <div className="hcm-detail hcm-detail--locked">Contact details restricted 🔒</div>
                ) : (
                    <div className="hcm-detail">{PRIMARY.phone} · prefers text</div>
                )}
            </div>
            {masked ? null : (
                <div className="hcm-actions">
                    <button type="button" className="hcm-btn">Call</button>
                    <button type="button" className="hcm-btn hcm-btn--icon" aria-label="Message">✉</button>
                </div>
            )}
        </div>
    );
}

function StatChips({ onFocus }: { onFocus?: (g: GroupKey) => void }) {
    const stats: Array<{ key: GroupKey; count: number; label: string }> = [
        { key: "children", count: CHILDREN.length, label: "children" },
        { key: "emergency_contacts", count: EMERGENCY.length, label: "emergency" },
        { key: "authorized_pickups", count: PICKUPS.length, label: "pickups" },
    ];
    return (
        <ul className="hcm-stats">
            {stats.map((s) => (
                <li key={s.key}>
                    <button type="button" className="hcm-stat" onClick={() => onFocus?.(s.key)}>
                        <span className="hcm-stat-count">{s.count}</span>
                        <span className="hcm-stat-label">{s.label}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/**
 * Evidence — Primary Contact is the dominant answer; the rest are COMPACT,
 * single-line, tappable group rows (not full tables). Children stay belonging-only
 * (names). Reduced lines: groups are calm rows, not bordered cards.
 */
function EvidenceGroups({ onFocus }: { onFocus?: (g: GroupKey) => void }) {
    const groups: Array<{ key: GroupKey; title: string; preview: string; count?: number }> = [
        { key: "other_parent_guardian", title: "Other parent / guardian", count: 1, preview: OTHER_PARENT.name },
        { key: "household_members", title: "Additional contacts", count: ADDITIONAL.length, preview: ADDITIONAL.map((c) => c.name).join(", ") },
        { key: "emergency_contacts", title: "Emergency contacts", count: EMERGENCY.length, preview: EMERGENCY.map((c) => c.name).join(", ") },
        { key: "authorized_pickups", title: "Authorized pickups", count: PICKUPS.length, preview: PICKUPS.map((c) => c.name).join(", ") },
        { key: "children", title: "Children", count: CHILDREN.length, preview: CHILDREN.join(", ") },
        { key: "address", title: "Address", preview: ADDRESS },
        { key: "billing_contact", title: "Billing contact", preview: PRIMARY.name },
    ];
    return (
        <div className="hcm-ev">
            <div className="hcm-ev-primary">
                <PrimaryAnswer />
            </div>
            <ul className="hcm-ev-list">
                {groups.map((g) => (
                    <li key={g.key}>
                        <button type="button" className="hcm-ev-row" onClick={() => onFocus?.(g.key)}>
                            <span className="hcm-ev-label">
                                {g.title}
                                {typeof g.count === "number" ? <span className="hcm-ev-count">{g.count}</span> : null}
                            </span>
                            <span className="hcm-ev-preview">{g.preview}</span>
                            <span className="hcm-ev-chev" aria-hidden>›</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function FocusedChildren({ onBack }: { onBack?: () => void }) {
    return (
        <div className="hcm-focused" data-hcm-focused="children">
            <button type="button" className="hcm-back" onClick={onBack}>◀ All household evidence</button>
            <div className="hcm-focused-header">
                <span className="hcm-group-title">Children</span>
                <span className="hcm-ev-count">{CHILDREN.length}</span>
            </div>
            <div className="hcm-rows">
                {CHILDREN.map((name) => (
                    <div className="hcm-row" key={name}>
                        <span className="hcm-avatar">{name.charAt(0)}</span>
                        <div className="hcm-primary-main"><div className="hcm-primary-name">{name}</div></div>
                    </div>
                ))}
            </div>
            <p className="hcm-note hcm-note--inline">
                Belonging only — names and count. Program, room, and enrollment detail belong in the Children card (Subject Change).
            </p>
        </div>
    );
}

function FocusedOtherParent({ onBack }: { onBack?: () => void }) {
    return (
        <div className="hcm-focused" data-hcm-focused="other_parent_guardian">
            <button type="button" className="hcm-back" onClick={onBack}>◀ All household evidence</button>
            <div className="hcm-focused-header">
                <span className="hcm-group-title">Other parent / guardian</span>
                <span className="hcm-ev-count">1</span>
            </div>
            <div className="hcm-rows">
                <div className="hcm-row">
                    <span className="hcm-avatar">{initials(OTHER_PARENT.name)}</span>
                    <div className="hcm-primary-main">
                        <div className="hcm-primary-name">{OTHER_PARENT.name}</div>
                        <div className="hcm-detail">{OTHER_PARENT.phone} · {OTHER_PARENT.role}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FocusedAddress({ onBack }: { onBack?: () => void }) {
    return (
        <div className="hcm-focused" data-hcm-focused="address">
            <button type="button" className="hcm-back" onClick={onBack}>◀ All household evidence</button>
            <div className="hcm-focused-header">
                <span className="hcm-group-title">Address</span>
            </div>
            <p className="hcm-detail">{ADDRESS}</p>
        </div>
    );
}

function FocusedContact({ onBack }: { onBack?: () => void }) {
    return (
        <div className="hcm-focused">
            <button type="button" className="hcm-back" onClick={onBack}>◀ All household</button>
            <div className="hcm-focused-title">
                <span className="hcm-avatar">{initials(PRIMARY.name)}</span>
                <span className="hcm-primary-name">{PRIMARY.name}<span className="hcm-chip hcm-chip--primary">Primary</span></span>
            </div>
            <dl className="hcm-detail-grid">
                <div><dt>Relationship</dt><dd>{PRIMARY.role}</dd></div>
                <div><dt>Mobile</dt><dd>{PRIMARY.phone} <button type="button" className="hcm-btn hcm-btn--sm">Call</button></dd></div>
                <div><dt>Email</dt><dd>{PRIMARY.email} <button type="button" className="hcm-btn hcm-btn--sm hcm-btn--icon" aria-label="Message">✉</button></dd></div>
                <div><dt>Prefers</dt><dd>{PRIMARY.prefers}</dd></div>
                <div><dt>Can pick up</dt><dd>Yes</dd></div>
                <div><dt>Billing</dt><dd>Receives billing</dd></div>
            </dl>
            <div className="hcm-focused-foot">
                <button type="button" className="hcm-btn">Edit</button>
            </div>
        </div>
    );
}

function FocusedEmergency({ onBack, onEdit }: { onBack?: () => void; onEdit?: () => void }) {
    return (
        <div className="hcm-focused">
            <button type="button" className="hcm-back" onClick={onBack}>◀ All household</button>
            <div className="hcm-focused-header">
                <span className="hcm-group-title">Emergency contacts</span>
                <button type="button" className="hcm-btn" onClick={onEdit}>Edit</button>
            </div>
            <div className="hcm-rows">
                {EMERGENCY.map((c) => (
                    <div className="hcm-row" key={c.name}>
                        <span className="hcm-flag" aria-hidden>⚑</span>
                        <div className="hcm-primary-main">
                            <div className="hcm-primary-name">{c.name}</div>
                            <div className="hcm-detail">{c.phone}</div>
                        </div>
                        <span className="hcm-row-rank">{c.rank}</span>
                    </div>
                ))}
            </div>
            <button type="button" className="hcm-link">+ Add emergency contact</button>
        </div>
    );
}

function FocusedPickups({ onBack }: { onBack?: () => void }) {
    return (
        <div className="hcm-focused">
            <button type="button" className="hcm-back" onClick={onBack}>◀ All household</button>
            <div className="hcm-focused-header">
                <span className="hcm-group-title">Authorized pickups</span>
                <button type="button" className="hcm-btn">Edit</button>
            </div>
            <div className="hcm-rows">
                {PICKUPS.map((c) => (
                    <div className="hcm-row" key={c.name}>
                        <span className="hcm-check" aria-hidden>✓</span>
                        <div className="hcm-primary-main"><div className="hcm-primary-name">{c.name}</div></div>
                        <span className="hcm-row-status">{c.status}</span>
                    </div>
                ))}
            </div>
            <button type="button" className="hcm-link">+ Add authorized pickup</button>
        </div>
    );
}

function EditEmergency({ onBack }: { onBack?: () => void }) {
    return (
        <div className="hcm-focused">
            <button type="button" className="hcm-back" onClick={onBack}>◀ All household</button>
            <div className="hcm-focused-header">
                <span className="hcm-group-title">Emergency contacts</span>
                <div className="hcm-actions">
                    <button type="button" className="hcm-btn">Cancel</button>
                    <button type="button" className="hcm-btn hcm-btn--primary">Save</button>
                </div>
            </div>
            <div className="hcm-rows">
                {EMERGENCY.map((c) => (
                    <div className="hcm-row hcm-row--edit" key={c.name}>
                        <span className="hcm-flag" aria-hidden>⚑</span>
                        <div className="hcm-primary-main">
                            <input className="hcm-input" defaultValue={c.name} aria-label="Name" />
                            <input className="hcm-input hcm-input--sm" defaultValue={c.phone} aria-label="Phone" />
                        </div>
                        <select className="hcm-select" defaultValue={c.rank} aria-label="Rank">
                            <option>Primary</option>
                            <option>Secondary</option>
                        </select>
                    </div>
                ))}
            </div>
            <button type="button" className="hcm-link">+ Add emergency contact</button>
            <p className="hcm-dirty">● Unsaved changes</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive demo — drives the perspective state machine locally (no I/O)
// ─────────────────────────────────────────────────────────────────────────────

function InteractiveDemo() {
    const [perspective, setPerspective] = useState<Perspective>("overview");
    const [group, setGroup] = useState<GroupKey>("primary_contact");

    const focus = (g: GroupKey) => {
        setGroup(g);
        setPerspective("focused");
    };

    return (
        <div className="hcm-demo">
            <div className="hcm-demo-rail">
                <span className="hcm-demo-label">Perspective (local UI state):</span>
                {(["overview", "evidence", "focused", "edit"] as Perspective[]).map((p) => (
                    <button
                        key={p}
                        type="button"
                        className={`hcm-pill${perspective === p ? " hcm-pill--on" : ""}`}
                        onClick={() => setPerspective(p)}
                    >
                        {p}
                    </button>
                ))}
            </div>

            <MockCard density="work" state={`interactive:${perspective}`}>
                <Identity
                    toggle={perspective === "overview" ? "▸" : "▾"}
                    onToggle={() => setPerspective(perspective === "overview" ? "evidence" : "overview")}
                />
                <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children · prefers text</p>

                {perspective === "overview" ? (
                    <>
                        <PrimaryAnswer />
                        <StatChips onFocus={focus} />
                        <div className="hcm-meta">Updated 2h ago</div>
                    </>
                ) : null}

                {perspective === "evidence" ? <EvidenceGroups onFocus={focus} /> : null}

                {perspective === "focused" ? (
                    group === "children" ? (
                        <FocusedChildren onBack={() => setPerspective("evidence")} />
                    ) : group === "other_parent_guardian" ? (
                        <FocusedOtherParent onBack={() => setPerspective("evidence")} />
                    ) : group === "address" ? (
                        <FocusedAddress onBack={() => setPerspective("evidence")} />
                    ) : group === "emergency_contacts" ? (
                        <FocusedEmergency onBack={() => setPerspective("evidence")} onEdit={() => setPerspective("edit")} />
                    ) : group === "authorized_pickups" ? (
                        <FocusedPickups onBack={() => setPerspective("evidence")} />
                    ) : group === "primary_contact" ? (
                        <FocusedContact onBack={() => setPerspective("evidence")} />
                    ) : (
                        <FocusedContact onBack={() => setPerspective("evidence")} />
                    )
                ) : null}

                {perspective === "edit" ? <EditEmergency onBack={() => setPerspective("focused")} /> : null}
            </MockCard>

            <p className="hcm-note">
                Every button above changes <strong>local UI state only</strong> — no fetch, no route change, no
                surface swap. The identity anchor and card frame never unmount; only the body region transforms.
            </p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Static state gallery
// ─────────────────────────────────────────────────────────────────────────────

function StateGallery() {
    return (
        <div className="hcm-grid">
            <Labeled label="Overview (default, healthy)" note="Summary density · collapsed">
                <MockCard state="overview">
                    <Identity toggle="▸" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children · prefers text</p>
                    <PrimaryAnswer />
                    <StatChips />
                    <div className="hcm-meta">Updated 2h ago</div>
                    <div className="hcm-link">View household →</div>
                </MockCard>
            </Labeled>

            <Labeled label="Evidence (expanded)" note="Groups visible · each header focuses">
                <MockCard state="evidence">
                    <Identity toggle="▾" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children</p>
                    <EvidenceGroups />
                    <div className="hcm-link">Show less</div>
                </MockCard>
            </Labeled>

            <Labeled label="Focused Contact (primary)" note="Inline edit affordance; profile is Change-Subject">
                <MockCard state="focused-contact"><FocusedContact /></MockCard>
            </Labeled>

            <Labeled label="Focused Emergency Contact">
                <MockCard state="focused-emergency"><FocusedEmergency /></MockCard>
            </Labeled>

            <Labeled label="Focused Authorized Pickup">
                <MockCard state="focused-pickup"><FocusedPickups /></MockCard>
            </Labeled>

            <Labeled label="Edit-ready / inline edit" note="Inline within a focused group — never a card-wide form">
                <MockCard state="edit"><EditEmergency /></MockCard>
            </Labeled>

            <Labeled label="Missing Primary Contact" note="BLOCKING (red) — belonging still answered">
                <MockCard state="missing-primary" tone="block">
                    <Identity />
                    <p className="hcm-block">⚠ No primary contact — this family cannot be reached</p>
                    <div className="hcm-detail">3 children belong to this household</div>
                    <button type="button" className="hcm-btn hcm-btn--primary">Set primary contact</button>
                </MockCard>
            </Labeled>

            <Labeled label="Missing Emergency Contact" note="ATTENTION (amber) — not blocking">
                <MockCard state="missing-emergency" tone="warn">
                    <Identity toggle="▸" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children</p>
                    <PrimaryAnswer />
                    <p className="hcm-warn">⚠ No emergency contact on file</p>
                    <button type="button" className="hcm-btn">Add emergency contact</button>
                </MockCard>
            </Labeled>

            <Labeled label="Empty (no household composed yet)">
                <MockCard state="empty">
                    <div className="hcm-id"><span className="hcm-glyph"><HomeIcon /></span><span className="hcm-title">Household</span></div>
                    <p className="hcm-detail">No household linked to this record yet</p>
                    <button type="button" className="hcm-btn">Add primary contact</button>
                </MockCard>
            </Labeled>

            <Labeled label="Permission Limited" note="Channels masked from context.capabilities — no card-level auth">
                <MockCard state="permission-limited">
                    <Identity toggle="▸" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children</p>
                    <PrimaryAnswer masked />
                    <StatChips />
                </MockCard>
            </Labeled>

            <Labeled label="Loading via Operational Context only" note="No card-owned spinner — the reveal gate holds">
                <div className="hcm-loading">
                    <div className="hcm-loading-gate">context.status = "composing"</div>
                    <div className="hcm-loading-arrow">→ Focus Panel reveal gate holds</div>
                    <div className="hcm-loading-result">→ no partial Household paint (card mounts only when ready)</div>
                </div>
            </Labeled>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Density gallery
// ─────────────────────────────────────────────────────────────────────────────

function DensityGallery() {
    return (
        <div className="hcm-grid">
            <Labeled label="Queue (micro)" note="Preview only — one decisive line">
                <div className="hcm-queue">
                    <HomeIcon size={14} /> Johnson Household · Sarah Johnson · 3 children <span className="hcm-warn-inline">⚠</span>
                </div>
            </Labeled>

            <Labeled label="Summary (compact)" note="Focus Panel Summary mode — Overview">
                <MockCard density="summary" state="density-summary">
                    <Identity toggle="▸" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children</p>
                    <PrimaryAnswer />
                    <StatChips />
                </MockCard>
            </Labeled>

            <Labeled label="Work (standard)" note="Focus Panel Work mode — defaults to Evidence depth">
                <MockCard density="work" state="density-work">
                    <Identity toggle="▾" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children</p>
                    <EvidenceGroups />
                </MockCard>
            </Labeled>

            <Labeled label="Focused (expanded)" note="A single group occupies the body">
                <MockCard density="focused" state="density-focused"><FocusedContact /></MockCard>
            </Labeled>

            <Labeled label="Mobile" note="Single column · identity sticky · reachability first">
                <MockCard density="mobile" state="density-mobile">
                    <Identity />
                    <div className="hcm-primary-name">{PRIMARY.name} <span className="hcm-chip hcm-chip--primary">Primary</span></div>
                    <div className="hcm-actions hcm-actions--full">
                        <button type="button" className="hcm-btn hcm-btn--block">Call</button>
                        <button type="button" className="hcm-btn hcm-btn--block">Message</button>
                    </div>
                    <div className="hcm-mobile-groups">
                        <div className="hcm-mobile-row">Children <span>3 →</span></div>
                        <div className="hcm-mobile-row">Emergency <span>2 →</span></div>
                        <div className="hcm-mobile-row">Pickups <span>2 →</span></div>
                    </div>
                </MockCard>
            </Labeled>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation-approved Household v1 — the frozen set to build
// ─────────────────────────────────────────────────────────────────────────────

function ApprovedV1() {
    return (
        <div className="hcm-grid">
            <Labeled label="Overview" note="Default, healthy · platform Home icon">
                <MockCard state="v1-overview">
                    <Identity toggle="▸" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children · prefers text</p>
                    <PrimaryAnswer />
                    <StatChips />
                    <div className="hcm-meta">Updated 2h ago</div>
                </MockCard>
            </Labeled>

            <Labeled label="Evidence" note="Primary dominant · other parent · address group · children belonging-only">
                <MockCard state="v1-evidence">
                    <Identity toggle="▾" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children</p>
                    <EvidenceGroups />
                </MockCard>
            </Labeled>

            <Labeled label="Focused Contact" note="No 'open full profile' — Subject Change is separate">
                <MockCard state="v1-focused-contact"><FocusedContact /></MockCard>
            </Labeled>

            <Labeled label="Focused Children" note="Belonging-only · NOT primary contact · NOT Subject Change">
                <MockCard state="v1-focused-children"><FocusedChildren /></MockCard>
            </Labeled>

            <Labeled label="Focused Other Parent / Guardian" note="Second parent visible · not duplicated as primary">
                <MockCard state="v1-focused-other-parent"><FocusedOtherParent /></MockCard>
            </Labeled>

            <Labeled label="Focused Emergency Contact">
                <MockCard state="v1-focused-emergency"><FocusedEmergency /></MockCard>
            </Labeled>

            <Labeled label="Focused Address" note="Reachability evidence · not forced into Overview">
                <MockCard state="v1-focused-address"><FocusedAddress /></MockCard>
            </Labeled>

            <Labeled label="Missing Primary" note="Blocking (red)">
                <MockCard state="v1-missing-primary" tone="block">
                    <Identity />
                    <p className="hcm-block">⚠ No primary contact — this family cannot be reached</p>
                    <div className="hcm-detail">3 children belong to this household</div>
                    <button type="button" className="hcm-btn hcm-btn--primary">Set primary contact</button>
                </MockCard>
            </Labeled>

            <Labeled label="Missing Emergency" note="Attention (amber)">
                <MockCard state="v1-missing-emergency" tone="warn">
                    <Identity toggle="▸" />
                    <p className="hcm-insight">Sarah Johnson is the primary contact · 3 children</p>
                    <PrimaryAnswer />
                    <p className="hcm-warn">⚠ No emergency contact on file</p>
                    <button type="button" className="hcm-btn">Add emergency contact</button>
                </MockCard>
            </Labeled>

            <Labeled label="Mobile" note="Single column · reachability first">
                <MockCard density="mobile" state="v1-mobile">
                    <Identity />
                    <div className="hcm-primary-name">{PRIMARY.name} <span className="hcm-chip hcm-chip--primary">Primary</span></div>
                    <div className="hcm-actions hcm-actions--full">
                        <button type="button" className="hcm-btn hcm-btn--block">Call</button>
                        <button type="button" className="hcm-btn hcm-btn--block">Message</button>
                    </div>
                    <div className="hcm-mobile-groups">
                        <div className="hcm-mobile-row">Children <span>3 ›</span></div>
                        <div className="hcm-mobile-row">Emergency <span>2 ›</span></div>
                        <div className="hcm-mobile-row">Pickups <span>2 ›</span></div>
                    </div>
                </MockCard>
            </Labeled>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transitions documentation
// ─────────────────────────────────────────────────────────────────────────────

const TRANSITIONS: Array<{
    name: string;
    trigger: string;
    animation: string;
    mounted: string;
    loads: string;
    neverLoads: string;
    feel: string;
}> = [
    {
        name: "Overview → Evidence",
        trigger: "Click expand affordance (▸) or a stat chip",
        animation: "Body height auto-expand + group fade-in ≤200ms",
        mounted: "Identity anchor, insight, primary answer",
        loads: "Nothing",
        neverLoads: "No fetch, no skeleton",
        feel: "Instant, in-place reveal",
    },
    {
        name: "Evidence → Focused Group",
        trigger: "Click a group header (N →)",
        animation: "Body cross-fade / slide to single group",
        mounted: "Identity anchor, card frame",
        loads: "Nothing (observed truth already present)",
        neverLoads: "No fetch, no route change",
        feel: "Snap to detail, no flicker",
    },
    {
        name: "Focused Group → Evidence",
        trigger: "Click ◀ back affordance",
        animation: "Reverse cross-fade",
        mounted: "Identity anchor",
        loads: "Nothing",
        neverLoads: "No fetch",
        feel: "Immediate return",
    },
    {
        name: "Focused Group → Edit-ready",
        trigger: "Click Edit inside the focused group",
        animation: "Inline controls fade in (rows become inputs)",
        mounted: "Whole card, group rows",
        loads: "Nothing (edits the observed truth)",
        neverLoads: "No new card, no form route",
        feel: "Calm in-place edit",
    },
    {
        name: "Edit-ready → Focused Group",
        trigger: "Cancel, or Save (after mutation resolves)",
        animation: "Controls fade back to read rows; dirty clears",
        mounted: "Card + group",
        loads: "On Save: write (mutation) + context-owned truth refresh",
        neverLoads: "Card never re-fetches itself",
        feel: "Optimistic, then confirmed",
    },
    {
        name: "Missing state → Resolved state",
        trigger: "Complete the single decisive action (e.g. Set primary contact)",
        animation: "Blocking/attention banner clears; answer composes in",
        mounted: "Identity anchor",
        loads: "Mutation + context refresh (new truth)",
        neverLoads: "No card-local re-fetch loop",
        feel: "One action resolves the blocker",
    },
    {
        name: "Search result → Focused Household group",
        trigger: "Select a household from global search",
        animation: "Focus Panel composes for the new subject; card mounts at requested depth",
        mounted: "Focus Panel shell",
        loads: "A NEW Operational Context for the selected subject",
        neverLoads: "Search never opens a drawer; no second surface",
        feel: "Establish context, then render",
    },
];

function TransitionsDoc() {
    return (
        <div className="hcm-table-wrap">
            <table className="hcm-table">
                <thead>
                    <tr>
                        <th>Transition</th>
                        <th>Trigger</th>
                        <th>Animation</th>
                        <th>Stays mounted</th>
                        <th>What loads</th>
                        <th>What never loads</th>
                        <th>Performance feel</th>
                    </tr>
                </thead>
                <tbody>
                    {TRANSITIONS.map((t) => (
                        <tr key={t.name}>
                            <td className="hcm-td-name">{t.name}</td>
                            <td>{t.trigger}</td>
                            <td>{t.animation}</td>
                            <td>{t.mounted}</td>
                            <td>{t.loads}</td>
                            <td>{t.neverLoads}</td>
                            <td>{t.feel}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers + page
// ─────────────────────────────────────────────────────────────────────────────

function Labeled({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
    return (
        <section className="hcm-cell">
            <header className="hcm-cell-head">
                <span className="hcm-cell-label">{label}</span>
                {note ? <span className="hcm-cell-note">{note}</span> : null}
            </header>
            <div className="hcm-cell-body">{children}</div>
        </section>
    );
}

function Section({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
    return (
        <section className="hcm-section">
            <h2 className="hcm-h2">{title}</h2>
            {blurb ? <p className="hcm-blurb">{blurb}</p> : null}
            {children}
        </section>
    );
}

export default function HouseholdCardMockGallery() {
    return (
        <div className="hcm-root">
            <style>{HCM_CSS}</style>

            <header className="hcm-header">
                <h1 className="hcm-h1">Household Card — Visual Mock</h1>
                <p className="hcm-sub">
                    Identity archetype design freeze · local fixtures · NOT the production card. Review and approve
                    before implementation. Freeze: <code>docs/platform/operator/household-reference-card.md</code>.
                </p>

                <div className="hcm-flow" aria-label="Architecture spine">
                    <span className="hcm-flow-node">Operational Context</span>
                    <span className="hcm-flow-sep">→</span>
                    <span className="hcm-flow-node">Focus Panel</span>
                    <span className="hcm-flow-sep">→</span>
                    <span className="hcm-flow-node">Surface / Card layout</span>
                    <span className="hcm-flow-sep">→</span>
                    <span className="hcm-flow-node hcm-flow-node--card">Household Card perspectives</span>
                </div>
                <p className="hcm-flow-caption">
                    The card observes one Operational Context (<code>{MOCK_CONTEXT.subject.label}</code>, process{" "}
                    <code>{MOCK_CONTEXT.businessProcess.label}</code>). Perspectives are local UI state on the card.
                    No drawer / per-subject surface exists. Subject identity = <code>context.subject.id</code>; data ={" "}
                    <code>context.truth</code>; permissions = <code>context.capabilities</code>.
                </p>
            </header>

            <Section title="Interactive demo" blurb="Drive the perspective state machine. Every change is local UI only.">
                <InteractiveDemo />
            </Section>

            <Section title="States" blurb="Every operational state, including the unhappy paths a reference card must define.">
                <StateGallery />
            </Section>

            <Section title="Densities" blurb="One identity, five densities. Identity anchor + primary answer survive every density.">
                <DensityGallery />
            </Section>

            <Section title="Transitions" blurb="Trigger, animation, mount, load, never-load, and expected performance feel.">
                <TransitionsDoc />
            </Section>

            <Section title="Models">
                <div className="hcm-models">
                    <div className="hcm-model">
                        <h3>Interaction model</h3>
                        <p>Observe → Reveal (expand) → Focus (group) → Edit (inline) → Act. Expansion and focus use the in-card Expand model; selecting a child or opening a full profile is a <strong>Change Subject</strong> (new Operational Context), never a card expand.</p>
                    </div>
                    <div className="hcm-model">
                        <h3>Performance model</h3>
                        <p>Operational Context loads once per subject. Perspective changes (collapse/expand/focus) and density changes <strong>never</strong> load. Only Change-Subject / deep workspace establishes a new context. No card-local fetch, no skeleton morph on expand.</p>
                    </div>
                    <div className="hcm-model">
                        <h3>Loading model</h3>
                        <p>The card has no independent loading state. Loading belongs to the Operational Context (<code>status: "composing"</code>), owned by the Focus Panel reveal gate. The card mounts only with data — no card-owned spinner, no partial paint.</p>
                    </div>
                    <div className="hcm-model">
                        <h3>Editing model</h3>
                        <p>Editing is an inline state inside a focused group, never a card-wide form and never a separate perspective. Save is optimistic; the context owns truth refresh. Permission to edit comes from <code>context.capabilities.canMutate</code>.</p>
                    </div>
                </div>
            </Section>

            <Section
                title="Implementation-approved Household v1"
                blurb="The frozen v1 build set. Calmer evidence (primary dominant, compact groups), children belonging-only, no in-card 'open full profile'. Build exactly these."
            >
                <ApprovedV1 />
                <p className="hcm-note hcm-note--cs">
                    <strong>Change Subject (documented separately, not a v1 card behavior):</strong> opening a person's
                    full profile or drilling into a child is a future <em>Change Subject</em> interaction — it
                    establishes a new Operational Context for that subject. It is intentionally absent from the
                    Household card itself.
                </p>
            </Section>

            <footer className="hcm-footer">
                Hard rule: do not implement the production Household card until this mock/spec is reviewed and approved.
            </footer>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoped styles (mock-only; prefixed hcm-)
// ─────────────────────────────────────────────────────────────────────────────

const HCM_CSS = `
.hcm-root { --ink:#273f52; --ink2:#4b5563; --line:#e5e9ef; --pine:#00a283; --warn:#b45309; --block:#b91c1c; --bg:#f6f7f9;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
  background: var(--bg); min-height:100vh; padding: 88px clamp(16px, 4vw, 48px) 28px; }
.hcm-header { max-width: 1100px; margin: 0 auto 12px; }
.hcm-h1 { font-size: 24px; font-weight: 800; margin: 0 0 4px; }
.hcm-sub { margin: 0 0 14px; color: var(--ink2); font-size: 13px; }
.hcm-sub code, .hcm-flow-caption code, .hcm-model code { background:#eef1f5; padding:1px 5px; border-radius:4px; font-size: 12px; }
.hcm-flow { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 14px; background:#fff; border:1px solid var(--line); border-radius:10px; }
.hcm-flow-node { font-weight:700; font-size:12.5px; padding:4px 10px; border-radius:999px; background:#eef1f5; }
.hcm-flow-node--card { background: color-mix(in srgb, var(--pine) 14%, #fff); color: var(--pine); }
.hcm-flow-sep { color: var(--ink2); font-weight:700; }
.hcm-flow-caption { margin: 8px 0 0; font-size: 12px; color: var(--ink2); }
.hcm-section { max-width: 1100px; margin: 0 auto; padding: 22px 0 6px; }
.hcm-h2 { font-size: 16px; font-weight: 800; margin: 0 0 2px; border-bottom: 2px solid var(--ink); display:inline-block; padding-bottom: 3px; }
.hcm-blurb { margin: 8px 0 16px; color: var(--ink2); font-size: 13px; }
.hcm-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; align-items:start; }
.hcm-cell { background:#fff; border:1px solid var(--line); border-radius:12px; overflow:hidden; }
.hcm-cell-head { display:flex; flex-direction:column; gap:1px; padding:8px 12px; background:#fafbfc; border-bottom:1px solid var(--line); }
.hcm-cell-label { font-size:12px; font-weight:700; }
.hcm-cell-note { font-size:11px; color: var(--ink2); }
.hcm-cell-body { padding: 14px; }

/* Card chrome */
.hcm-card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; box-shadow: 0 1px 2px rgba(39,63,82,.05);
  display:flex; flex-direction:column; gap:10px; }
.hcm-card--mobile { max-width: 280px; }
.hcm-card--queue { padding:8px 12px; }
.hcm-card--warn { border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); }
.hcm-card--block { border-color: color-mix(in srgb, var(--block) 45%, var(--line)); }

.hcm-id { display:flex; align-items:center; gap:8px; }
.hcm-glyph { display:inline-flex; align-items:center; color:var(--ink2); flex-shrink:0; }
.hcm-home-icon { display:block; }
.hcm-title { font-size: 14px; font-weight: 800; flex:1 1 auto; }
.hcm-toggle { border:none; background:none; cursor:pointer; font-size:14px; color: var(--ink2); }
.hcm-insight { margin:0; font-size:12px; color: var(--ink2); padding-top:2px; }

.hcm-primary { display:flex; align-items:center; gap:8px; }
.hcm-avatar { flex-shrink:0; width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;
  background: color-mix(in srgb, var(--ink) 8%, #fff); color: var(--ink); font-size:11px; font-weight:700; }
.hcm-primary-main { display:flex; flex-direction:column; gap:1px; flex:1 1 auto; }
.hcm-primary-name { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; }
.hcm-detail { font-size:11.5px; color: var(--ink2); }
.hcm-detail--locked { color: var(--ink2); font-style: italic; }
.hcm-chip { font-size:10px; font-weight:700; padding:1px 6px; border-radius:999px; }
.hcm-chip--primary { background: color-mix(in srgb, var(--pine) 12%, #fff); color: var(--pine); }
.hcm-actions { display:flex; gap:6px; flex-shrink:0; }
.hcm-actions--full { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.hcm-btn { border:1px solid var(--line); background:#fff; border-radius:7px; padding:4px 10px; font-size:12px; font-weight:600; cursor:pointer; color: var(--ink); }
.hcm-btn:hover { border-color: color-mix(in srgb, var(--ink) 25%, transparent); }
.hcm-btn--primary { background: var(--ink); color:#fff; border-color: var(--ink); }
.hcm-btn--icon { padding:4px 8px; }
.hcm-btn--sm { padding:2px 8px; font-size:11px; }
.hcm-btn--block { padding:8px; width:100%; }

.hcm-stats { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:0; list-style:none; }
.hcm-stat { display:inline-flex; align-items:baseline; gap:5px; padding:3px 9px; border:none; border-radius:999px; background:#f1f4f7; cursor:pointer; font:inherit; }
.hcm-stat:hover { background:#e7ebf0; }
.hcm-stat-count { font-size:13px; font-weight:700; }
.hcm-stat-label { font-size:11px; color: var(--ink2); }
.hcm-meta { font-size:10.5px; color: color-mix(in srgb, var(--ink2) 70%, #fff); }
.hcm-link { font-size:12px; font-weight:600; color: var(--pine); cursor:pointer; background:none; border:none; padding:0; text-align:left; }

/* Evidence — calm: dominant primary, then compact single-line rows (no per-row borders) */
.hcm-ev { display:flex; flex-direction:column; gap:8px; }
.hcm-ev-primary { padding-bottom:8px; border-bottom:1px solid color-mix(in srgb, var(--line) 55%, transparent); }
.hcm-ev-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
.hcm-ev-row { display:flex; align-items:baseline; gap:10px; width:100%; padding:6px 4px; border:none; background:none; cursor:pointer; font:inherit; border-radius:7px; text-align:left; }
.hcm-ev-row:hover { background:#f6f8fa; }
.hcm-ev-label { flex:0 0 auto; min-width:88px; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color: var(--ink); }
.hcm-ev-count { font-size:10.5px; font-weight:700; color: var(--ink2); background:#eef1f5; border-radius:999px; padding:0 6px; }
.hcm-ev-preview { flex:1 1 auto; font-size:12px; color: var(--ink2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hcm-ev-chev { flex:0 0 auto; color: color-mix(in srgb, var(--ink2) 60%, #fff); font-size:16px; line-height:1; }

.hcm-groups { display:flex; flex-direction:column; gap:12px; }
.hcm-group { display:flex; flex-direction:column; gap:3px; }
.hcm-group-head { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; padding:2px 0; border:none; background:none; cursor:pointer; font:inherit;
  border-bottom:1px solid color-mix(in srgb, var(--line) 55%, transparent); }
.hcm-group-title { font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color: var(--ink2); }
.hcm-group-count { font-size:11px; font-weight:600; color: var(--pine); }
.hcm-group-preview { font-size:11.5px; color: var(--ink2); }

.hcm-focused { display:flex; flex-direction:column; gap:8px; }
.hcm-back { align-self:flex-start; border:none; background:none; cursor:pointer; font:inherit; font-size:11.5px; font-weight:600; color: var(--ink2); padding:0; }
.hcm-focused-title { display:flex; align-items:center; gap:8px; }
.hcm-focused-header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.hcm-detail-grid { display:grid; grid-template-columns: auto 1fr; gap:4px 14px; margin:0; }
.hcm-detail-grid > div { display:contents; }
.hcm-detail-grid dt { font-size:11px; color: var(--ink2); }
.hcm-detail-grid dd { margin:0; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px; }
.hcm-focused-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:4px; }

.hcm-rows { display:flex; flex-direction:column; gap:6px; }
.hcm-row { display:flex; align-items:center; gap:8px; }
.hcm-row--edit { align-items:flex-start; }
.hcm-flag { color: var(--warn); }
.hcm-check { color: var(--pine); font-weight:800; }
.hcm-row-rank, .hcm-row-status { font-size:10.5px; font-weight:600; color: var(--ink2); flex-shrink:0; }
.hcm-input { border:1px solid var(--line); border-radius:6px; padding:3px 7px; font:inherit; font-size:12px; width:100%; }
.hcm-input--sm { margin-top:3px; }
.hcm-select { border:1px solid var(--line); border-radius:6px; padding:3px 7px; font:inherit; font-size:11px; }
.hcm-dirty { margin:0; font-size:11px; font-weight:600; color: var(--warn); }

.hcm-warn { margin:0; font-size:11.5px; font-weight:600; color: var(--warn); }
.hcm-warn-inline { color: var(--warn); }
.hcm-block { margin:0; font-size:12.5px; font-weight:700; color: var(--block); }

.hcm-queue { font-size:12.5px; font-weight:600; padding:8px 12px; background:#fff; border:1px solid var(--line); border-radius:8px; }
.hcm-mobile-groups { display:flex; flex-direction:column; gap:4px; }
.hcm-mobile-row { display:flex; justify-content:space-between; font-size:12px; padding:4px 0; border-bottom:1px solid color-mix(in srgb, var(--line) 55%, transparent); }
.hcm-mobile-row span { color: var(--pine); font-weight:600; }

.hcm-loading { display:flex; flex-direction:column; gap:6px; padding:14px; border:1px dashed var(--line); border-radius:12px; background:#fff; }
.hcm-loading-gate { font-size:12px; font-weight:700; }
.hcm-loading-arrow, .hcm-loading-result { font-size:12px; color: var(--ink2); }

/* Demo */
.hcm-demo { display:flex; flex-direction:column; gap:12px; max-width:520px; }
.hcm-demo-rail { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.hcm-demo-label { font-size:12px; color: var(--ink2); margin-right:4px; }
.hcm-pill { border:1px solid var(--line); background:#fff; border-radius:999px; padding:3px 12px; font-size:12px; font-weight:600; cursor:pointer; text-transform:capitalize; }
.hcm-pill--on { background: var(--ink); color:#fff; border-color: var(--ink); }
.hcm-note { margin:0; font-size:12px; color: var(--ink2); }
.hcm-note--cs { margin-top:14px; padding:10px 12px; background:#fff; border:1px solid var(--line); border-radius:10px; }
.hcm-note--inline { margin-top:8px; font-size:11px; color:var(--ink3); font-style:italic; line-height:1.45; }

/* Transitions table */
.hcm-table-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:12px; background:#fff; }
.hcm-table { border-collapse:collapse; width:100%; min-width:920px; font-size:12px; }
.hcm-table th, .hcm-table td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
.hcm-table th { background:#fafbfc; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.03em; color: var(--ink2); }
.hcm-td-name { font-weight:700; white-space:nowrap; }

/* Models */
.hcm-models { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:14px; }
.hcm-model { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; }
.hcm-model h3 { margin:0 0 6px; font-size:13px; font-weight:800; }
.hcm-model p { margin:0; font-size:12px; color: var(--ink2); line-height:1.5; }

.hcm-footer { max-width:1100px; margin:24px auto 0; padding:12px 14px; border:1px solid color-mix(in srgb, var(--block) 30%, var(--line)); border-radius:10px;
  background: color-mix(in srgb, var(--block) 5%, #fff); font-size:12.5px; font-weight:700; color: var(--block); }
`;
