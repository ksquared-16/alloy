"use client";

import { useState } from "react";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { resolveAudience, type AudienceCandidate } from "@/lib/communications/v2/announcementModel";

/**
 * Operator-first announcement builder (PKG-15) — DARK (self-gated behind comms_v2_announcements).
 * Built on Action Workspace doctrine: a single operator broadcast with audience targeting + count.
 * Not a campaign/journey builder. Delivery + compliance classification run server-side at send time
 * (real-gate-validated follow-on).
 */
export default function AnnouncementBuilder(props: { candidates?: AudienceCandidate[] }) {
    if (!isCommsV2FlagEnabled("comms_v2_announcements")) return null;

    const [title, setTitle] = useState("");
    const [locationId, setLocationId] = useState("");
    const audience = resolveAudience({ locationId: locationId || null }, props.candidates ?? []);

    return (
        <div data-cc-announcement-builder className="space-y-2 bg-white">
            <input
                aria-label="Announcement title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-alloy-stone/15 px-2 py-1 text-sm"
                placeholder="Announcement title (e.g. School Closure)"
            />
            <input
                aria-label="Target location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-lg border border-alloy-stone/15 px-2 py-1 text-sm"
                placeholder="Target location id (optional)"
            />
            <div data-cc-announcement-audience className="text-xs text-alloy-midnight/70">
                Audience: {audience.count} recipient(s)
            </div>
        </div>
    );
}
