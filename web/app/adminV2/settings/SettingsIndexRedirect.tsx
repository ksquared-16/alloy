"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readConfigurationModeLastSurface } from "@/lib/adminV2/configurationModeLastSurface";

/** `/settings` redirects to last active Configuration surface (default Processes). */
export default function SettingsIndexRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace(readConfigurationModeLastSurface());
    }, [router]);

    return (
        <div
            className="flex min-h-0 flex-1 items-center justify-center text-sm text-alloy-midnight/55"
            data-testid="settings-index-redirect"
            aria-live="polite"
        >
            Opening configuration…
        </div>
    );
}
