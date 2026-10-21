# South African Inflation Calculator

A static web page that adjusts a rand amount for inflation between two months, using official Stats SA headline CPI (all urban areas).

**Live site:** https://darrenconyngham.github.io/South-African-Inflation-Calculator/

```
end amount = start amount × CPI[end month] / CPI[start month]
```

## Data

All figures are Stats SA's headline CPI (all urban areas), on Stats SA's base of December 2024 = 100. Stats SA blocks automated downloads from its website, so the data comes from two places:

| Source | Used for | Notes |
|---|---|---|
| Stats SA CPI history PDF (`data/source/CPIHistory.pdf`, from the [P0141 page](https://www.statssa.gov.za/?page_id=1854&PPN=P0141)) | History from Jan 1921 | Downloaded by hand and imported once with `scripts/import_statssa_history.py`. |
| [SARB web API](https://custom.resbank.co.za/SarbWebApi/WebIndicators/Shared/GetTimeseriesObservations/CPI1000A) (`CPI1000A`) | Latest 25 months | Republishes the Stats SA headline index. Free, no key, updated soon after each release. |

**How the history is built.** The PDF has the index (Table B1, from 1980, one decimal) and the official year-on-year rates (Table B2, from 1922). One decimal is too coarse for old years (1980 is "2,8"). So the index is used from Jan 2024, and earlier months are rebuilt backwards from the official rates:

```
index[month] = index[same month a year later] / (1 + official rate a year later)
```

The one exception is the January 2009 change in how Stats SA compiles CPI, where the official rates disagree with Stats SA's own linked index. The step from 2008 to 2009 uses the linked index (Table B1) instead.

**Accuracy.** Every official monthly inflation rate from 1922 onwards is reproduced to its published one decimal place, except the twelve months of 2009. Index levels agree with Table B1 to within 0.24 index points. Stats SA notes that its rates and its rebased index can differ slightly because of rounding.

`scripts/update_cpi.py` chain-links the SARB series onto the stored history at their earliest shared month. Months already in `data/cpi.json` are kept, so the history keeps growing.

To rebuild the history (for example from a newer PDF):

```sh
pip install pypdf
python3 scripts/import_statssa_history.py data/source/CPIHistory.pdf
```

## Automatic updates

`.github/workflows/update-cpi.yml` runs daily (and on demand from the Actions tab). It runs the tests and the update script, and commits `data/cpi.json` only when the data has changed. GitHub Pages then redeploys the site.

## Setup on GitHub

1. Create a GitHub repository and push this project to the `main` branch.
2. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Go to **Settings → Actions → General → Workflow permissions** and allow *Read and write permissions*.
4. Optionally run **Actions → Update CPI data → Run workflow** once to check that it works.

## Running locally

```sh
python3 scripts/update_cpi.py          # refresh data/cpi.json
python3 -m unittest discover -s tests  # run tests
python3 -m http.server                 # then open http://localhost:8000
```

Opening `index.html` directly from the file system does not work, because browsers block `fetch` of local files. Use the local server.
