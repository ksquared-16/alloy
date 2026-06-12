"use client";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";

export type AlloyIdentityAtmospherePhase = "drifting" | "tightening" | "revealing";

type Props = {
    phase?: AlloyIdentityAtmospherePhase;
    className?: string;
};

/**
 * Loader atmosphere — drifting Bend Pine mist above the mark.
 * Horizontal bands meander vertically; never converge or funnel toward the logo.
 */
export function AlloyIdentityAtmosphere({ phase = "drifting", className = "" }: Props) {
    return (
        <div
            className={`alloy-identity-atmosphere alloy-identity-atmosphere--${phase} ${className}`.trim()}
            aria-hidden
            data-alloy-identity-atmosphere={phase}
        >
            <span className="alloy-identity-atmosphere__band alloy-identity-atmosphere__band--a" />
            <span className="alloy-identity-atmosphere__band alloy-identity-atmosphere__band--b" />
            <span className="alloy-identity-atmosphere__band alloy-identity-atmosphere__band--c" />
            <span className="alloy-identity-atmosphere__band alloy-identity-atmosphere__band--d" />
            <span className="alloy-identity-atmosphere__band alloy-identity-atmosphere__band--e" />
        </div>
    );
}
