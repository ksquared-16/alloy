"""
Pydantic models for request/response payloads.
"""
from pydantic import BaseModel, EmailStr
from typing import List, Optional


class CleaningLeadPayload(BaseModel):
    """Payload for submitting a cleaning lead from the frontend."""

    name: str
    email: EmailStr
    phone: str
    address: Optional[str] = None
    city: Optional[str] = None
    zip: Optional[str] = None
    home_size: Optional[str] = None  # e.g., "1-2 bedrooms", "3-4 bedrooms"
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    preferred_frequency: Optional[str] = None  # e.g., "weekly", "bi-weekly", "monthly", "one-time"
    notes: Optional[str] = None


class ProsApplicationPayload(BaseModel):
    """Payload for submitting a pros application from the frontend."""

    name: str
    phone: str
    email: EmailStr
    experience: Optional[str] = None
    notes: Optional[str] = None


class CleaningQuoteFormPayload(BaseModel):
    """Payload for the new custom cleaning quote form (Phase 2)."""

    first_name: str
    last_name: str
    phone: str
    email: EmailStr
    postal_code: str
    home_type: str
    service_type: str
    approximate_square_footage: str
    cleaning_frequency: str
    preferred_service_date: Optional[str] = None
    extras_add_ons: Optional[List[str]] = None
    addons__frequency: Optional[str] = None
    street_address: Optional[str] = None
    photos: Optional[List[str]] = None  # Base64 encoded images or URLs

