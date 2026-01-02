"use client";

import { useEffect, useRef } from "react";
import Section from "@/components/Section";

export default function PaymentPage() {
    const scriptLoaded = useRef(false);

    // Load the GHL form embed script (only if not already loaded globally)
    // Note: GhlScript in layout.tsx loads it globally, but we check to avoid duplicates
    useEffect(() => {
        // Check if script already exists
        const existingScript = document.querySelector('script[src="https://link.msgsndr.com/js/form_embed.js"]');
        if (existingScript || scriptLoaded.current) {
            scriptLoaded.current = true;
            return;
        }

        scriptLoaded.current = true;
        const script = document.createElement("script");
        script.src = "https://link.msgsndr.com/js/form_embed.js";
        script.type = "text/javascript";
        script.async = true;
        document.body.appendChild(script);
    }, []);

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-5xl">
                <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
                    <iframe
                        src="https://api.leadconnectorhq.com/widget/form/JUSlLfHpJeX7T9wtzLKT"
                        style={{ width: "100%", height: "100%", border: "none", borderRadius: "3px" }}
                        id="inline-JUSlLfHpJeX7T9wtzLKT"
                        data-layout="{'id':'INLINE'}"
                        data-trigger-type="alwaysShow"
                        data-trigger-value=""
                        data-activation-type="alwaysActivated"
                        data-activation-value=""
                        data-deactivation-type="neverDeactivate"
                        data-deactivation-value=""
                        data-form-name="Payment Booking"
                        data-height="1065"
                        data-layout-iframe-id="inline-JUSlLfHpJeX7T9wtzLKT"
                        data-form-id="JUSlLfHpJeX7T9wtzLKT"
                        title="Payment Booking"
                        className="min-h-[1065px]"
                    />
                </div>
            </Section>
        </div>
    );
}

