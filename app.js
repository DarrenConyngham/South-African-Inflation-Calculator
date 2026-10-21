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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const amountInput = document.getElementById("amount");
const startPicker = {
  month: document.getElementById("start-month"),
  year: document.getElementById("start-year"),
};
const endPicker = {
  month: document.getElementById("end-month"),
  year: document.getElementById("end-year"),
};
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
    </ul>
    <figure class="chart">
      <figcaption>Value of ${currency.format(amount)} from ${formatMonth(startMonth)} over time</figcaption>
      <div class="chart-area"></div>
    </figure>`;
}

/* ---------- Time series chart ---------- */

const CHART_HEIGHT = 220;
const CHART_MARGIN = { top: 12, right: 12, bottom: 28 };
const Y_TICK_COUNT = 4;
const X_TICK_COUNT = 4;
const wholeRand = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const shortMonthName = new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric", timeZone: "UTC" });

/** Format "YYYY-MM" as e.g. "Sep 2026". */
function formatShortMonth(month) {
  return shortMonthName.format(new Date(`${month}-01T00:00:00Z`));
}

/** Return the "YYYY-MM" month that is `count` months after `month`. */
function addMonths(month, count) {
  const [year, mon] = month.split("-").map(Number);
  const totalMonths = year * 12 + (mon - 1) + count;
  return `${Math.floor(totalMonths / 12)}-${String((totalMonths % 12) + 1).padStart(2, "0")}`;
}

/**
 * The inflation-adjusted value of `amount` (as at startMonth) for every month
 * between the two chosen months, in date order.
 */
function buildChartPoints(series, amount, startMonth, endMonth) {
  const months = monthsBetween(startMonth, endMonth);
  const firstMonth = months >= 0 ? startMonth : endMonth;
  const points = [];
  for (let offset = 0; offset <= Math.abs(months); offset++) {
    const month = addMonths(firstMonth, offset);
    points.push({ month, value: (amount * series[month]) / series[startMonth] });
  }
  return points;
}

/** Round, evenly spaced axis values (steps of 1, 2 or 5 × 10ⁿ) covering min to max. */
function niceTicks(min, max) {
  const rawStep = (max - min) / Y_TICK_COUNT || max || 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((multiple) => multiple * magnitude).find((s) => s >= rawStep);
  const low = Math.floor(min / step) * step;
  const high = Math.max(Math.ceil(max / step) * step, low + step);
  const ticks = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(value);
  return ticks;
}

/** Positions and scales for a chart of the given points, sized to `width` pixels. */
function chartLayout(points, width) {
  const values = points.map((point) => point.value);
  const yTicks = niceTicks(Math.min(...values), Math.max(...values));
  // Show cents on the axis only when the ticks are less than R1 apart.
  const yLabelFormat = yTicks[1] - yTicks[0] < 1 ? currency : wholeRand;
  const longestLabel = Math.max(...yTicks.map((tick) => yLabelFormat.format(tick).length));
  const left = longestLabel * 7 + 12;
  const plotWidth = width - left - CHART_MARGIN.right;
  const plotBottom = CHART_HEIGHT - CHART_MARGIN.bottom;
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];

  return {
    width,
    left,
    plotWidth,
    plotBottom,
    yTicks,
    yLabelFormat,
    x: (index) => left + (index / (points.length - 1)) * plotWidth,
    y: (value) => plotBottom - ((value - yMin) / (yMax - yMin)) * (plotBottom - CHART_MARGIN.top),
  };
}

/** Indexes of the points to label on the x-axis, evenly spread from first to last. */
function xTickIndexes(pointCount) {
  const tickCount = Math.min(X_TICK_COUNT, pointCount);
  const indexes = [];
  for (let tick = 0; tick < tickCount; tick++) {
    indexes.push(Math.round((tick / (tickCount - 1)) * (pointCount - 1)));
  }
  return indexes;
}

/** SVG markup for the gridlines, axis labels and the line itself. */
function chartSvg(points, layout) {
  const { width, left, plotBottom, yTicks, yLabelFormat, x, y } = layout;

  const yAxis = yTicks.map((tick) => `
    <line class="grid" x1="${left}" x2="${width - CHART_MARGIN.right}" y1="${y(tick)}" y2="${y(tick)}"/>
    <text class="axis-label" x="${left - 8}" y="${y(tick)}" text-anchor="end" dominant-baseline="middle">${yLabelFormat.format(tick)}</text>`);

  const xTicks = xTickIndexes(points.length);
  const xAxis = xTicks.map((index, tickNumber) => {
    // Keep the first and last labels inside the chart.
    const anchor = tickNumber === 0 ? "start" : tickNumber === xTicks.length - 1 ? "end" : "middle";
    return `<text class="axis-label" x="${x(index)}" y="${plotBottom + 18}" text-anchor="${anchor}">${formatShortMonth(points[index].month)}</text>`;
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join("");

  return `
    <svg width="${width}" height="${CHART_HEIGHT}" viewBox="0 0 ${width} ${CHART_HEIGHT}" role="img"
         aria-label="Line chart of the value from ${formatMonth(points[0].month)} to ${formatMonth(points[points.length - 1].month)}">
      ${yAxis.join("")}
      ${xAxis.join("")}
      <path class="line" d="${linePath}"/>
      <g class="hover-marker" visibility="hidden">
        <line class="crosshair" y1="${CHART_MARGIN.top}" y2="${plotBottom}"/>
        <circle class="hover-dot" r="4"/>
      </g>
    </svg>
    <div class="chart-tooltip" hidden></div>`;
}

/** Show a crosshair and tooltip for the month nearest the pointer. */
function attachChartHover(chartArea, points, layout) {
  const svg = chartArea.querySelector("svg");
  const marker = svg.querySelector(".hover-marker");
  const crosshair = marker.querySelector(".crosshair");
  const dot = marker.querySelector(".hover-dot");
  const tooltip = chartArea.querySelector(".chart-tooltip");

  svg.addEventListener("pointermove", (event) => {
    const pointerX = event.clientX - svg.getBoundingClientRect().left;
    const fraction = (pointerX - layout.left) / layout.plotWidth;
    const index = Math.min(points.length - 1, Math.max(0, Math.round(fraction * (points.length - 1))));
    const point = points[index];
    const pointX = layout.x(index);
    const pointY = layout.y(point.value);

    crosshair.setAttribute("x1", pointX);
    crosshair.setAttribute("x2", pointX);
    dot.setAttribute("cx", pointX);
    dot.setAttribute("cy", pointY);
    marker.setAttribute("visibility", "visible");

    tooltip.innerHTML = `${formatMonth(point.month)}<strong>${currency.format(point.value)}</strong>`;
    tooltip.hidden = false;
    // Place the tooltip beside the point, on whichever side has more room.
    const onRightHalf = pointX > layout.width / 2;
    tooltip.style.left = `${pointX}px`;
    tooltip.style.top = `${pointY}px`;
    tooltip.style.transform = onRightHalf ? "translate(calc(-100% - 12px), -50%)" : "translate(12px, -50%)";
  });

  svg.addEventListener("pointerleave", () => {
    marker.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  });
}

/** Draw the chart of value over time into the result section. */
function drawChart(series, amount, startMonth, endMonth) {
  const chart = resultSection.querySelector(".chart");
  const points = buildChartPoints(series, amount, startMonth, endMonth);
  if (points.length < 2) {
    chart.remove(); // Nothing to plot when both months are the same.
    return;
  }

  const chartArea = chart.querySelector(".chart-area");
  const layout = chartLayout(points, chartArea.clientWidth);
  chartArea.innerHTML = chartSvg(points, layout);
  attachChartHover(chartArea, points, layout);
}

/** Read the form, validate it and show the result. */
function update(data) {
  const amount = Number(amountInput.value);
  const startMonth = getPickedMonth(startPicker);
  const endMonth = getPickedMonth(endPicker);
  const range = `${formatMonth(data.first_month)} to ${formatMonth(data.last_month)}`;

  if (amountInput.value === "" || !(amount >= 0)) {
    showMessage("Enter an amount of zero or more.");
    return;
  }

  const result = calculate(data.series, amount, startMonth, endMonth);
  if (result === null) {
    showMessage(`CPI data is available from ${range}. Choose months in that range.`);
    return;
  }
  showResult(amount, startMonth, endMonth, result);
  drawChart(data.series, amount, startMonth, endMonth);
}

/** Return the picker's selection as "YYYY-MM". */
function getPickedMonth(picker) {
  return `${picker.year.value}-${picker.month.value}`;
}

/** Select a "YYYY-MM" month in a picker. */
function setPickedMonth(picker, month) {
  picker.year.value = month.slice(0, 4);
  picker.month.value = month.slice(5);
}

/** Fill a picker's dropdowns: all twelve months, and years newest first. */
function fillPicker(picker, firstYear, lastYear) {
  MONTH_NAMES.forEach((name, index) => {
    picker.month.add(new Option(name, String(index + 1).padStart(2, "0")));
  });
  for (let year = lastYear; year >= firstYear; year--) {
    picker.year.add(new Option(year, year));
  }
}

/**
 * Disable months with no CPI data in the chosen year (e.g. months after the
 * latest release). If the selected month becomes unavailable, move the
 * selection to the latest available month.
 */
function disableMissingMonths(picker, series) {
  for (const option of picker.month.options) {
    option.disabled = series[`${picker.year.value}-${option.value}`] === undefined;
  }
  const available = [...picker.month.options].filter((option) => !option.disabled);
  if (picker.month.selectedOptions[0].disabled && available.length > 0) {
    picker.month.value = available[available.length - 1].value;
  }
}

/** Fill the dropdowns and set defaults from the data range. */
function setUpForm(data) {
  const firstYear = Number(data.first_month.slice(0, 4));
  const lastYear = Number(data.last_month.slice(0, 4));
  const pickers = [startPicker, endPicker];

  for (const picker of pickers) fillPicker(picker, firstYear, lastYear);
  setPickedMonth(startPicker, `${lastYear - 10}${data.last_month.slice(4)}`);
  setPickedMonth(endPicker, data.last_month);
  for (const picker of pickers) disableMissingMonths(picker, data.series);

  dataInfo.innerHTML = `
    Data up to <strong>${formatMonth(data.last_month)}</strong>.
    Source: <a href="https://www.statssa.gov.za/?page_id=1854&PPN=P0141">Stats SA</a>
    headline CPI (all urban areas), with recent months via the
    <a href="https://www.resbank.co.za/">SARB</a>.`;

  document.getElementById("calculator").addEventListener("input", () => {
    for (const picker of pickers) disableMissingMonths(picker, data.series);
    update(data);
  });
  // The chart is drawn to fit its container, so redraw when the window resizes.
  window.addEventListener("resize", () => update(data));
  update(data);
}

fetch(DATA_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(setUpForm)
  .catch(() => showMessage("Sorry, the CPI data could not be loaded. Please try again later."));
