/**
 * Meta Pixel tracking helper
 * Safely no-ops if pixel is not loaded
 */

declare global {
  interface Window {
    fbq?: (
      action: string,
      event: string,
      params?: Record<string, any>
    ) => void;
  }
}

/**
 * Track a Meta Pixel event
 * @param eventName - Event name (e.g., 'Lead', 'Purchase', 'PageView')
 * @param params - Event parameters (vertical, flow, value, currency, etc.)
 */
export function trackMetaEvent(
  eventName: string,
  params?: {
    vertical?: string;
    flow?: "quote" | "book";
    value?: number;
    currency?: string;
    estimated_price?: number;
    [key: string]: any;
  }
): void {
  // Only track if pixel is loaded
  if (typeof window === "undefined" || !window.fbq) {
    return;
  }

  // Default vertical to "cleaning"
  const eventParams = {
    vertical: "cleaning",
    ...params,
  };

  try {
    window.fbq("track", eventName, eventParams);
  } catch (error) {
    console.warn("Meta Pixel tracking error:", error);
  }
}

/**
 * Check if Meta Pixel is loaded
 */
export function isMetaPixelLoaded(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}

