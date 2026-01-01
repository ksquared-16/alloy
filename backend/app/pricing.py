"""
Pricing calculation and breakdown parsing functions.
"""
import re
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("alloy-dispatcher")


def _parse_addon_part(text: str) -> Dict[str, Any]:
    """
    Parse a single add-on fragment into {name, price}.

    Supports formats like:
        "Fridge ($40.00)"
        "Fridge - $40.00"
        "Fridge"
    """
    name = text.strip()
    price_val: Optional[float] = None

    # Pattern: "Name ($40.00)"
    m = re.match(
        r"^(?P<name>.+?)\s*\(\s*\$?(?P<price>[\d,]+(?:\.\d{1,2})?)\s*\)$",
        text.strip(),
    )
    if not m:
        # Pattern: "Name - $40.00"
        m = re.match(
            r"^(?P<name>.+?)\s*-\s*\$?(?P<price>[\d,]+(?:\.\d{1,2})?)$",
            text.strip(),
        )

    if m:
        name = m.group("name").strip()
        price_str = m.group("price")
        try:
            price_val = float(price_str.replace(",", ""))
        except Exception:
            price_val = None

    return {"name": name, "price": price_val}


def parse_simplified_price_breakdown(text: str) -> Dict[str, Any]:
    """
    Parse the simplified price_breakdown string into structured fields.

    Expected core format:
        Price Breakdown:
        Service: Standard Cleaning
        First cleaning: $240.00
        Recurring (Weekly): $144.00 / visit (40% off)

    May also contain add-ons in formats like:
        - "Add-ons: Fridge ($40.00), Oven ($25.00)"
        - "Add-ons: Fridge - $40.00, Oven - $25.00"
        - "Add-ons: Fridge, Oven"
        - "Add-on: Fridge - $40.00"
    """
    result: Dict[str, Any] = {
        "service": None,
        "first_clean_price": None,
        "recurring_price": None,
        "frequency_label": None,
        "discount_label": None,
        "addons": [],
    }

    if not text:
        return result

    # Normalize newlines and trim lines
    normalized_text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.strip() for line in normalized_text.split("\n")]
    # Drop completely empty lines for regex convenience
    non_empty_lines = [line for line in lines if line]
    normalized_block = "\n".join(non_empty_lines)

    # Service
    m = re.search(r"^Service:\s*(.+)$", normalized_block, re.MULTILINE | re.IGNORECASE)
    if m:
        result["service"] = m.group(1).strip()

    # First cleaning price
    m = re.search(
        r"^First cleaning:\s*\$([0-9][0-9,]*(?:\.[0-9]{2})?)\s*$",
        normalized_block,
        re.MULTILINE | re.IGNORECASE,
    )
    if m:
        try:
            result["first_clean_price"] = float(m.group(1).replace(",", ""))
        except Exception:
            pass

    # Recurring frequency, price, and optional discount label
    # We parse line-by-line to clearly separate:
    #   Recurring (Weekly): $144.00 / visit (40% off)
    # where:
    #   - "Weekly" is the frequency_label (from the first (...) after "Recurring")
    #   - 144.00 is recurring_price (first dollar amount after colon)
    #   - "40% off" is discount_label (any later (...) that includes "% off")
    for line in non_empty_lines:
        if not line.lower().startswith("recurring"):
            continue

        # 1) Frequency + price
        m_rec = re.search(
            r"^Recurring\s*\((?P<freq>[^)]+)\)\s*:\s*\$?\s*(?P<price>[0-9][0-9,]*(?:\.[0-9]{1,2})?)",
            line,
            re.IGNORECASE,
        )
        if not m_rec:
            continue

        freq = m_rec.group("freq").strip()
        price_str = m_rec.group("price")
        try:
            result["recurring_price"] = float(price_str.replace(",", ""))
        except Exception:
            result["recurring_price"] = None

        if freq:
            result["frequency_label"] = freq

        # 2) Optional discount anywhere later in the line, distinct from the (Weekly) group
        #    We look for any (...) that contains "% off".
        discount = None
        paren_contents = re.findall(r"\(([^)]+)\)", line)
        for content in paren_contents:
            if "% off" in content.lower():
                discount = content.strip()

        if discount:
            result["discount_label"] = discount

        # Only parse the first matching "Recurring" line
        break

    # Add-ons
    addons: List[Dict[str, Any]] = []
    for line in non_empty_lines:
        lower = line.lower()
        if lower.startswith("add-ons:") or lower.startswith("addons:"):
            # Combined add-ons line
            try:
                rest = line.split(":", 1)[1].strip()
            except Exception:
                continue
            if not rest:
                continue
            parts = [p.strip() for p in rest.split(",") if p.strip()]
            for part in parts:
                parsed = _parse_addon_part(part)
                if parsed["name"]:
                    addons.append(parsed)
        elif lower.startswith("add-on:") or lower.startswith("addon:"):
            # Individual add-on line
            try:
                rest = line.split(":", 1)[1].strip()
            except Exception:
                continue
            if not rest:
                continue
            parsed = _parse_addon_part(rest)
            if parsed["name"]:
                addons.append(parsed)

    # Deduplicate by (name, price) to avoid duplicates if multiple formats present
    seen_addons = set()
    deduped_addons: List[Dict[str, Any]] = []
    for addon in addons:
        key = (addon["name"], addon["price"])
        if key in seen_addons:
            continue
        seen_addons.add(key)
        deduped_addons.append(addon)

    result["addons"] = deduped_addons

    # Debug-style log to verify parser behavior in logs (truncated preview)
    try:
        preview = normalized_block.replace("\n", "\\n")
        if len(preview) > 200:
            preview = preview[:200] + "..."
        logger.info(
            "parse_simplified_price_breakdown: preview=%s parsed={service=%s, first_clean=%s, recurring=%s, freq=%s, discount=%s}",
            preview,
            result["service"],
            result["first_clean_price"],
            result["recurring_price"],
            result["frequency_label"],
            result["discount_label"],
        )
    except Exception:
        # Avoid breaking quote flow if logging fails for any reason
        pass

    return result


def calculate_pricing_from_form(
    service_type: str,
    approximate_square_footage: str,
    cleaning_frequency: str,
    extras_add_ons: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calculate pricing from form data.
    
    Args:
        service_type: Service type (e.g., "Standard Cleaning", "Move-Out / Heavy Clean")
        approximate_square_footage: Square footage option (e.g., "1501–2,000 sq ft")
        cleaning_frequency: Frequency option (e.g., "Weekly (40% Off)", "One-time")
        extras_add_ons: Optional comma-separated or JSON string of add-ons
    
    Returns:
        Dict with:
        - estimated_price: float (first clean price + add-ons)
        - price_breakdown: str (formatted breakdown text)
        - recurring_price: float | None (only for Standard Cleaning with Weekly/Bi-Weekly/Monthly)
    """
    # Base first clean prices by square footage
    BASE_FIRST_CLEAN_BY_SQFT = {
        "Under 1500 sq ft": 180,
        "1501–2,000 sq ft": 210,
        "2,001-2,600 sq ft": 240,
        "2,601-3,200 sq ft": 280,
        "3,201-4,000 sq ft": 320,
        "4,001-5,500 sq ft": 380,
        "Over 5,500 sq ft": 450,
    }
    
    # Recurring prices by frequency and square footage
    RECURRING_PRICES = {
        "Weekly (40% Off)": {
            "Under 1500 sq ft": 120,
            "1501–2,000 sq ft": 130,
            "2,001-2,600 sq ft": 145,
            "2,601-3,200 sq ft": 160,
            "3,201-4,000 sq ft": 170,
            "4,001-5,500 sq ft": 185,
            "Over 5,500 sq ft": 210,
        },
        "Bi-Weekly (30% Off)": {
            "Under 1500 sq ft": 140,
            "1501–2,000 sq ft": 150,
            "2,001-2,600 sq ft": 170,
            "2,601-3,200 sq ft": 185,
            "3,201-4,000 sq ft": 200,
            "4,001-5,500 sq ft": 215,
            "Over 5,500 sq ft": 245,
        },
        "Monthly (20% Off)": {
            "Under 1500 sq ft": 160,
            "1501–2,000 sq ft": 170,
            "2,001-2,600 sq ft": 190,
            "2,601-3,200 sq ft": 210,
            "3,201-4,000 sq ft": 225,
            "4,001-5,500 sq ft": 245,
            "Over 5,500 sq ft": 280,
        },
    }
    
    # Add-on prices
    ADDON_PRICES = {
        "Fridge": 40,
        "Oven": 40,
        "Cabinets": 35,
        "Windows & Blinds": 60,
        "Pet Hair": 30,
        "Baseboards": 30,
    }
    
    # Frequency config
    FREQUENCY_CONFIG = {
        "Weekly (40% Off)": {"label": "Weekly", "discount": "40% off"},
        "Bi-Weekly (30% Off)": {"label": "Bi-Weekly", "discount": "30% off"},
        "Monthly (20% Off)": {"label": "Monthly", "discount": "20% off"},
        "One-time": {"label": "One-time", "discount": None},
    }
    
    # Get base first clean price
    base_first_clean = BASE_FIRST_CLEAN_BY_SQFT.get(approximate_square_footage, 0)
    
    # Parse add-ons
    addons_list = []
    if extras_add_ons:
        try:
            parsed = json.loads(extras_add_ons)
            if isinstance(parsed, list):
                addons_list = [str(a).strip() for a in parsed if a]
            else:
                addons_list = [str(extras_add_ons).strip()]
        except Exception:
            # Comma-separated string
            addons_list = [a.strip() for a in extras_add_ons.split(",") if a.strip()]
    
    # Calculate add-ons total
    addons_total = 0
    addons_with_prices = []
    for addon_name in addons_list:
        addon_price = ADDON_PRICES.get(addon_name, 0)
        if addon_price > 0:
            addons_total += addon_price
            addons_with_prices.append(f"{addon_name} (${addon_price:.0f})")
        else:
            addons_with_prices.append(addon_name)
    
    # Calculate first clean total (estimated price)
    estimated_price = base_first_clean + addons_total
    
    # Calculate recurring price (only for Standard Cleaning with recurring frequency)
    recurring_price = None
    frequency_label = None
    discount_label = None
    
    is_standard_cleaning = service_type and "Standard" in service_type
    if is_standard_cleaning and cleaning_frequency in RECURRING_PRICES:
        freq_prices = RECURRING_PRICES.get(cleaning_frequency, {})
        base_recurring = freq_prices.get(approximate_square_footage)
        if base_recurring is not None:
            recurring_price = float(base_recurring)
            freq_config = FREQUENCY_CONFIG.get(cleaning_frequency, {})
            frequency_label = freq_config.get("label", cleaning_frequency)
            discount_label = freq_config.get("discount")
    
    # Build price breakdown text
    breakdown_lines = []
    breakdown_lines.append(f"Sq Ft: {approximate_square_footage}")
    breakdown_lines.append(f"Service: {service_type}")
    if frequency_label:
        breakdown_lines.append(f"Frequency: {frequency_label}")
    if estimated_price > 0:
        breakdown_lines.append(f"First cleaning: ${estimated_price:.2f}")
    if recurring_price is not None:
        discount_suffix = f" ({discount_label})" if discount_label else ""
        breakdown_lines.append(f"Recurring ({frequency_label}): ${recurring_price:.2f} / visit{discount_suffix}")
    if addons_with_prices:
        breakdown_lines.append(f"Add-ons: {', '.join(addons_with_prices)}")
    
    price_breakdown = " | ".join(breakdown_lines)
    
    return {
        "estimated_price": float(estimated_price),
        "price_breakdown": price_breakdown,
        "recurring_price": recurring_price,
    }


def build_contact_price_breakdown(contact: Dict[str, Any]) -> Optional[str]:
    """
    Build a pricing breakdown text block from contact.customFields.

    We look for custom field values that contain any of:
      - "First cleaning:"
      - "Recurring ("
      - "Service:"
      - "Add-ons:" / "Addons:"
      - "Add-on" / "Addon"
    and join them with newlines.
    """
    custom_fields_raw = contact.get("customFields", [])
    if not custom_fields_raw:
        return None

    tokens = [
        "first cleaning:",
        "recurring (",
        "service:",
        "add-ons:",
        "addons:",
        "add-on",
        "addon",
    ]

    blocks: List[str] = []
    seen: set[str] = set()

    def _maybe_add_block(value: Any) -> None:
        if not isinstance(value, str):
            return
        val = value.strip()
        if not val:
            return
        lower = val.lower()
        if any(token in lower for token in tokens):
            if val not in seen:
                seen.add(val)
                blocks.append(val)

    if isinstance(custom_fields_raw, list):
        for cf in custom_fields_raw:
            if isinstance(cf, dict):
                _maybe_add_block(cf.get("value"))
    elif isinstance(custom_fields_raw, dict):
        for _field_id, value in custom_fields_raw.items():
            _maybe_add_block(value)

    if not blocks:
        return None

    return "\n".join(blocks)


def extract_contact_pricing_from_custom_fields(contact: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract recurring_price and frequency_label from contact.customFields.

    Expects GHL contact.customFields in the array form:
        [{ "id": "recurring_price", "value": "144.00" }, ...]

    We match on the custom field id/key, not the human label:
        - ids containing "recurring_price" -> recurring price
        - ids containing "cleaning_frequency" or exactly "frequency" -> frequency label
    """
    custom_fields_raw = contact.get("customFields", [])
    recurring_price: Optional[float] = None
    frequency_label: Optional[str] = None

    if isinstance(custom_fields_raw, list):
        for cf in custom_fields_raw:
            if not isinstance(cf, dict):
                continue
            field_id = str(cf.get("id") or "")
            field_id_lower = field_id.lower()
            value = cf.get("value")

            # Recurring price field
            if "recurring_price" in field_id_lower and recurring_price is None:
                if isinstance(value, (int, float)):
                    recurring_price = float(value)
                elif isinstance(value, str):
                    m = re.search(
                        r"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
                        value.strip(),
                    )
                    if m:
                        try:
                            recurring_price = float(m.group(1).replace(",", ""))
                        except Exception:
                            pass

            # Cleaning frequency / frequency label field
            if (
                ("cleaning_frequency" in field_id_lower or field_id_lower == "frequency")
                and frequency_label is None
                and isinstance(value, str)
                and value.strip()
            ):
                frequency_label = value.strip()

    elif isinstance(custom_fields_raw, dict):
        # Legacy dict-style custom fields
        for field_id, value in custom_fields_raw.items():
            field_id_lower = str(field_id).lower()

            if "recurring_price" in field_id_lower and recurring_price is None:
                if isinstance(value, (int, float)):
                    recurring_price = float(value)
                elif isinstance(value, str):
                    m = re.search(
                        r"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
                        value.strip(),
                    )
                    if m:
                        try:
                            recurring_price = float(m.group(1).replace(",", ""))
                        except Exception:
                            pass

            if (
                ("cleaning_frequency" in field_id_lower or field_id_lower == "frequency")
                and frequency_label is None
                and isinstance(value, str)
                and value.strip()
            ):
                frequency_label = value.strip()

    return {
        "recurring_price": recurring_price,
        "frequency_label": frequency_label,
    }

