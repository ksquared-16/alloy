"use client";

/**
 * Where Attendance-affecting expectations are managed — a SIGNPOST, not a second
 * authoring surface.
 *
 * ── WHY THERE IS NO EDITOR HERE ──
 *
 * Marking a child off sick and closing a site for a snow day are already authored
 * from the Attendance Workspace, against the day being changed, by the person who
 * knows. That is the right place: the decision is operational and it is taken in
 * context. Rebuilding it in Settings would give the org two doors to the same
 * ledger and a standing question about which one is authoritative.
 *
 * What Settings genuinely owed an administrator was the ANSWER TO "where is this
 * managed?" — which nothing provided, because the product calls these service-day
 * exceptions and an administrator looking for "absence settings" found nothing at
 * all. So this page explains the model in operator language and routes to the
 * surface that owns it.
 *
 * The three truths are stated explicitly because confusing them is the failure
 * this architecture exists to prevent: a plan is not a fact, and a child who
 * turns up anyway does not retroactively make the plan wrong.
 */

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";

const MANAGED_IN_WORKSPACE: { title: string; body: string }[] = [
    {
        title: "A child is away",
        body: "Off sick, on holiday, or away for the day for any other reason. Recorded against that child and that date, from the day's roster.",
    },
    {
        title: "The site is closed",
        body: "A snow day, a holiday, a closure. Recorded once against the site — not as one absence per child — so moving or reopening it is one change, not a hundred.",
    },
    {
        title: "A room or group is closed",
        body: "The same statement, made about one operational group rather than the whole site.",
    },
    {
        title: "A plan changed or was called off",
        body: "Reopening a closed day, or revising what was expected. The earlier statement is kept and superseded rather than erased, so the record still shows what was believed at the time.",
    },
];

export default function AttendanceExpectationsGuidePage() {
    return (
        <div className="flex min-h-0 w-full min-w-0 flex-col">
            <ConfigurationContext
                eyebrow="Attendance"
                title="Expected absence and closures"
                subtitle="Where planned absence, holidays and closures are recorded — and why they are not settings."
                titleIcon={<CalendarClock className="h-4 w-4" aria-hidden />}
                testId="attendance-expectations-context"
            />

            <div className="flex flex-col gap-4 p-4">
                <ConfigWorkspaceCard
                    testId="attendance-expectations-where"
                    title="These are recorded on the day, not configured here"
                >
                    <p className="text-sm text-alloy-midnight">
                        Absence and closures are recorded from the Attendance workspace, against the
                        date they affect. There is no separate list of them to configure, because each
                        one is a statement about a particular day rather than a standing rule.
                    </p>
                    <Link href="/adminV2/roster" data-testid="attendance-expectations-workspace-link">
                        <ConfigurationSecondaryButton className="mt-3">
                            Go to Attendance
                        </ConfigurationSecondaryButton>
                    </Link>
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard
                    testId="attendance-expectations-kinds"
                    title="What can be recorded"
                >
                    <ul className="flex flex-col gap-3">
                        {MANAGED_IN_WORKSPACE.map((item) => (
                            <li key={item.title} data-testid="attendance-expectation-kind">
                                <p className="text-sm font-medium text-alloy-midnight">{item.title}</p>
                                <p className="text-[12px] text-alloy-midnight/55">{item.body}</p>
                            </li>
                        ))}
                    </ul>
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard
                    testId="attendance-expectations-model"
                    title="Why a plan and an attendance record are different things"
                >
                    <dl className="flex flex-col gap-3">
                        <div>
                            <dt className="text-sm font-medium text-alloy-midnight">The usual week</dt>
                            <dd className="text-[12px] text-alloy-midnight/55">
                                The days a child is normally booked for. Managed with their schedule.
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-alloy-midnight">What we know will differ</dt>
                            <dd className="text-[12px] text-alloy-midnight/55">
                                Holidays, sickness, closures. Recorded in Attendance, on the day.
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-alloy-midnight">What actually happened</dt>
                            <dd className="text-[12px] text-alloy-midnight/55">
                                Who was here. A child who was expected to be away but turns up is marked
                                present — the record of the day shows both, and the plan is not rewritten
                                to match. Any charge or credit that follows is decided in Financials, not
                                here.
                            </dd>
                        </div>
                    </dl>
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
