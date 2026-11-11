# CropNet: crops and weather explorer

A simple website for trying example crop and weather values and reading the results saved in the project notebook.

## Open the website

Open `index.html` in a browser, or start a local web server from PowerShell:

```powershell
python -m http.server 8000
```

Then go to `http://localhost:8000`.

## Try an example

1. Choose a crop and year.
2. Move the sliders. Use the “What do these values mean?” guide if needed.
3. Select a preset or choose **Show example results**.
4. Save the example in this browser or download it as a CSV spreadsheet.

The crop list matches CropNet's USDA catalog: Corn, Cotton, Soybeans, and Winter Wheat. County codes are optional labels only; the site does not look up county data. Saved examples stay in the current browser.

## Important

The example score is a simple guide made for this website. It is not a forecast, diagnosis, crop-loss probability, or the research model's output. It does not change based on crop type.

The notebook results shown on the site came from generated examples, not real farms. The research project could not load its real weather data, and its real-data setup still needs work. The notebook's test run used soybeans only. Do not use the example scores or saved notebook results to make farming decisions.
