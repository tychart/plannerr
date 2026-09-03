"""Shared app-wide constants."""

from datetime import time as dt_time

DEFAULT_CLASS_NAME = "Default"
DEFAULT_CLASS_COLOR = "#6366f1"  # indigo-500

# Time-less ("date-only") items are stored at 23:59:59 in the user's local
# zone — the app-wide sentinel meaning "no specific time". The web client
# checks this exact sentinel (`isDateOnly`) and renders it as "End of day";
# keep every server-side consumer in sync with it.
DATE_ONLY_TIME = dt_time(23, 59, 59)
