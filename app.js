/**
 * South African inflation calculator.
 *
 * Loads the monthly CPI index from data/cpi.json and adjusts an amount with:
 *   endAmount = startAmount × CPI[endMonth] / CPI[startMonth]
 */

const DATA_URL = "data/cpi.json";

const currency = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const percent = new Intl.NumberFormat("en-ZA", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const monthName = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });

const amountInput = document.getElementById("amount");
const startInput = document.getElementById("start-month");
const endInput = document.getElementById("end-month");
const resultSection = document.getElementById("result");
const dataInfo = document.getElementById("data-info");

/** Format "YYYY-MM" as e.g. "September 2026". */
function formatMonth(month) {
  return monthName.format(new Date(`${month}-01T00:00:00Z`));
}

/** Number of months from startMonth to endMonth ("YYYY-MM" strings); negative if end is earlier. */
function monthsBetween(startMonth, endMonth) {
  const [startYear, startMon] = startMonth.split("-").map(Number);
  const [endYear, endMon] = endMonth.split("-").map(Number);
  return (endYear - startYear) * 12 + (endMon - startMon);
}

/** Adjust an amount for inflation. Returns null if either month has no CPI value. */
function calculate(series, amount, startMonth, endMonth) {
  const startCpi = series[startMonth];
  const endCpi = series[endMonth];
  if (startCpi === undefined || endCpi === undefined) return null;

  const ratio = endCpi / startCpi;
  const months = monthsBetween(startMonth, endMonth);
  // Average annual rate over the period, compounded. Meaningless for zero months.
  const annualRate = months === 0 ? null : Math.pow(ratio, 12 / months) - 1;

  return { endAmount: amount * ratio, totalChange: ratio - 1, annualRate };
}

function showMessage(text) {
  resultSection.innerHTML = `<p class="message">${text}</p>`;
}

function showResult(amount, startMonth, endMonth, result) {
  const annualText = result.annualRate === null
    ? ""
    : `<li>Average annual inflation: <strong>${percent.format(result.annualRate)}</strong></li>`;

  resultSection.innerHTML = `
    <p class="summary">
      ${currency.format(amount)} in ${formatMonth(startMonth)} is worth
    </p>
    <p class="end-amount">${currency.format(result.endAmount)}</p>
    <p class="summary">in ${formatMonth(endMonth)}</p>
    <ul class="details">
      <li>Total change in prices: <strong>${percent.format(result.totalChange)}</strong></li>
      ${annualText}
    </ul>`;
}

/** Read the form, validate it and show the result. */
function update(data) {
  const amount = Number(amountInput.value);
  const startMonth = startInput.value;
  const endMonth = endInput.value;
  const range = `${formatMonth(data.first_month)} to ${formatMonth(data.last_month)}`;

  if (amountInput.value === "" || !(amount >= 0)) {
    showMessage("Enter an amount of zero or more.");
    return;
  }
  if (!startMonth || !endMonth) {
    showMessage("Choose a start month and an end month.");
    return;
  }

  const result = calculate(data.series, amount, startMonth, endMonth);
  if (result === null) {
    showMessage(`CPI data is available from ${range}. Choose months in that range.`);
    return;
  }
  showResult(amount, startMonth, endMonth, result);
}

/** Set input limits and defaults from the data range. */
function setUpForm(data) {
  for (const input of [startInput, endInput]) {
    input.min = data.first_month;
    input.max = data.last_month;
  }
  startInput.value = `${Number(data.last_month.slice(0, 4)) - 10}${data.last_month.slice(4)}`;
  endInput.value = data.last_month;

  dataInfo.innerHTML = `
    Data up to <strong>${formatMonth(data.last_month)}</strong>.
    Source: <a href="https://www.statssa.gov.za/?page_id=1854&PPN=P0141">Stats SA</a>
    headline CPI (all urban areas), with recent months via the
    <a href="https://www.resbank.co.za/">SARB</a>.`;

  document.getElementById("calculator").addEventListener("input", () => update(data));
  update(data);
}

fetch(DATA_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(setUpForm)
  .catch(() => showMessage("Sorry, the CPI data could not be loaded. Please try again later."));
