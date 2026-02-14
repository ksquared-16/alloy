"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function RescheduleContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
    if (!token) return <div className="p-6">Invalid link.</div>;
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md w-full border border-alloy-stone/30 rounded-lg p-6 bg-white">
                <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Reschedule</h1>
                <p className="text-alloy-midnight/70 text-sm mb-4">Calendar UI for rescheduling will be available here.</p>
                <Link href="/book-v2" className="text-alloy-blue hover:underline text-sm">Go to Booking</Link>
            </div>
        </div>
    );
}

export default function ReschedulePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-6">Loading…</div>}>
            <RescheduleContent />
        </Suspense>
    );
}
