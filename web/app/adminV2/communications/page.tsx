import { Suspense } from "react";

import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import CommunicationsHubClient from "@/app/adminV2/communications/CommunicationsHubClient";

/**
 * Communications Hub (Phase 1 / B3) — the permanent shell that Inbox, Templates,
 * Announcements, and Preferences live inside.
 *
 * Flags are resolved SERVER-SIDE here and passed to the client: the flag helper
 * reads process.env[name] by a computed key, which Next.js cannot inline into the
 * client bundle, so gating must happen on the server. Ships dark — when no
 * comms_v2 hub flag is enabled the route renders an inert notice.
 */
export default function CommunicationsHubPage() {
    const flags = {
        templates: isCommsV2FlagEnabled("comms_v2_templates"),
        announcements: isCommsV2FlagEnabled("comms_v2_announcements"),
        preferences: isCommsV2FlagEnabled("comms_v2_preferences"),
    };
    const hubEnabled = flags.templates || flags.announcements || flags.preferences;

    if (!hubEnabled) {
        return (
            <main
                data-comms-hub-disabled="true"
                className="flex h-[calc(100dvh-3.75rem)] items-center justify-center bg-[#F8F9FB] text-sm text-alloy-midnight/55"
            >
                Communications Hub is not enabled.
            </main>
        );
    }

    return (
        <Suspense
            fallback={
                <main className="flex h-[calc(100dvh-3.75rem)] items-center justify-center bg-[#F8F9FB] text-sm text-alloy-midnight/55">
                    Loading Communications…
                </main>
            }
        >
            <CommunicationsHubClient flags={flags} />
        </Suspense>
    );
}
