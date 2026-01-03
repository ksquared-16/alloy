"use client";

import { useEffect, useState } from "react";
import Section from "@/components/Section";

export default function StripeDebugPage() {
    const [mounted, setMounted] = useState(false);
    const [hasPublishableKey, setHasPublishableKey] = useState<boolean | null>(null);
    const [hostname, setHostname] = useState<string>("");
    const [nodeEnv, setNodeEnv] = useState<string>("");

    useEffect(() => {
        setMounted(true);
        
        // Check if publishable key exists (but don't log the actual key)
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        setHasPublishableKey(key !== undefined && key !== null && key.trim() !== "");
        
        // Get hostname and environment info
        if (typeof window !== "undefined") {
            setHostname(window.location.hostname);
        }
        setNodeEnv(process.env.NODE_ENV || "unknown");
    }, []);

    if (!mounted) {
        return (
            <div className="min-h-screen py-6 md:py-10">
                <Section className="max-w-2xl">
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-10">
                        <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alloy-blue border-t-transparent mb-4"></div>
                            <p className="text-alloy-midnight/70">Loading...</p>
                        </div>
                    </div>
                </Section>
            </div>
        );
    }

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-2xl">
                <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-10">
                    <h1 className="text-3xl font-bold text-alloy-midnight mb-6">
                        Stripe Configuration Debug
                    </h1>

                    <div className="space-y-4">
                        <div className="bg-alloy-stone/20 rounded-lg p-4 border border-alloy-stone/30">
                            <h2 className="text-lg font-semibold text-alloy-midnight mb-3">
                                Environment Variables
                            </h2>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-alloy-midnight/70">
                                        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
                                    </span>
                                    <span
                                        className={`font-semibold ${
                                            hasPublishableKey
                                                ? "text-alloy-juniper"
                                                : "text-red-600"
                                        }`}
                                    >
                                        {hasPublishableKey ? "✓ Present" : "✗ Missing"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-alloy-stone/20 rounded-lg p-4 border border-alloy-stone/30">
                            <h2 className="text-lg font-semibold text-alloy-midnight mb-3">
                                Environment Info
                            </h2>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-alloy-midnight/70">Hostname:</span>
                                    <span className="font-mono text-alloy-midnight">
                                        {hostname || "unknown"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-alloy-midnight/70">NODE_ENV:</span>
                                    <span className="font-mono text-alloy-midnight">{nodeEnv}</span>
                                </div>
                            </div>
                        </div>

                        {!hasPublishableKey && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-red-800 mb-2">
                                    Configuration Issue
                                </h3>
                                <p className="text-sm text-red-700">
                                    The Stripe publishable key is not configured. Please:
                                </p>
                                <ul className="text-sm text-red-700 mt-2 list-disc list-inside space-y-1">
                                    <li>Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in Vercel project settings</li>
                                    <li>Redeploy the application for changes to take effect</li>
                                </ul>
                            </div>
                        )}

                        {hasPublishableKey && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-green-800 mb-2">
                                    Configuration OK
                                </h3>
                                <p className="text-sm text-green-700">
                                    Stripe publishable key is configured and available.
                                </p>
                            </div>
                        )}

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-blue-800 mb-2">
                                Note
                            </h3>
                            <p className="text-sm text-blue-700">
                                This page only checks if the environment variable is present. It does not
                                display the actual key value for security reasons.
                            </p>
                        </div>
                    </div>
                </div>
            </Section>
        </div>
    );
}

