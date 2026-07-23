"use client";

/**
 * Access → Security (organization-level). Per-user password reset lives on the user's own
 * Security tab (Access → Users). This chapter is org-wide posture: authentication methods,
 * sign-in policies, sessions, and the access audit log — all Planned except Password today.
 */

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";

export default function AccessSecurityPage() {
    return (
        <div data-testid="access-security-page" className="space-y-4">
            <p className="text-xs leading-snug text-alloy-midnight/55">
                Authentication methods, account security, and access auditing for this organization.
            </p>

            <ConfigWorkspaceCard testId="access-security-authentication" title="Authentication">
                <ul className="space-y-2 text-sm">
                    <li className="flex items-center justify-between gap-2">
                        <span className="text-alloy-midnight">Password</span>
                        <span className="rounded-full border border-alloy-pine/25 bg-alloy-pine/10 px-2 py-0.5 text-[11px] font-medium text-alloy-pine">
                            Available
                        </span>
                    </li>
                    <li className="flex items-center justify-between gap-2" data-capability="planned">
                        <span className="text-alloy-midnight/55">Google sign-in</span>
                        <span className="rounded-full border border-alloy-stone/25 bg-alloy-stone/10 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/45">
                            Planned
                        </span>
                    </li>
                    <li className="flex items-center justify-between gap-2" data-capability="planned">
                        <span className="text-alloy-midnight/55">Microsoft sign-in</span>
                        <span className="rounded-full border border-alloy-stone/25 bg-alloy-stone/10 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/45">
                            Planned
                        </span>
                    </li>
                    <li className="flex items-center justify-between gap-2" data-capability="planned">
                        <span className="text-alloy-midnight/55">Single sign-on (SSO)</span>
                        <span className="rounded-full border border-alloy-stone/25 bg-alloy-stone/10 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/45">
                            Planned
                        </span>
                    </li>
                </ul>
                <p className="mt-3 text-[11px] text-alloy-midnight/45">
                    Password resets for a specific person are sent from that user&apos;s Security tab under
                    Access → Users.
                </p>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard testId="access-security-signin-policies" title="Sign-in Policies">
                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                    Org-wide sign-in policies (password strength, session lifetime, IP allowlists) are
                    planned and not yet available.
                </p>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard testId="access-security-sessions" title="Sessions">
                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                    Active session visibility across the organization is planned and not yet available.
                </p>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard testId="access-security-audit-log" title="Audit Log">
                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                    A verified access audit log — sign-ins, role changes, and access-scope changes across
                    every user — is planned. No events are fabricated for display.
                </p>
            </ConfigWorkspaceCard>
        </div>
    );
}
