"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Persists booking prefill data to sessionStorage and localStorage
 * so it can be retrieved on /payment even if GHL redirect doesn't include query params.
 */
export default function BookPrefillPersist() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";
        const phone = searchParams?.get("phone");
        const email = searchParams?.get("email");
        const firstName = searchParams?.get("first_name");
        const lastName = searchParams?.get("last_name");
        const estimatedPrice = searchParams?.get("estimated_price");
        const ghlContactId = searchParams?.get("ghl_contact_id");

        if (isStaging) {
            console.log("[STAGING DEBUG] BookPrefillPersist: Component mounted", {
                has_phone: !!phone,
                has_email: !!email,
                has_ghl_contact_id: !!ghlContactId
            });
        }

        // Decode URL-encoded phone (e.g., %2B1... -> +1...)
        let decodedPhone = phone;
        if (decodedPhone) {
            try {
                decodedPhone = decodeURIComponent(decodedPhone);
            } catch (e) {
                // If decoding fails, use original
            }
        }

        // Persist whatever data exists (partial data is fine)
        if (decodedPhone || email || firstName || lastName) {
            const prefillData = {
                phone: decodedPhone || undefined,
                email: email || undefined,
                first_name: firstName || undefined,
                last_name: lastName || undefined,
                estimated_price: estimatedPrice || undefined,
                ghl_contact_id: ghlContactId || undefined,
            };

            // Remove undefined values
            const cleanedData = Object.fromEntries(
                Object.entries(prefillData).filter(([_, v]) => v !== undefined)
            );

            try {
                const jsonData = JSON.stringify(cleanedData);
                // Store in both sessionStorage and localStorage for redundancy
                sessionStorage.setItem("alloy_booking_prefill", jsonData);
                localStorage.setItem("alloy_booking_prefill", jsonData);
                
                if (isStaging) {
                    console.log("[STAGING DEBUG] BookPrefillPersist: Session data written successfully", {
                        storage_key: "alloy_booking_prefill",
                        has_session_storage: typeof sessionStorage !== "undefined",
                        has_local_storage: typeof localStorage !== "undefined",
                        data_keys: Object.keys(cleanedData)
                    });
                }
            } catch (e) {
                if (isStaging) {
                    console.error("[STAGING DEBUG] BookPrefillPersist: Failed to write session data", {
                        error: String(e),
                        storage_key: "alloy_booking_prefill"
                    });
                }
                console.warn("Failed to persist booking prefill data:", e);
            }
        } else {
            if (isStaging) {
                console.log("[STAGING DEBUG] BookPrefillPersist: No data to persist", {
                    has_phone: !!decodedPhone,
                    has_email: !!email,
                    has_first_name: !!firstName,
                    has_last_name: !!lastName
                });
            }
        }
    }, [searchParams]);

    // This component doesn't render anything
    return null;
}

