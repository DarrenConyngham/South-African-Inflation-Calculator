"""Unit tests for scripts/import_statssa_history.py, using fixed sample text (no PDF)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import import_statssa_history as importer  # noqa: E402


class ParseTableTests(unittest.TestCase):
    def test_full_row_drops_annual_average(self):
        text = "2025 100,3 101,2 101,6 101,9 102,1 102,4 103,3 103,2 103,4 103,5 103,4 103,6 102,5"
        values = importer.parse_table(text)
        self.assertEqual(len(values), 12)
        self.assertEqual(values["2025-01"], 100.3)
        self.assertEqual(values["2025-12"], 103.6)

    def test_partial_row_and_negative_rates(self):
        values = importer.parse_table("1922 -23,7 -23,0\n2026 103,8 104,2 104,8")
        self.assertEqual(values["1922-02"], -23.0)
        self.assertEqual(values["2026-03"], 104.8)
        self.assertNotIn("2026-04", values)

    def test_skips_rows_without_monthly_values_and_text(self):
        values = importer.parse_table("1911 \n5,2\nYear Jan Feb\n1 Primary urban areas up to 2008")
        self.assertEqual(values, {})


def whole_year(year, value):
    """Return {"YYYY-MM": value} for all twelve months of a year."""
    return {f"{year}-{mon:02d}": value for mon in range(1, 13)}


class RebuildHistoryTests(unittest.TestCase):
    def test_rebuilds_backwards_from_official_rates(self):
        index_table = whole_year(2024, 110.0)
        rates = {**whole_year(2024, 10.0), **whole_year(2023, 0.0)}
        series = importer.rebuild_history(index_table, rates, index_from="2024-01", break_year=1900)
        self.assertAlmostEqual(series["2023-06"], 100.0)
        self.assertAlmostEqual(series["2022-01"], 100.0)
        self.assertNotIn("2021-12", series)  # no rate for 2022-12

    def test_uses_index_change_across_break_year(self):
        index_table = {**whole_year(2008, 40.0), **whole_year(2009, 44.0), **whole_year(2010, 50.0)}
        rates = {**whole_year(2010, 5.0), **whole_year(2009, 99.0)}  # 2009 rates must be ignored
        series = importer.rebuild_history(index_table, rates, index_from="2010-01", break_year=2009)
        self.assertAlmostEqual(series["2009-03"], 50.0 / 1.05)
        self.assertAlmostEqual(series["2008-03"], series["2009-03"] * 40.0 / 44.0)


if __name__ == "__main__":
    unittest.main()
