"use client";

import { useEffect, useState, useRef } from "react";

interface GhlBookingEmbedProps {
    phone: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    contactId: string | null;
}

/**
 * Clean React-safe GHL booking widget embed.
 * Loads form_embed.js script once and renders iframe with stable ID.
 */
export default function GhlBookingEmbed({
    phone,
    email,
    firstName,
    lastName,
    contactId,
}: GhlBookingEmbedProps) {
    const [mounted, setMounted] = useState(false);
    const scriptLoadedRef = useRef(false);
    const scriptElementRef = useRef<HTMLScriptElement | null>(null);

    // Ensure component only runs on client
    useEffect(() => {
        setMounted(true);
    }, []);

    // Load GHL script once (prevent duplicate injection)
    useEffect(() => {
        if (!mounted || scriptLoadedRef.current) return;

        // Check if script already exists (may be loaded globally via GhlScript)
        const existingScript = document.querySelector(
            'script[src="https://link.msgsndr.com/js/form_embed.js"]'
        );

        if (existingScript) {
            // Script already loaded (globally), initialize if needed
            if (typeof window !== "undefined" && (window as any).LeadConnector) {
                (window as any).LeadConnector.init();
            }
            scriptLoadedRef.current = true;
            return;
        }

        // Script not found, load it ourselves
        const script = document.createElement("script");
        script.src = "https://link.msgsndr.com/js/form_embed.js";
        script.async = true;
        scriptElementRef.current = script;
        
        script.onload = () => {
            if (typeof window !== "undefined" && (window as any).LeadConnector) {
                (window as any).LeadConnector.init();
            }
            scriptLoadedRef.current = true;
        };
        script.onerror = () => {
            console.error("Failed to load GHL booking script");
            scriptElementRef.current = null;
        };

        document.head.appendChild(script);

        return () => {
            // Cleanup: only remove if we added it (not the global one)
            if (scriptElementRef.current && scriptElementRef.current.parentNode) {
                scriptElementRef.current.parentNode.removeChild(scriptElementRef.current);
                scriptElementRef.current = null;
                scriptLoadedRef.current = false;
            }
        };
    }, [mounted]);

    // Build booking URL with prefill parameters
    const buildBookingUrl = () => {
        const baseUrl = "https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz";
        // Use window.location.origin to ensure staging stays on staging domain
        const redirectUrl = typeof window !== "undefined"
            ? `${window.location.origin}/payment`
            : "/payment"; // Fallback for SSR
        const params = new URLSearchParams({
            redirectUrl,
        });

        // Add prefill parameters if available (for contact matching)
        if (phone) params.append("phone", phone);
        if (email) params.append("email", email);
        if (firstName) params.append("first_name", firstName);
        if (lastName) params.append("last_name", lastName);
        if (contactId) params.append("lead_contact_id", contactId);

        return `${baseUrl}?${params.toString()}`;
    };

    // Stable iframe ID (no timestamps)
    const iframeId = "ghl-booking-widget-GficiTFm4cbAbQ05IHwz";

    if (!mounted) {
        return null;
    }

    return (
        <iframe
            src={buildBookingUrl()}
            style={{ width: "100%", border: "none", overflow: "hidden" }}
            scrolling="no"
            id={iframeId}
            title="Booking Calendar"
            className="min-h-[1200px] md:min-h-[900px]"
        />
    );
}

