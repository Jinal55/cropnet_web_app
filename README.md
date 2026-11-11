# CropNet: crops, weather and yield

CropNet is a small project website for exploring crop and weather scenarios and viewing the model metrics saved in the research notebook.

## Run the website locally

Open PowerShell in this folder and start a local web server:

```powershell
python -m http.server 8000
```

If `python` is not available, use:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000` in your browser. Leave the terminal open while using the site. Press **Ctrl+C** to stop the server.

## Explore a scenario

1. Choose a crop and year.
2. Adjust the sliders or start from one of the presets.
3. Select **Show guide score** to see how the values compare with the site's illustrative guide.
4. Save scenarios in this browser or download them as a CSV file.

The guide score is not a forecast, diagnosis, crop-loss probability, or result from the research model. It does not change based on crop type. County codes are optional labels and are not looked up. Saved scenarios stay in the current browser.

## Look up historical weather

Open **Weather history**, search for a town, county, or region, choose the matching place, and load the year selected in the scenario form. The site retrieves hourly ERA5-Seamless historical reanalysis from the Open-Meteo API and summarizes it by month. An internet connection is required; no API key is needed.

These are gridded regional estimates, not readings from a specific farm or the CropNet dataset. The weather table is separate: it does not fill the scenario sliders, change the guide score, or run the notebook model.

## About the notebook results

The website displays metrics saved in the notebook; it does not train or run the models. The notebook's evaluation used 300 synthetic soybean samples across 10 counties and 2018–2022, with 60 samples held out for evaluation. The data are generated rather than observed farm or weather records, so these results do not establish how the models would perform on real farms. Yield units are not reported in the notebook's regression table.

On that run, XGBoost classified more samples correctly than the CNN–BiLSTM (88.3% versus 78.3%). For yield estimates, CNN–BiLSTM had a slightly lower average error, while XGBoost had a lower large-error score and a slightly higher fit score. These results are for the synthetic experiment only.
