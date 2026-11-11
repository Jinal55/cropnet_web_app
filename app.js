const form = document.querySelector("#scenario-form");
const toast = document.querySelector("#toast");
const storageKey = "cropnet-saved-scenarios-v1";
const maxSavedScenarios = 25;
const parameterInputs = {
  ndvi: document.querySelector("#ndvi"),
  temperature: document.querySelector("#temp"),
  maxTemperature: document.querySelector("#temp-max"),
  minTemperature: document.querySelector("#temp-min"),
  precipitation: document.querySelector("#rain"),
  humidity: document.querySelector("#humidity"),
  wind: document.querySelector("#wind"),
  solar: document.querySelector("#solar"),
  soilTemperature: document.querySelector("#soil-temp"),
  soilMoisture: document.querySelector("#soil-moisture")
};
const presets = {
  balanced: { ndvi: 0.76, precipitation: 5, temperature: 0.5, maxTemperature: 1, minTemperature: 0.2, humidity: 2, wind: 0, solar: 4, soilTemperature: 0.5, soilMoisture: 5 },
  dryWarm: { ndvi: 0.48, precipitation: -42, temperature: 2.8, maxTemperature: 4.5, minTemperature: 1.7, humidity: -12, wind: 20, solar: 12, soilTemperature: 2.5, soilMoisture: -28 },
  highStress: { ndvi: 0.18, precipitation: -75, temperature: 6, maxTemperature: 9, minTemperature: -4, humidity: -35, wind: 120, solar: -50, soilTemperature: 6, soilMoisture: -55 }
};
let toastTimer;
let currentScenario;
let savedScenarios = loadScenarios();
const comparedIds = new Set();

function formatSigned(value, digits = 0, unit = "") {
  const number = Number(value);
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${Math.abs(number).toFixed(digits)}${unit}`;
}

function updateRangeLabels() {
  document.querySelector("#ndvi-value").textContent = Number(parameterInputs.ndvi.value).toFixed(2);
  document.querySelector("#temp-value").textContent = formatSigned(parameterInputs.temperature.value, 1, "°C");
  document.querySelector("#temp-max-value").textContent = formatSigned(parameterInputs.maxTemperature.value, 1, "°C");
  document.querySelector("#temp-min-value").textContent = formatSigned(parameterInputs.minTemperature.value, 1, "°C");
  document.querySelector("#rain-value").textContent = `${formatSigned(parameterInputs.precipitation.value)}%`;
  document.querySelector("#humidity-value").textContent = `${formatSigned(parameterInputs.humidity.value)} pp`;
  document.querySelector("#wind-value").textContent = `${formatSigned(parameterInputs.wind.value)}%`;
  document.querySelector("#solar-value").textContent = `${formatSigned(parameterInputs.solar.value)}%`;
  document.querySelector("#soil-temp-value").textContent = formatSigned(parameterInputs.soilTemperature.value, 1, "°C");
  document.querySelector("#soil-moisture-value").textContent = `${formatSigned(parameterInputs.soilMoisture.value)}%`;
}

const weatherSearchForm = document.querySelector("#weather-search-form");
const weatherPlaceInput = document.querySelector("#weather-place");
const weatherPlaceChoice = document.querySelector("#weather-place-choice");
const weatherPlaceResults = document.querySelector("#weather-place-results");
const weatherStatus = document.querySelector("#weather-status");
const weatherResults = document.querySelector("#weather-results");
const weatherSearchButton = document.querySelector("#search-weather");
const weatherLoadButton = document.querySelector("#load-weather");
const weatherYearSelect = document.querySelector("#year");
let weatherLocations = [];
let weatherRequestController;
let weatherRequestTimeout;

function setWeatherStatus(message, isError = false) {
  weatherStatus.textContent = message;
  weatherStatus.classList.toggle("error", isError);
}

function startWeatherRequest() {
  weatherRequestController?.abort();
  clearTimeout(weatherRequestTimeout);
  weatherRequestController = new AbortController();
  const controller = weatherRequestController;
  weatherRequestTimeout = setTimeout(() => controller.abort(), 30000);
  weatherSearchButton.disabled = true;
  weatherLoadButton.disabled = true;
  return controller;
}

function finishWeatherRequest(controller) {
  if (weatherRequestController !== controller) return;
  clearTimeout(weatherRequestTimeout);
  weatherRequestTimeout = undefined;
  weatherRequestController = undefined;
  weatherSearchButton.disabled = false;
  weatherLoadButton.disabled = weatherLocations.length === 0;
}

weatherSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const place = weatherPlaceInput.value.trim();
  if (!place) return;

  const controller = startWeatherRequest();
  weatherResults.hidden = true;
  weatherPlaceChoice.hidden = true;
  weatherLocations = [];
  weatherLoadButton.disabled = true;
  setWeatherStatus("Searching for places...");

  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({
      name: place,
      count: "5",
      language: "en",
      format: "json"
    });
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) throw new Error("Place search is busy right now. Wait a minute and try again.");
    if (!response.ok) throw new Error(`Place search failed (${response.status}).`);

    const payload = await response.json();
    weatherLocations = Array.isArray(payload.results)
      ? payload.results.filter((location) =>
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude) &&
        typeof location.name === "string"
      )
      : [];
    if (!weatherLocations.length) {
      setWeatherStatus("No matching places found. Try adding a state, province, or country.");
      return;
    }

    weatherPlaceResults.replaceChildren(...weatherLocations.map((location, index) => {
      const details = [location.admin1, location.country].filter(Boolean).join(", ");
      return new Option(details ? `${location.name}, ${details}` : location.name, String(index));
    }));
    weatherPlaceChoice.hidden = false;
    setWeatherStatus(`Found ${weatherLocations.length} location${weatherLocations.length === 1 ? "" : "s"}. Choose the right one, then load ${weatherYearSelect.value}.`);
  } catch (error) {
    if (error.name === "AbortError") {
      if (weatherRequestController === controller) {
        setWeatherStatus("Place search timed out. Check your connection and try again.", true);
      }
      return;
    }
    console.error("Unable to search for a weather location.", error);
    setWeatherStatus(error.message || "Could not search for places. Check your connection and try again.", true);
  } finally {
    finishWeatherRequest(controller);
  }
});

weatherLoadButton.addEventListener("click", async () => {
  const location = weatherLocations[Number(weatherPlaceResults.value)];
  if (!location) {
    setWeatherStatus("Search for a place and choose a location first.", true);
    return;
  }

  const year = weatherYearSelect.value;
  const controller = startWeatherRequest();
  setWeatherStatus(`Loading historical weather for ${location.name}...`);

  try {
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      hourly: [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation",
        "wind_speed_10m",
        "shortwave_radiation",
        "soil_temperature_0_to_7cm",
        "soil_moisture_0_to_7cm"
      ].join(","),
      wind_speed_unit: "kmh",
      temperature_unit: "celsius",
      precipitation_unit: "mm",
      timezone: "auto",
      models: "era5_seamless"
    });
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) throw new Error("The weather service is busy right now. Wait a minute and try again.");
    if (!response.ok) throw new Error(`Weather request failed (${response.status}).`);

    const payload = await response.json();
    const hourly = payload.hourly;
    if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
      throw new Error("The weather service returned no records for this place and year.");
    }

    const fields = [
      ["temperature_2m", "temperature"],
      ["relative_humidity_2m", "humidity"],
      ["precipitation", "precipitation"],
      ["wind_speed_10m", "wind"],
      ["shortwave_radiation", "sunlight"],
      ["soil_temperature_0_to_7cm", "soilTemperature"],
      ["soil_moisture_0_to_7cm", "soilMoisture"]
    ];
    for (const [apiField] of fields) {
      if (!Array.isArray(hourly[apiField]) || hourly[apiField].length !== hourly.time.length) {
        throw new Error(`The weather service returned incomplete ${apiField} data.`);
      }
    }

    const months = Array.from({ length: 12 }, () =>
      Object.fromEntries(fields.map(([, key]) => [key, { sum: 0, count: 0 }]))
    );
    hourly.time.forEach((time, index) => {
      if (typeof time !== "string" || !time.startsWith(`${year}-`)) return;
      const monthIndex = Number(time.slice(5, 7)) - 1;
      if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= 12) return;
      fields.forEach(([apiField, key]) => {
        const value = hourly[apiField][index];
        if (!Number.isFinite(value)) return;
        months[monthIndex][key].sum += value;
        months[monthIndex][key].count += 1;
      });
    });

    const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });
    const average = (stat, digits = 1) => stat.count ? (stat.sum / stat.count).toFixed(digits) : "—";
    const rows = months.map((month, index) => {
      const row = document.createElement("tr");
      const values = [
        monthFormatter.format(new Date(Date.UTC(2020, index, 1))),
        average(month.temperature),
        month.precipitation.count ? month.precipitation.sum.toFixed(1) : "—",
        average(month.humidity),
        average(month.wind),
        average(month.sunlight),
        average(month.soilTemperature),
        average(month.soilMoisture, 3)
      ];
      values.forEach((value, valueIndex) => {
        const cell = document.createElement(valueIndex === 0 ? "th" : "td");
        if (valueIndex === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      });
      return row;
    });

    document.querySelector("#weather-months").replaceChildren(...rows);
    document.querySelector("#weather-location-label").textContent =
      [location.name, location.admin1, location.country].filter(Boolean).join(", ");
    document.querySelector("#weather-year-label").textContent = year;
    weatherResults.hidden = false;
    setWeatherStatus(`Loaded monthly historical estimates for ${location.name} in ${year}. Rain is a monthly total; other values are monthly averages.`);
  } catch (error) {
    if (error.name === "AbortError") {
      if (weatherRequestController === controller) {
        setWeatherStatus("Weather lookup timed out. Check your connection and try again.", true);
      }
      return;
    }
    console.error("Unable to load historical weather.", error);
    setWeatherStatus(error.message || "Could not load historical weather. Check your connection and try again.", true);
  } finally {
    finishWeatherRequest(controller);
  }
});

weatherYearSelect.addEventListener("change", () => {
  if (weatherRequestController) {
    weatherRequestController.abort();
    weatherRequestController = undefined;
    clearTimeout(weatherRequestTimeout);
    weatherRequestTimeout = undefined;
    weatherSearchButton.disabled = false;
    weatherLoadButton.disabled = weatherLocations.length === 0;
  }
  weatherResults.hidden = true;
  setWeatherStatus(weatherLocations.length
    ? `Year changed to ${weatherYearSelect.value}. Choose a place and load the selected year.`
    : `Year changed to ${weatherYearSelect.value}. Search for a place, then load the selected year.`);
});

const initialWeatherPlace = new URLSearchParams(window.location.search).get("place");
if (initialWeatherPlace) {
  weatherPlaceInput.value = initialWeatherPlace;
  weatherSearchForm.requestSubmit();
}

Object.values(parameterInputs).forEach((input) => input.addEventListener("input", updateRangeLabels));
document.querySelectorAll(".preset-button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.id === "reset-scenario") {
      form.reset();
      document.querySelector("#fips").value = "";
      document.querySelector(".advanced-inputs").open = false;
      currentScenario = undefined;
      document.querySelector("#result-content").hidden = true;
      document.querySelector("#result-placeholder").hidden = false;
      updateRangeLabels();
      showToast("Scenario inputs reset.");
      return;
    }
    const preset = presets[button.dataset.preset];
    if (!preset) return;
    Object.entries(preset).forEach(([key, value]) => {
      parameterInputs[key].value = value;
    });
    updateRangeLabels();
    form.requestSubmit();
  });
});

function getRiskDetails(values) {
  // Generic illustrative stress bands; these are not crop-calibrated agronomic thresholds.
  const bounded = (value) => Math.max(0, Math.min(1, value));
  const indicators = [
    { weight: 18, risk: bounded((0.72 - values.ndvi) / 0.62), label: "less plant greenness" },
    { weight: 9, risk: bounded(Math.max(values.temperature - 2, -values.temperature - 4, 0) / 6), label: "average temperature change" },
    { weight: 9, risk: bounded(Math.max(values.maxTemperature - 3, 0) / 7), label: "higher daytime temperatures" },
    { weight: 8, risk: bounded(Math.max(-values.minTemperature - 2, 0) / 5), label: "colder nighttime temperatures" },
    { weight: 14, risk: bounded(Math.max((-values.precipitation - 15) / 65, (values.precipitation - 35) / 45, 0)), label: "a large change in rainfall" },
    { weight: 8, risk: bounded(Math.max((-values.humidity - 15) / 25, (values.humidity - 25) / 15, 0)), label: "a change in humidity" },
    { weight: 7, risk: bounded(Math.max(values.wind - 35, 0) / 115), label: "stronger winds" },
    { weight: 7, risk: bounded(Math.max((-values.solar - 20) / 40, (values.solar - 40) / 20, 0)), label: "a change in sunlight" },
    { weight: 8, risk: bounded(Math.max(values.soilTemperature - 2, -values.soilTemperature - 3, 0) / 6), label: "a change in soil temperature" },
    { weight: 12, risk: bounded(Math.max((-values.soilMoisture - 15) / 45, (values.soilMoisture - 40) / 20, 0)), label: "a change in soil moisture" }
  ];
  const score = Math.round(indicators.reduce((total, item) => total + item.weight * item.risk, 0));
  const drivers = indicators.filter((item) => item.risk >= 0.35).map((item) => item.label);
  return { score, drivers };
}

function getRiskLevel(score) {
  if (score < 34) return { label: "Lower score", className: "" };
  if (score < 67) return { label: "Mid-range score", className: "medium" };
  return { label: "Higher score", className: "high" };
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(Object.entries(parameterInputs).map(([key, input]) => [key, Number(input.value)]));
  if (!Object.values(values).every(Number.isFinite)) {
    showToast("Please check the scenario inputs and try again.");
    return;
  }

  const { score, drivers } = getRiskDetails(values);
  const { label, className } = getRiskLevel(score);
  const crop = document.querySelector("#crop").value;
  const year = document.querySelector("#year").value;
  const fips = document.querySelector("#fips").value.trim();

  currentScenario = { crop, year, fips, ...values, score, level: label, createdAt: new Date().toISOString() };
  document.querySelector("#result-placeholder").hidden = true;
  document.querySelector("#result-content").hidden = false;
  document.querySelector("#risk-score").textContent = score;
  const badge = document.querySelector("#risk-badge");
  badge.textContent = label;
  badge.className = `risk-badge ${className}`.trim();
  const meter = document.querySelector("#risk-meter-fill");
  meter.style.width = `${score}%`;
  meter.className = className;
  document.querySelector("#result-summary").textContent = drivers.length
    ? `Worth a closer look: ${drivers.join(", ")}. This simple guide is not tailored to a crop or location.`
    : "Your choices trigger few flags in this simple guide. It is not a forecast or field check.";
  document.querySelector("#result-crop").textContent = `${crop} · ${year}${fips ? ` · FIPS ${fips}` : ""}`;
  document.querySelector("#result-inputs").textContent = [
    `Plant greenness: ${values.ndvi.toFixed(2)}`,
    `Temperatures (average / highest / lowest): ${formatSigned(values.temperature, 1, "°C")} / ${formatSigned(values.maxTemperature, 1, "°C")} / ${formatSigned(values.minTemperature, 1, "°C")}`,
    `Rain or snow: ${formatSigned(values.precipitation)}%`,
    `Humidity: ${formatSigned(values.humidity)} percentage points`,
    `Wind speed: ${formatSigned(values.wind)}%`,
    `Sunlight: ${formatSigned(values.solar)}%`,
    `Soil temperature: ${formatSigned(values.soilTemperature, 1, "°C")}`,
    `Soil moisture: ${formatSigned(values.soilMoisture)}%`
  ].join("\n");

  const resultPanel = document.querySelector("#result-panel");
  const bounds = resultPanel.getBoundingClientRect();
  if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
    resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

document.querySelector("#save-scenario").addEventListener("click", () => {
  if (!currentScenario) return;
  if (savedScenarios.length >= maxSavedScenarios) {
    showToast(`You can save up to ${maxSavedScenarios} examples. Remove one to save another.`);
    return;
  }
  const scenario = {
    ...currentScenario,
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `${currentScenario.crop}${currentScenario.fips ? ` · ${currentScenario.fips}` : ""} · ${currentScenario.year}`
  };
  savedScenarios.unshift(scenario);
  if (persistScenarios()) {
    renderScenarioList();
    showToast("Example saved in this browser.");
  } else {
    savedScenarios.shift();
  }
});

document.querySelector("#export-scenario").addEventListener("click", () => {
  if (currentScenario) downloadCsv([currentScenario], "cropnet-scenario.csv");
});

const imageUpload = document.querySelector("#image-upload");
const preview = document.querySelector("#image-preview");
let currentObjectUrl;

imageUpload.addEventListener("change", () => {
  const file = imageUpload.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file.");
    imageUpload.value = "";
    return;
  }
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  document.querySelector("#preview-image").src = currentObjectUrl;
  document.querySelector("#image-name").textContent = `${file.name} · local preview only`;
  preview.hidden = false;
});

document.querySelector("#remove-image").addEventListener("click", () => {
  imageUpload.value = "";
  preview.hidden = true;
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = undefined;
});

function loadScenarios() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    const scenarios = JSON.parse(stored);
    if (!Array.isArray(scenarios)) throw new Error("Saved scenarios have an invalid format.");
    return scenarios.filter((scenario) =>
      scenario && typeof scenario.id === "string" &&
      typeof scenario.crop === "string" && typeof scenario.year === "string" &&
      Number.isFinite(scenario.ndvi) && Number.isFinite(scenario.score)
    ).map((scenario) => ({
      ...scenario,
      crop: scenario.crop === "Soybean" ? "Soybeans" : scenario.crop,
      fips: typeof scenario.fips === "string" ? scenario.fips : "",
      precipitation: Number.isFinite(scenario.precipitation) ? scenario.precipitation : -(scenario.rain ?? 0),
      temperature: Number.isFinite(scenario.temperature) ? scenario.temperature : 0,
      maxTemperature: Number.isFinite(scenario.maxTemperature) ? scenario.maxTemperature : (scenario.temperature ?? 0),
      minTemperature: Number.isFinite(scenario.minTemperature) ? scenario.minTemperature : (scenario.temperature ?? 0),
      humidity: Number.isFinite(scenario.humidity) ? scenario.humidity : 0,
      wind: Number.isFinite(scenario.wind) ? scenario.wind : 0,
      solar: Number.isFinite(scenario.solar) ? scenario.solar : 0,
      soilTemperature: Number.isFinite(scenario.soilTemperature) ? scenario.soilTemperature : (scenario.temperature ?? 0),
      soilMoisture: Number.isFinite(scenario.soilMoisture) ? scenario.soilMoisture : 0,
      name: `${scenario.crop === "Soybean" ? "Soybeans" : scenario.crop}${scenario.fips ? ` · ${scenario.fips}` : ""} · ${scenario.year}`
    })).slice(0, maxSavedScenarios);
  } catch (error) {
    console.error("Unable to load saved CropNet scenarios.", error);
    showToast("Could not read saved examples in this browser.");
    return [];
  }
}

function persistScenarios() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(savedScenarios));
    return true;
  } catch (error) {
    console.error("Unable to save CropNet scenarios.", error);
    showToast("Could not save. Check this browser's storage settings or available space.");
    return false;
  }
}

function renderScenarioList() {
  const list = document.querySelector("#scenario-list");
  list.replaceChildren();
  document.querySelector("#saved-count").textContent = `${savedScenarios.length} saved`;
  document.querySelector("#field-log-empty").hidden = savedScenarios.length > 0;
  savedScenarios.forEach((scenario) => {
    const item = document.createElement("article");
    item.className = "saved-scenario";
    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "compare-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = comparedIds.has(scenario.id);
    checkbox.setAttribute("aria-label", `Select ${scenario.name} for comparison`);
    checkbox.addEventListener("change", () => toggleComparison(scenario.id, checkbox.checked));
    checkboxLabel.append(checkbox, document.createTextNode("Compare"));

    const details = document.createElement("div");
    details.className = "saved-details";
    const title = document.createElement("strong");
    title.textContent = scenario.name;
    const metadata = document.createElement("span");
    metadata.textContent = `Greenness ${scenario.ndvi.toFixed(2)} · rain/snow ${formatSigned(scenario.precipitation)}% · county code ${scenario.fips || "not added"} · ${new Date(scenario.createdAt).toLocaleString()}`;
    details.append(title, metadata);

    const risk = document.createElement("span");
    const riskLevel = getRiskLevel(scenario.score);
    risk.className = `saved-risk ${riskLevel.className}`.trim();
    risk.textContent = `${scenario.score} · ${riskLevel.label}`;

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "text-button";
    loadButton.textContent = "Use again";
    loadButton.addEventListener("click", () => loadScenario(scenario));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "text-button remove-scenario";
    removeButton.textContent = "Delete";
    removeButton.addEventListener("click", () => removeScenario(scenario.id));
    item.append(checkboxLabel, details, risk, loadButton, removeButton);
    list.append(item);
  });
  renderComparison();
}

function loadScenario(scenario) {
  document.querySelector("#crop").value = scenario.crop;
  const yearSelect = document.querySelector("#year");
  if ([...yearSelect.options].some((option) => option.value === scenario.year)) {
    yearSelect.value = scenario.year;
  } else {
    yearSelect.value = yearSelect.options[0].value;
    showToast(`This saved year is outside the available range; using ${yearSelect.value} instead.`);
  }
  document.querySelector("#fips").value = scenario.fips || "";
  Object.entries(parameterInputs).forEach(([key, input]) => {
    if (Number.isFinite(scenario[key])) input.value = scenario[key];
  });
  updateRangeLabels();
  form.requestSubmit();
  document.querySelector("#explorer").scrollIntoView({ behavior: "smooth" });
}

function removeScenario(id) {
  const previous = savedScenarios;
  savedScenarios = savedScenarios.filter((scenario) => scenario.id !== id);
  comparedIds.delete(id);
  if (persistScenarios()) {
    renderScenarioList();
    showToast("Saved example deleted.");
  } else {
    savedScenarios = previous;
  }
}

function toggleComparison(id, selected) {
  if (selected && comparedIds.size >= 2) {
    showToast("Choose up to two examples to compare.");
    renderScenarioList();
    return;
  }
  if (selected) comparedIds.add(id);
  else comparedIds.delete(id);
  renderComparison();
}

function renderComparison() {
  const panel = document.querySelector("#comparison-panel");
  const results = document.querySelector("#comparison-results");
  results.replaceChildren();
  panel.hidden = comparedIds.size === 0;
  if (!comparedIds.size) return;
  const chosen = savedScenarios.filter((scenario) => comparedIds.has(scenario.id));
  chosen.forEach((scenario) => {
    const card = document.createElement("div");
    card.className = "comparison-card";
    const title = document.createElement("strong");
    title.textContent = scenario.name;
    const score = document.createElement("span");
    const level = getRiskLevel(scenario.score);
    score.className = `saved-risk ${level.className}`.trim();
    score.textContent = `${scenario.score} · ${level.label}`;
    const meter = document.createElement("div");
    meter.className = "comparison-meter";
    const fill = document.createElement("span");
    fill.style.width = `${scenario.score}%`;
    fill.className = level.className;
    meter.append(fill);
    const inputs = document.createElement("small");
    inputs.textContent = `Greenness ${scenario.ndvi.toFixed(2)} · rain/snow ${formatSigned(scenario.precipitation)}% · average temperature ${formatSigned(scenario.temperature, 1, "°C")}`;
    card.append(title, score, meter, inputs);
    results.append(card);
  });
  if (chosen.length === 2) {
    const difference = Math.abs(chosen[0].score - chosen[1].score);
    const note = document.createElement("p");
    note.className = "comparison-difference";
    note.textContent = `The example scores differ by ${difference} points. This is not a real forecast.`;
    results.append(note);
  }
}

document.querySelector("#clear-comparison").addEventListener("click", () => {
  comparedIds.clear();
  renderScenarioList();
});

function downloadCsv(scenarios, filename) {
  const headers = [
    "Crop", "Year", "County code", "Plant greenness",
    "Average temperature change (C)", "Highest temperature change (C)", "Lowest temperature change (C)",
    "Rain or snow change (%)", "Humidity change (percentage points)", "Wind speed change (%)",
    "Sunlight change (%)", "Soil temperature change (C)", "Soil moisture change (%)",
    "Example stress score (not a forecast)", "Example stress level", "Saved at"
  ];
  const rows = scenarios.map((scenario) => [
    scenario.crop, scenario.year, scenario.fips || "", scenario.ndvi.toFixed(2),
    scenario.temperature.toFixed(1), scenario.maxTemperature.toFixed(1), scenario.minTemperature.toFixed(1),
    scenario.precipitation, scenario.humidity, scenario.wind, scenario.solar,
    scenario.soilTemperature.toFixed(1), scenario.soilMoisture,
    scenario.score, getRiskLevel(scenario.score).label, scenario.createdAt
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${scenarios.length} example${scenarios.length === 1 ? "" : "s"} as a CSV spreadsheet.`);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

document.querySelector("#export-log").addEventListener("click", () => {
  if (!savedScenarios.length) {
    showToast("Save an example before downloading the list.");
    return;
  }
  downloadCsv(savedScenarios, "cropnet-field-log.csv");
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

document.querySelector("#about-button").addEventListener("click", () => {
  showToast("All scores here are examples. No live farm data or prediction model is connected.");
});

const menuButton = document.querySelector("#menu-button");
const sidebar = document.querySelector("#sidebar");
menuButton.addEventListener("click", () => {
  const open = sidebar.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".side-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    sidebar.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    document.querySelectorAll(".side-nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

updateRangeLabels();
renderScenarioList();
