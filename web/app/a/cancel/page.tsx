"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Legacy entry: short links now go to /action/[token]. Support old bookmarks with ?token=.
 */
function CancelContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    useEffect(() => {
        if (token?.trim()) {
            router.replace(`/action/${encodeURIComponent(token.trim())}`);
        }
    }, [token, router]);

    if (token?.trim()) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <p className="text-alloy-midnight/70 text-sm">Opening your link…</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md w-full border border-alloy-stone/30 rounded-xl p-6 bg-white shadow-sm">
                <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Cancel appointment</h1>
                <p className="text-alloy-midnight/70 text-sm mb-4">
                    Open the cancel link from your message or email. If you have a full link, it should start with{" "}
                    <span className="font-mono text-xs">/action/</span>.
                </p>
                <Link href="/" className="text-alloy-blue hover:underline text-sm">
                    Go home
                </Link>
            </div>
        </div>
    );
}

export default function CancelPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-6">Loading…</div>}>
            <CancelContent />
        </Suspense>
    );
}
