"""
GoHighLevel API client for fetching contacts.
Handles pagination and retries with exponential backoff.
"""
import time
import logging
import requests
from typing import List, Dict, Optional
from .config import GHL_API_KEY, GHL_LOCATION_ID, GHL_BASE_URL

logger = logging.getLogger(__name__)

def _ghl_headers() -> dict:
    """Get standard GHL API headers."""
    return {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": "2021-07-28",
        "Content-Type": "application/json",
    }

def _retry_with_backoff(func, max_retries=5, initial_delay=1):
    """
    Retry a function with exponential backoff.
    Handles 429 (rate limit) and transient errors.
    """
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            response = func()
            if response.status_code == 429:
                # Rate limited - wait and retry
                if attempt < max_retries - 1:
                    logger.warning(f"Rate limited (429), retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(delay)
                    delay *= 2  # Exponential backoff
                    continue
            elif response.status_code >= 500:
                # Server error - retry
                if attempt < max_retries - 1:
                    logger.warning(f"Server error ({response.status_code}), retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(delay)
                    delay *= 2
                    continue
            return response
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                logger.warning(f"Request exception: {e}, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
                delay *= 2
            else:
                raise
    return response

def fetch_all_contacts(location_id: Optional[str] = None) -> List[Dict]:
    """
    Fetch all contacts from GHL for a location with pagination.
    Uses POST /contacts/search endpoint with page/pageLimit pagination (matching backend/app/ghl_client.py pattern).
    
    Args:
        location_id: GHL location ID (defaults to GHL_LOCATION_ID from config)
    
    Returns:
        List of contact dictionaries
    """
    if not location_id:
        location_id = GHL_LOCATION_ID
    
    if not location_id:
        raise ValueError("location_id is required")
    
    all_contacts = []
    page = 1
    page_limit = 100  # GHL API limit per page
    
    # Use POST /contacts/search endpoint (matches backend/app/ghl_client.py pattern)
    url = f"{GHL_BASE_URL}/contacts/search"
    
    logger.info(f"Starting contact fetch for location_id={location_id}")
    logger.info(f"Using endpoint: {url}")
    logger.info(f"Pagination method: page + pageLimit (page starts at 1)")
    
    while True:
        # Build request body with locationId, page, pageLimit (no filters = fetch all contacts)
        body = {
            "locationId": location_id.strip(),
            "page": page,
            "pageLimit": page_limit,
        }
        
        logger.info(f"Fetching page {page} (pageLimit={page_limit})...")
        
        def make_request():
            return requests.post(url, headers=_ghl_headers(), json=body, timeout=30)
        
        response = _retry_with_backoff(make_request)
        
        if not response.ok:
            logger.error(f"Failed to fetch contacts: {response.status_code} - {response.text[:200]}")
            response.raise_for_status()
        
        data = response.json()
        contacts = data.get("contacts", [])
        
        # Handle case where response is a list directly
        if not contacts and isinstance(data, list):
            contacts = data
        
        if not contacts:
            logger.info(f"Page {page} returned 0 contacts, stopping pagination")
            break
        
        all_contacts.extend(contacts)
        logger.info(f"Page {page}: fetched {len(contacts)} contacts (total so far: {len(all_contacts)})")
        
        # Check meta for pagination info (if available)
        meta = data.get("meta", {})
        total_pages = meta.get("totalPages")
        current_page = meta.get("page", page)
        
        # If we got fewer contacts than the limit, we've reached the end
        if len(contacts) < page_limit:
            logger.info(f"Page {page} returned fewer than {page_limit} contacts ({len(contacts)}), stopping pagination")
            break
        
        # If meta indicates we've reached the last page, stop
        if total_pages is not None and current_page >= total_pages:
            logger.info(f"Reached last page ({current_page}/{total_pages}), stopping pagination")
            break
        
        # Increment page for next iteration
        page += 1
        time.sleep(0.5)  # Small delay between pages to be respectful
    
    logger.info(f"Finished fetching contacts. Total: {len(all_contacts)}")
    return all_contacts

def normalize_ghl_contact(ghl_contact: Dict) -> Dict:
    """
    Normalize GHL contact data to our internal format.
    
    Args:
        ghl_contact: Raw GHL contact dictionary
    
    Returns:
        Normalized contact dictionary
    """
    # Extract address fields
    address = ghl_contact.get("address1") or ghl_contact.get("street_address") or ""
    
    normalized = {
        "ghl_id": ghl_contact.get("id"),
        "first_name": ghl_contact.get("firstName") or ghl_contact.get("first_name") or "",
        "last_name": ghl_contact.get("lastName") or ghl_contact.get("last_name") or "",
        "email": ghl_contact.get("email") or "",
        "phone": ghl_contact.get("phone") or "",
        "address1": address,
        "city": ghl_contact.get("city") or "",
        "state": ghl_contact.get("state") or "",
        "postal_code": ghl_contact.get("postalCode") or ghl_contact.get("postal_code") or "",
        "country": ghl_contact.get("country") or "",
        "type": ghl_contact.get("type") or "",  # Map to contact_type in contacts table
        "created_at": ghl_contact.get("dateAdded") or ghl_contact.get("createdAt") or ghl_contact.get("date_added"),
        "tags": ghl_contact.get("tags", []),
    }
    
    return normalized

