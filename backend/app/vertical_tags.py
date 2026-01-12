"""
Vertical tag mapping - single source of truth for vertical -> tags.
"""
from typing import List, Dict

# Mapping from vertical key to list of tags
VERTICAL_TAGS: Dict[str, List[str]] = {
    "cleaning": ["lead", "cleaning"],
    "gutter": ["lead", "gutter"],
    # Add more verticals here as needed
    # "plumbing": ["lead", "plumbing"],
    # "hvac": ["lead", "hvac"],
}

def get_tags_for_vertical(vertical_key: str) -> List[str]:
    """
    Get tags for a given vertical key.
    
    Args:
        vertical_key: Vertical identifier (e.g., "cleaning", "gutter")
    
    Returns:
        List of tags for the vertical (defaults to ["lead", "cleaning"] if vertical not found)
    """
    return VERTICAL_TAGS.get(vertical_key, ["lead", "cleaning"])

def get_all_verticals() -> List[str]:
    """
    Get list of all supported vertical keys.
    
    Returns:
        List of vertical keys
    """
    return list(VERTICAL_TAGS.keys())

