#!/usr/bin/env python3
"""
Sync contacts from GoHighLevel to Supabase.
This script is idempotent and safe to run multiple times.
"""
import logging
import sys
from typing import Dict
from .config import validate_config
from .ghl_client import fetch_all_contacts, normalize_ghl_contact
from .supabase_db import (
    find_external_mapping,
    upsert_contact,
    upsert_external_mapping,
    build_external_mapping_payload,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def build_contact_payload(contact_data: Dict) -> Dict:
    """
    Build contact payload for Supabase contacts table.
    
    Args:
        contact_data: Normalized contact data from GHL
    
    Returns:
        Contact payload dictionary matching contacts table schema
    """
    # Prepare metadata with address and other extra fields
    metadata = {}
    
    # Add address fields to metadata (contacts table doesn't have address columns)
    if contact_data.get("address1"):
        metadata["address1"] = contact_data.get("address1")
    if contact_data.get("city"):
        metadata["city"] = contact_data.get("city")
    if contact_data.get("state"):
        metadata["state"] = contact_data.get("state")
    if contact_data.get("postal_code"):
        metadata["postal_code"] = contact_data.get("postal_code")
    if contact_data.get("country"):
        metadata["country"] = contact_data.get("country")
    
    # Add tags to metadata if present
    if contact_data.get("tags"):
        metadata["tags"] = contact_data.get("tags")
    
    # Prepare contact row (only fields that exist in contacts table)
    contact_payload = {
        "first_name": contact_data.get("first_name") or None,
        "last_name": contact_data.get("last_name") or None,
        "email": contact_data.get("email") or None,
        "phone": contact_data.get("phone") or None,
    }
    
    # Map GHL 'type' field to contacts.contact_type
    if contact_data.get("type"):
        contact_payload["contact_type"] = contact_data.get("type")
    
    # Add metadata if we have any extra fields
    if metadata:
        contact_payload["metadata"] = metadata
    
    # Add created_at if available
    if contact_data.get("created_at"):
        contact_payload["created_at"] = contact_data.get("created_at")
    
    return contact_payload

def main():
    """Main sync function."""
    try:
        # Validate configuration
        logger.info("Validating configuration...")
        validate_config()
        logger.info("Configuration valid")
        
        # Fetch all contacts from GHL
        logger.info("Fetching contacts from GoHighLevel...")
        ghl_contacts = fetch_all_contacts()
        logger.info(f"Fetched {len(ghl_contacts)} contacts from GHL")
        
        if not ghl_contacts:
            logger.warning("No contacts found in GHL")
            return
        
        # Upsert contacts into Supabase
        logger.info("Upserting contacts into Supabase...")
        upserted_count = 0
        updated_count = 0
        created_count = 0
        errors = []
        
        for idx, ghl_contact in enumerate(ghl_contacts, 1):
            try:
                ghl_contact_id = ghl_contact.get("id")
                if not ghl_contact_id:
                    logger.warning(f"Contact at index {idx} has no ID, skipping")
                    continue
                
                # Normalize contact data
                normalized = normalize_ghl_contact(ghl_contact)
                
                # Look up existing mapping
                mapping = find_external_mapping("ghl", "contact", ghl_contact_id, "contacts")
                existing_internal_id = mapping.get("internal_id") if mapping else None
                is_update = existing_internal_id is not None
                
                # Build contact payload
                contact_payload = build_contact_payload(normalized)
                
                # Upsert contact (PATCH if exists, POST if new)
                # Pass ghl_contact for dedupe fallback context
                contact_result = upsert_contact(contact_payload, existing_internal_id, ghl_contact)
                contact_id = contact_result["id"]
                
                # Build and upsert external mapping
                mapping_payload = build_external_mapping_payload(ghl_contact_id, contact_id, ghl_contact)
                upsert_external_mapping(mapping_payload)
                
                if is_update:
                    updated_count += 1
                else:
                    created_count += 1
                upserted_count += 1
                
                if idx % 50 == 0:
                    logger.info(f"Processed {idx}/{len(ghl_contacts)} contacts...")
            
            except Exception as e:
                error_msg = f"Error processing contact {ghl_contact.get('id', 'unknown')}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                continue
        
        # Print summary
        logger.info("=" * 60)
        logger.info("SYNC SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total contacts fetched from GHL: {len(ghl_contacts)}")
        logger.info(f"Successfully upserted: {upserted_count}")
        logger.info(f"  - Created: {created_count}")
        logger.info(f"  - Updated: {updated_count}")
        logger.info(f"Errors: {len(errors)}")
        
        if errors:
            logger.warning("Errors encountered:")
            for error in errors[:10]:  # Show first 10 errors
                logger.warning(f"  - {error}")
            if len(errors) > 10:
                logger.warning(f"  ... and {len(errors) - 10} more errors")
        
        logger.info("=" * 60)
        logger.info("Sync completed successfully")
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        logger.error("Please check your .env file and ensure all required variables are set.")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Sync failed: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
