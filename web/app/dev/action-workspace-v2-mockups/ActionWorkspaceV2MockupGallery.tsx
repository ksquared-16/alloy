"use client";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import {
    FINDINGS_COLLAPSED,
    FINDINGS_FULL,
    FINDINGS_WITH_UNCERTAIN,
    READY_SUMMARY,
    SOURCE_INQUIRY,
    SOURCE_INQUIRY_PARTIAL,
} from "./fixtures";
import { FindingCard, FooterBtn, MockupDeck } from "./MockupPrimitives";

export default function ActionWorkspaceV2MockupGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Design sign-off · dev mockups only · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Action Workspace V2 — Concept B+ Mockups
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Split-pane BOS workstation. Source Material stays visible throughout. Findings lead
                        with BOS voice — field names only inside expanded detail.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/action-workspace-v2-mockups</p>
                </header>

                {/* 1 · Intake */}
                <MockupDeck
                    mockupId="intake"
                    activePhase="Intake"
                    sourceText={SOURCE_INQUIRY}
                    rightHeader={
                        <>
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-alloy-gold-dark">
                                BOS Findings
                            </div>
                            <p className="text-[12px] text-alloy-muted">Waiting for source material</p>
                        </>
                    }
                    rightChildren={
                        <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-alloy-gold/35 bg-alloy-gold/[0.04] px-6 text-center">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-alloy-gold/20 text-alloy-gold-dark">
                                <BosMark size="md" />
                            </div>
                            <p className="max-w-sm text-[14px] font-medium text-alloy-midnight">
                                Paste an inquiry on the left, then analyze.
                            </p>
                            <p className="mt-1 max-w-sm text-[12px] text-alloy-muted">
                                BOS will report findings here — not form fields. Source stays visible for
                                comparison.
                            </p>
                        </div>
                    }
                    footer={
                        <>
                            <div className="flex gap-2">
                                <FooterBtn>Cancel</FooterBtn>
                                <FooterBtn>Enter manually</FooterBtn>
                            </div>
                            <FooterBtn variant="gold">Analyze with BOS</FooterBtn>
                        </>
                    }
                />

                {/* 2 · Findings */}
                <MockupDeck
                    mockupId="findings"
                    activePhase="Findings"
                    sourceText={SOURCE_INQUIRY}
                    rightHeader={
                        <>
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-alloy-gold-dark">
                                BOS Findings
                            </div>
                            <p className="text-[12px] text-alloy-muted">
                                5 findings · 1 needs review · compare against source →
                            </p>
                        </>
                    }
                    rightChildren={
                        <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
                            <p className="shrink-0 rounded-lg bg-alloy-midnight/[0.04] px-3 py-2 text-[12px] text-alloy-forge/85">
                                <span className="font-semibold text-alloy-midnight">BOS: </span>
                                I read the inquiry. Contact and family names look solid. Please confirm the
                                source before we continue.
                            </p>
                            <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
                                {FINDINGS_FULL.map((f) => (
                                    <FindingCard key={f.id} finding={f} />
                                ))}
                            </div>
                        </div>
                    }
                    rightFooterNote="Field labels appear inside findings only — not as section headers."
                    footer={
                        <>
                            <FooterBtn>Back</FooterBtn>
                            <div className="flex gap-2">
                                <FooterBtn>Select all</FooterBtn>
                                <FooterBtn variant="juniper">Apply 5 findings</FooterBtn>
                            </div>
                        </>
                    }
                />

                {/* 3 · Fill Gaps */}
                <MockupDeck
                    mockupId="fill-gaps"
                    activePhase="Fill Gaps"
                    sourceText={SOURCE_INQUIRY_PARTIAL}
                    rightHeader={
                        <>
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-alloy-gold-dark">
                                BOS Findings
                            </div>
                            <p className="text-[12px] text-alloy-muted">
                                2 items need you · source still visible for traceability
                            </p>
                        </>
                    }
                    rightChildren={
                        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
                            <p className="shrink-0 rounded-lg bg-amber-50 border border-amber-200/80 px-3 py-2 text-[12px] text-amber-950">
                                <span className="font-semibold">BOS: </span>
                                I could not confidently determine the parent&apos;s full name. Location may be a
                                site preference — not a program.
                            </p>

                            <div className="shrink-0 space-y-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-muted/70">
                                    Applied findings
                                </p>
                                {FINDINGS_COLLAPSED.map((f) => (
                                    <FindingCard key={f.id} finding={{ ...f, expanded: false }} />
                                ))}
                            </div>

                            <div className="min-h-0 flex-1 rounded-xl border border-amber-200/70 bg-amber-50/40 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-900/80">
                                    Still needed from you
                                </p>
                                <div className="mt-2 space-y-2">
                                    {FINDINGS_WITH_UNCERTAIN.filter((f) => f.status === "review").map((f) => (
                                        <FindingCard key={f.id} finding={f} />
                                    ))}
                                    <div className="rounded-lg border border-alloy-midnight/8 bg-white px-3 py-2">
                                        <label className="text-[11px] font-medium text-alloy-muted">
                                            Phone (required — email alone is not enough for some sites)
                                        </label>
                                        <input
                                            type="tel"
                                            placeholder="Add phone number"
                                            className="mt-1 w-full rounded-lg border border-alloy-midnight/12 px-2.5 py-2 text-[13px] text-alloy-midnight"
                                            defaultValue=""
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    }
                    footer={
                        <>
                            <FooterBtn>Back to findings</FooterBtn>
                            <FooterBtn variant="blue">Continue when ready</FooterBtn>
                        </>
                    }
                />

                {/* 4 · Ready To Create */}
                <MockupDeck
                    mockupId="ready-to-create"
                    activePhase="Ready To Create"
                    sourceText={SOURCE_INQUIRY}
                    rightHeader={
                        <>
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-alloy-gold-dark">
                                Ready To Create
                            </div>
                            <p className="text-[12px] text-alloy-muted">
                                All findings approved · platform minimum satisfied
                            </p>
                        </>
                    }
                    rightChildren={
                        <div className="flex h-full flex-col gap-3">
                            <div className="rounded-xl border border-alloy-juniper/25 bg-alloy-juniper/[0.06] px-4 py-3">
                                <p className="text-[14px] font-semibold text-alloy-midnight">
                                    BOS: Ready when you are.
                                </p>
                                <p className="mt-1 text-[12px] text-alloy-muted">
                                    I&apos;ll create the lead and open it in your workspace. You can still compare
                                    against source material on the left.
                                </p>
                            </div>

                            <div className="rounded-xl border border-alloy-midnight/8 bg-white p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-muted">
                                    Approved record preview
                                </p>
                                <dl className="mt-2 space-y-2">
                                    {READY_SUMMARY.map((row) => (
                                        <div key={row.label} className="flex gap-3 text-[13px]">
                                            <dt className="w-20 shrink-0 text-alloy-muted">{row.label}</dt>
                                            <dd className="font-medium text-alloy-midnight">{row.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>

                            <div className="mt-auto rounded-lg border border-alloy-midnight/6 bg-alloy-stone/80 px-3 py-2 text-[11px] text-alloy-muted">
                                Review step skipped — all findings were high confidence and unmodified. Operators
                                can still open full review via secondary action.
                            </div>
                        </div>
                    }
                    footer={
                        <>
                            <FooterBtn>Back</FooterBtn>
                            <div className="flex gap-2">
                                <FooterBtn>Review first</FooterBtn>
                                <FooterBtn variant="juniper">Create lead</FooterBtn>
                            </div>
                        </>
                    }
                />
            </div>
        </div>
    );
}
