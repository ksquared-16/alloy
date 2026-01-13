"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Section from "@/components/Section";
import { REDIRECT_DELAY_MS } from "@/lib/ui";

function clearBookingPrefill() {
    try {
        sessionStorage.removeItem("alloy_booking_prefill");
        localStorage.removeItem("alloy_booking_prefill");
    } catch (e) {
        console.warn("Failed to clear booking prefill storage:", e);
    }
}

export default function PaymentSuccessClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectSeconds = Math.ceil(REDIRECT_DELAY_MS / 1000);
    const [countdown, setCountdown] = useState(redirectSeconds);

    const phone = searchParams?.get("phone");
    const email = searchParams?.get("email");
    const ghlContactId = searchParams?.get("ghl_contact_id");

    // Clear storage on mount (payment already succeeded)
    useEffect(() => {
        clearBookingPrefill();
    }, []);

    useEffect(() => {
        // Auto-redirect after delay
        const redirectTimer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(redirectTimer);
                    router.push("/");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(redirectTimer);
    }, [router]);

    const handleDone = () => {
        router.push("/");
    };

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4">
            <Section className="max-w-md w-full">
                <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-lg p-8 md:p-10 text-center">
                    {/* Success Icon */}
                    <div className="mb-6">
                        <svg
                            className="w-20 h-20 mx-auto text-alloy-juniper"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>

                    {/* Heading */}
                    <h1 className="text-3xl font-bold text-alloy-midnight mb-4">
                        Card Saved Successfully!
                    </h1>

                    {/* Message */}
                    <p className="text-lg text-alloy-midnight/80 mb-2">
                        Your card has been saved securely.
                    </p>
                    <p className="text-base text-alloy-midnight/70 mb-8">
                        You will not be charged today. We&apos;ll only charge your card after service is completed.
                    </p>

                    {/* Countdown */}
                    <p className="text-sm text-alloy-midnight/60 mb-6">
                        Redirecting to homepage in {countdown} second{countdown !== 1 ? "s" : ""}...
                    </p>

                    {/* Done Button */}
                    <button
                        onClick={handleDone}
                        className="w-full bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </Section>
        </div>
    );
}

