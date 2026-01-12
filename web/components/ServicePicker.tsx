"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PrimaryButton from "@/components/PrimaryButton";

interface ServicePickerProps {
  variant?: "button" | "link";
  className?: string;
}

export default function ServicePicker({ variant = "button", className = "" }: ServicePickerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const services = [
    { href: "/services/cleaning?open=1#quote-form", label: "Home Cleaning" },
    { href: "/gutters#quote-form", label: "Gutter Cleaning" },
  ];

  const handleServiceClick = (href: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    setIsOpen(false);
    // Use window.location for full page navigation to ensure form state resets
    window.location.href = href;
  };

  if (variant === "link") {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-alloy-midnight hover:text-alloy-juniper transition-colors font-medium"
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          Get a Quote
          <svg
            className={`inline-block w-4 h-4 ml-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-alloy-stone/30 py-2 z-50">
            {services.map((service) => (
              <button
                key={service.href}
                onClick={() => handleServiceClick(service.href)}
                className="block w-full text-left px-4 py-2 text-sm text-alloy-midnight hover:bg-alloy-stone/50 transition-colors"
              >
                {service.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="w-full sm:w-auto"
      >
        <PrimaryButton className="w-full sm:w-auto">
          Get a Quote
          <svg
            className={`inline-block w-4 h-4 ml-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </PrimaryButton>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-alloy-stone/30 py-2 z-50">
          {services.map((service) => (
            <button
              key={service.href}
              onClick={() => handleServiceClick(service.href)}
              className="block w-full text-left px-4 py-2 text-sm text-alloy-midnight hover:bg-alloy-stone/50 transition-colors"
            >
              {service.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

