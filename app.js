const form = document.querySelector("#scenario-form");
const ndviInput = document.querySelector("#ndvi");
const rainInput = document.querySelector("#rain");
const tempInput = document.querySelector("#temp");
const toast = document.querySelector("#toast");
const storageKey = "cropnet-saved-scenarios-v1";
const maxSavedScenarios = 25;
let toastTimer;
let currentScenario;
let savedScenarios = loadScenarios();
const comparedIds = new Set();

function updateRangeLabels() {
  document.querySelector("#ndvi-value").textContent = Number(ndviInput.value).toFixed(2);
  document.querySelector("#rain-value").textContent = `${rainInput.value}%`;
  const temperature = Number(tempInput.value);
  document.querySelector("#temp-value").textContent = `${temperature > 0 ? "+" : ""}${temperature.toFixed(1)}°C`;
}

[ndviInput, rainInput, tempInput].forEach((input) => input.addEventListener("input", updateRangeLabels));
document.querySelectorAll(".preset-button").forEach((button) => {
  button.addEventListener("click", () => {
    ndviInput.value = button.dataset.ndvi;
    rainInput.value = button.dataset.rain;
    tempInput.value = button.dataset.temp;
    updateRangeLabels();
    form.requestSubmit();
  });
});

function getRiskScore(ndvi, rain, temperature) {
  return Math.round(Math.max(0, Math.min(100,
    ((0.75 - ndvi) / 0.65) * 55 + (rain / 80) * 30 + (Math.max(temperature, 0) / 6) * 15
  )));
}

function getRiskLevel(score) {
  if (score < 34) return { label: "Low", className: "" };
  if (score < 67) return { label: "Medium", className: "medium" };
  return { label: "High", className: "high" };
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const ndvi = Number(ndviInput.value);
  const rain = Number(rainInput.value);
  const temperature = Number(tempInput.value);
  if (![ndvi, rain, temperature].every(Number.isFinite)) {
    showToast("Please check the scenario inputs and try again.");
    return;
  }

  const score = getRiskScore(ndvi, rain, temperature);
  const { label, className } = getRiskLevel(score);
  const riskDrivers = [];
  if (ndvi < 0.45) riskDrivers.push("lower vegetation index");
  if (rain >= 35) riskDrivers.push("rainfall deficit");
  if (temperature >= 2.5) riskDrivers.push("warmer-than-baseline conditions");
  const crop = document.querySelector("#crop").value;
  const year = document.querySelector("#year").value;

  currentScenario = { crop, year, ndvi, rain, temperature, score, level: label, createdAt: new Date().toISOString() };
  document.querySelector("#result-placeholder").hidden = true;
  document.querySelector("#result-content").hidden = false;
  document.querySelector("#risk-score").textContent = score;
  const badge = document.querySelector("#risk-badge");
  badge.textContent = `${label} risk`;
  badge.className = `risk-badge ${className}`.trim();
  const meter = document.querySelector("#risk-meter-fill");
  meter.style.width = `${score}%`;
  meter.className = className;
  document.querySelector("#result-summary").textContent = riskDrivers.length
    ? `This rule-based preview flags ${riskDrivers.join(" and ")} as potential stress signals. Review local observations before drawing conclusions.`
    : "The selected values show fewer stress signals in this simple rule-based preview. This is not a forecast or a field diagnosis.";
  document.querySelector("#result-crop").textContent = `${crop} · ${year}`;
  document.querySelector("#result-inputs").textContent = `NDVI ${ndvi.toFixed(2)} · deficit ${rain}% · temp ${temperature > 0 ? "+" : ""}${temperature.toFixed(1)}°C`;

  const resultPanel = document.querySelector("#result-panel");
  const bounds = resultPanel.getBoundingClientRect();
  if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
    resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

document.querySelector("#save-scenario").addEventListener("click", () => {
  if (!currentScenario) return;
  if (savedScenarios.length >= maxSavedScenarios) {
    showToast(`The field log holds up to ${maxSavedScenarios} scenarios. Remove one to save another.`);
    return;
  }
  const scenario = {
    ...currentScenario,
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `${currentScenario.crop} · ${currentScenario.year}`
  };
  savedScenarios.unshift(scenario);
  if (persistScenarios()) {
    renderScenarioList();
    showToast("Scenario saved to this browser's field log.");
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
      [scenario.ndvi, scenario.rain, scenario.temperature, scenario.score].every(Number.isFinite)
    ).slice(0, maxSavedScenarios);
  } catch (error) {
    console.error("Unable to load saved CropNet scenarios.", error);
    showToast("Could not read the saved field log from this browser.");
    return [];
  }
}

function persistScenarios() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(savedScenarios));
    return true;
  } catch (error) {
    console.error("Unable to save CropNet scenarios.", error);
    showToast("Could not save. Check browser storage settings or available space.");
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
    metadata.textContent = `NDVI ${scenario.ndvi.toFixed(2)} · deficit ${scenario.rain}% · ${new Date(scenario.createdAt).toLocaleString()}`;
    details.append(title, metadata);

    const risk = document.createElement("span");
    const riskLevel = getRiskLevel(scenario.score);
    risk.className = `saved-risk ${riskLevel.className}`.trim();
    risk.textContent = `${scenario.score} · ${riskLevel.label}`;

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "text-button";
    loadButton.textContent = "Load";
    loadButton.addEventListener("click", () => loadScenario(scenario));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "text-button remove-scenario";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeScenario(scenario.id));
    item.append(checkboxLabel, details, risk, loadButton, removeButton);
    list.append(item);
  });
  renderComparison();
}

function loadScenario(scenario) {
  document.querySelector("#crop").value = scenario.crop;
  document.querySelector("#year").value = scenario.year;
  ndviInput.value = scenario.ndvi;
  rainInput.value = scenario.rain;
  tempInput.value = scenario.temperature;
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
    showToast("Scenario removed from the field log.");
  } else {
    savedScenarios = previous;
  }
}

function toggleComparison(id, selected) {
  if (selected && comparedIds.size >= 2) {
    showToast("Select no more than two scenarios to compare.");
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
    score.textContent = `${scenario.score} · ${level.label} risk`;
    const meter = document.createElement("div");
    meter.className = "comparison-meter";
    const fill = document.createElement("span");
    fill.style.width = `${scenario.score}%`;
    fill.className = level.className;
    meter.append(fill);
    const inputs = document.createElement("small");
    inputs.textContent = `NDVI ${scenario.ndvi.toFixed(2)} · deficit ${scenario.rain}% · temp ${scenario.temperature > 0 ? "+" : ""}${scenario.temperature.toFixed(1)}°C`;
    card.append(title, score, meter, inputs);
    results.append(card);
  });
  if (chosen.length === 2) {
    const difference = Math.abs(chosen[0].score - chosen[1].score);
    const note = document.createElement("p");
    note.className = "comparison-difference";
    note.textContent = `Illustrative score difference: ${difference} points. This heuristic comparison is not a model-backed forecast.`;
    results.append(note);
  }
}

document.querySelector("#clear-comparison").addEventListener("click", () => {
  comparedIds.clear();
  renderScenarioList();
});

function downloadCsv(scenarios, filename) {
  const headers = ["crop", "season_year", "ndvi", "rainfall_deficit_percent", "temperature_anomaly_c", "illustrative_risk_score", "risk_level", "created_at"];
  const rows = scenarios.map((scenario) => [
    scenario.crop, scenario.year, scenario.ndvi.toFixed(2), scenario.rain,
    scenario.temperature.toFixed(1), scenario.score, getRiskLevel(scenario.score).label, scenario.createdAt
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
  showToast(`Exported ${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"} as CSV.`);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

document.querySelector("#export-log").addEventListener("click", () => {
  if (!savedScenarios.length) {
    showToast("Save a scenario before exporting the field log.");
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
  showToast("Notebook metrics shown above came from synthetic data; scenario scores are rule-based demos.");
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
