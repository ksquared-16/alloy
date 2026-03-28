"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Legacy entry: vendor links now use /action/[token]. Support old bookmarks with ?token=.
 */
function AcceptJobContent() {
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
                <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Accept job</h1>
                <p className="text-alloy-midnight/70 text-sm mb-4">
                    Open the job link from your message. New links use a short code (e.g.{" "}
                    <span className="font-mono text-xs">/a/…</span>) and take you to the confirmation page automatically.
                </p>
                <Link href="/admin/jobs" className="text-alloy-blue hover:underline text-sm">
                    Go to Admin Jobs
                </Link>
            </div>
        </div>
    );
}

export default function AcceptJobPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-6">Loading…</div>}>
            <AcceptJobContent />
        </Suspense>
    );
}
