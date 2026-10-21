"""Build data/cpi.json from Stats SA's CPI history PDF (one-off import).

Stats SA blocks automated downloads, so the history comes from the CPI
history PDF (P0141, "CPIHistory.pdf"), downloaded by hand into data/source/.
It contains two tables:

* Table B1: headline CPI index (Dec 2024 = 100), monthly from 1980, rounded
  to one decimal. Rounding makes old values crude (1980 is "2,8").
* Table B2: official headline year-on-year rates, monthly from 1922.

The index is used from INDEX_FROM onwards, where one decimal is precise.
Earlier months are rebuilt backwards from the official year-on-year rates:

    index[month] = index[same month a year later] / (1 + rate[a year later] / 100)

so the series reproduces the official Stats SA inflation rates.

One exception: Stats SA changed how CPI is compiled in January 2009, and the
official 2009 rates are not consistent with its own linked index (Table B1),
which Stats SA links "so as to provide a continuous index". So the step from
2008 to 2009 uses the Table B1 change for each month instead of the official
rate.

After the import, scripts/update_cpi.py keeps the latest months current from SARB.

Requires pypdf (pip install pypdf). The daily update does not need it.

Usage: python3 scripts/import_statssa_history.py [path/to/CPIHistory.pdf]
"""

import re
import sys
from pathlib import Path

from update_cpi import DATA_FILE, chain_link, fetch_sarb_cpi, save, validate

DEFAULT_PDF = DATA_FILE.parent / "source" / "CPIHistory.pdf"

# First month taken directly from the Table B1 index (values near 100, so
# one-decimal rounding is under 0.05%). Earlier months use Table B2 rates.
INDEX_FROM = "2024-01"

# Year of the CPI methodology change; the step into it uses Table B1.
BREAK_YEAR = 2009

YEAR_ROW = re.compile(r"^(\d{4})\s+(.*)$")
NUMBER = re.compile(r"-?\d+,\d+")


def parse_table(text):
    """Parse rows like "2025 100,3 101,2 ... 103,6 102,5" into {"YYYY-MM": value}.

    A full row has 12 monthly values plus an annual average, which is dropped.
    A shorter row is the current, partial year and has no average. Rows with
    no monthly values (1911-1921 in Table B2 have only an average) are skipped.
    """
    values = {}
    for line in text.splitlines():
        match = YEAR_ROW.match(line.strip())
        if not match:
            continue
        numbers = [float(n.replace(",", ".")) for n in NUMBER.findall(match.group(2))]
        monthly = numbers[:12] if len(numbers) == 13 else numbers
        for month_number, value in enumerate(monthly, start=1):
            values[f"{match.group(1)}-{month_number:02d}"] = value
    return values


def read_pdf_tables(pdf_path):
    """Return (index_table, yoy_rates) from the CPI history PDF."""
    from pypdf import PdfReader  # imported here so the tests do not need pypdf

    text = "\n".join(page.extract_text() for page in PdfReader(pdf_path).pages)
    index_text, rates_text = text.split("Table B2", 1)
    return parse_table(index_text), parse_table(rates_text)


def previous_month(month):
    """Return the month before "YYYY-MM"."""
    year, mon = int(month[:4]), int(month[5:])
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def year_later(month):
    """Return the same month one year later."""
    return f"{int(month[:4]) + 1}{month[4:]}"


def rebuild_history(index_table, yoy_rates, index_from=INDEX_FROM, break_year=BREAK_YEAR):
    """Combine the precise recent index with history rebuilt from official rates."""
    series = {month: value for month, value in index_table.items() if month >= index_from}

    # Step back one month at a time; the month a year later is always known.
    month = previous_month(min(series))
    while year_later(month) in yoy_rates:
        later = year_later(month)
        if later.startswith(str(break_year)):
            change = index_table[later] / index_table[month]
        else:
            change = 1 + yoy_rates[later] / 100
        series[month] = series[later] / change
        month = previous_month(month)
    return series


def main():
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    index_table, yoy_rates = read_pdf_tables(pdf_path)
    series = chain_link(rebuild_history(index_table, yoy_rates), fetch_sarb_cpi())
    validate(series)
    save(series)
    print(f"Saved {len(series)} months ({min(series)} to {max(series)}).")


if __name__ == "__main__":
    main()
