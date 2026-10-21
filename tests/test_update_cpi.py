"""Unit tests for scripts/update_cpi.py, using fixed sample data (no network)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import update_cpi  # noqa: E402


class ParseTests(unittest.TestCase):
    def test_parse_sarb(self):
        text = '[{"Period":"2026-09-30T00:00:00","Value":108.1},{"Period":"2026-08-31T00:00:00","Value":107.9}]'
        self.assertEqual(update_cpi.parse_sarb(text), {"2026-09": 108.1, "2026-08": 107.9})

    def test_parse_oecd_skips_blank_values(self):
        text = "REF_AREA,TIME_PERIOD,OBS_VALUE\nZAF,2025-01,157.68\nZAF,2025-02,\n"
        self.assertEqual(update_cpi.parse_oecd(text), {"2025-01": 157.68})


class ChainLinkTests(unittest.TestCase):
    def test_rescales_newer_series_from_earliest_shared_month(self):
        base = {"2024-01": 50.0, "2024-02": 100.0, "2024-03": 101.0}
        newer = {"2024-02": 10.0, "2024-03": 10.2, "2024-04": 10.5}
        linked = update_cpi.chain_link(base, newer)
        self.assertEqual(linked["2024-01"], 50.0)
        self.assertAlmostEqual(linked["2024-02"], 100.0)
        self.assertAlmostEqual(linked["2024-03"], 102.0)  # newer values win
        self.assertAlmostEqual(linked["2024-04"], 105.0)

    def test_no_overlap_raises(self):
        with self.assertRaises(ValueError):
            update_cpi.chain_link({"2024-01": 1.0}, {"2024-02": 1.0})


class ValidateTests(unittest.TestCase):
    def test_valid_series_passes(self):
        update_cpi.validate({"2024-11": 100.0, "2024-12": 100.5, "2025-01": 101.0})

    def test_gap_raises(self):
        with self.assertRaises(ValueError):
            update_cpi.validate({"2024-11": 100.0, "2025-01": 101.0})

    def test_large_jump_raises(self):
        with self.assertRaises(ValueError):
            update_cpi.validate({"2024-11": 100.0, "2024-12": 150.0})

    def test_non_positive_raises(self):
        with self.assertRaises(ValueError):
            update_cpi.validate({"2024-12": 0.0})


class BuildSeriesTests(unittest.TestCase):
    def test_seeds_from_oecd_when_no_history(self):
        series = update_cpi.build_series(
            {},
            fetch_oecd=lambda: {"2024-01": 100.0, "2024-02": 101.0},
            fetch_sarb=lambda: {"2024-02": 50.5, "2024-03": 51.0},
        )
        self.assertAlmostEqual(series["2024-03"], 102.0)

    def test_keeps_history_and_ignores_oecd_when_history_exists(self):
        def fail():
            raise AssertionError("OECD should not be fetched")

        series = update_cpi.build_series(
            {"2023-12": 99.0, "2024-01": 100.0},
            fetch_oecd=fail,
            fetch_sarb=lambda: {"2024-01": 10.0, "2024-02": 10.1},
        )
        self.assertEqual(series["2023-12"], 99.0)
        self.assertAlmostEqual(series["2024-02"], 101.0)


if __name__ == "__main__":
    unittest.main()
