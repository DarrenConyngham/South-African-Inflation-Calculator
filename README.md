# South African Inflation Calculator

A static web page that adjusts a rand amount for inflation between two months, using official Stats SA headline CPI (all urban areas).

```
end amount = start amount × CPI[end month] / CPI[start month]
```

## Data

Stats SA blocks automated downloads from its website, so the data comes from two free sources that republish the Stats SA series. Neither needs an API key.

| Source | Used for | Notes |
|---|---|---|
| [OECD SDMX API](https://data-explorer.oecd.org/) | History from Jan 1960 | Only used to build the first version of `data/cpi.json`. Published with a lag. |
| [SARB web API](https://custom.resbank.co.za/SarbWebApi/WebIndicators/Shared/GetTimeseriesObservations/CPI1000A) (`CPI1000A`) | Latest 25 months | Stats SA headline index, updated soon after each release. |

`scripts/update_cpi.py` chain-links the SARB series onto the stored history at their earliest shared month. Only index ratios matter, so the different base years cancel out. Months already in `data/cpi.json` are kept, so the history keeps growing.

**Accuracy:** for periods within the SARB window, results match Stats SA. The OECD history is a rescaled copy of Stats SA's one-decimal index. Year-on-year rates computed from it can therefore differ from the published rates by about 0.1 percentage points.

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
