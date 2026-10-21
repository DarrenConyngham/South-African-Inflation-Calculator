"""Update data/cpi.json with South African headline CPI (Stats SA).

Stats SA's own website blocks automated downloads, so the latest months come
from the SARB web API, which republishes the Stats SA headline index (latest
25 months, free, no key). The history before that was imported once from Stats
SA's CPI history PDF by scripts/import_statssa_history.py.

The SARB series is chain-linked onto the stored history at the earliest month
that both series share, so the official SARB figures cover as many months as
possible. Only index ratios matter for inflation, so a future change of base
year does not matter. Months already stored are kept, so the history keeps
growing even though SARB only returns 25 months.

Usage: python3 scripts/update_cpi.py
"""

import json
import urllib.request
from datetime import date
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "cpi.json"

SARB_URL = (
    "https://custom.resbank.co.za/SarbWebApi/WebIndicators/Shared/"
    "GetTimeseriesObservations/CPI1000A"
)

# Sanity limit: a month-on-month move larger than this suggests bad data.
MAX_MONTHLY_CHANGE = 0.10


def fetch_text(url):
    """Download a URL and return its body as text."""
    request = urllib.request.Request(url, headers={"User-Agent": "sa-inflation-calculator"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def parse_sarb(json_text):
    """Turn the SARB JSON response into {"YYYY-MM": index}."""
    observations = json.loads(json_text)
    # "Period" looks like "2026-09-30T00:00:00"; the first 7 characters are the month.
    return {obs["Period"][:7]: float(obs["Value"]) for obs in observations}


def fetch_sarb_cpi():
    return parse_sarb(fetch_text(SARB_URL))


def chain_link(base_series, newer_series):
    """Rescale newer_series to base_series and use it from their earliest shared month.

    Months before the link month come from base_series; the link month and
    everything after come from the rescaled newer_series.
    """
    shared_months = set(base_series) & set(newer_series)
    if not shared_months:
        raise ValueError("Series do not overlap, so they cannot be chain-linked.")

    link_month = min(shared_months)
    scale = base_series[link_month] / newer_series[link_month]

    linked = {month: value for month, value in base_series.items() if month < link_month}
    for month, value in newer_series.items():
        if month >= link_month:
            linked[month] = value * scale
    return linked


def next_month(month):
    """Return the month after "YYYY-MM"."""
    year, mon = int(month[:4]), int(month[5:])
    return f"{year + 1}-01" if mon == 12 else f"{year}-{mon + 1:02d}"


def validate(series):
    """Raise ValueError if the series has gaps, non-positive values or wild jumps."""
    months = sorted(series)
    if not months:
        raise ValueError("Series is empty.")

    for previous, current in zip(months, months[1:]):
        if current != next_month(previous):
            raise ValueError(f"Gap in series between {previous} and {current}.")
        change = series[current] / series[previous] - 1
        if abs(change) > MAX_MONTHLY_CHANGE:
            raise ValueError(f"Implausible change of {change:.1%} in {current}.")

    for month, value in series.items():
        if value <= 0:
            raise ValueError(f"Non-positive index value in {month}.")


def load_existing():
    """Return the stored series."""
    if not DATA_FILE.exists():
        raise SystemExit(
            f"{DATA_FILE} not found. Build it first with scripts/import_statssa_history.py."
        )
    return json.loads(DATA_FILE.read_text())["series"]


def save(series):
    """Write the series to data/cpi.json, sorted by month."""
    months = sorted(series)
    payload = {
        "description": "South African headline CPI index (all urban areas), chain-linked",
        "source": "Stats SA: CPI history PDF (history) and the SARB web API (latest months)",
        "updated": date.today().isoformat(),
        "first_month": months[0],
        "last_month": months[-1],
        "series": {month: round(series[month], 4) for month in months},
    }
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(payload, indent=1) + "\n")


def build_series(existing, fetch_sarb=fetch_sarb_cpi):
    """Extend the stored series with the latest SARB data."""
    return chain_link(existing, fetch_sarb())


def main():
    existing = load_existing()
    series = build_series(existing)
    validate(series)

    if series.keys() == existing.keys() and all(
        round(series[m], 4) == existing[m] for m in series
    ):
        print("No new CPI data.")
        return

    save(series)
    print(f"Saved {len(series)} months ({min(series)} to {max(series)}).")


if __name__ == "__main__":
    main()
