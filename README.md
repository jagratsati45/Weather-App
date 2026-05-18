# Weather App

A lightweight weather app built with vanilla HTML, CSS, and JavaScript. It fetches current weather data from the [OpenWeatherMap](https://openweathermap.org/) API. No frameworks, no build step.

## Features

- _Placeholder_ — Search weather by city
- _Placeholder_ — Display temperature, conditions, and icon
- _Placeholder_ — Responsive layout

## Setup

1. Clone or download this repository.
2. Sign up at [OpenWeatherMap](https://home.openweathermap.org/users/sign_up) and grab a free API key.
3. Open `config.js` and replace `YOUR_API_KEY_HERE` with your key.
4. Make sure `config.js` is listed in `.gitignore` before committing.

## API Key Configuration

`config.js` exports three constants used by the app:

- `API_KEY` — your OpenWeatherMap key
- `BASE_URL` — `https://api.openweathermap.org/data/2.5`
- `ICON_URL` — icon URL template with an `{icon}` placeholder

## Usage

Open `index.html` in a browser, or serve the folder with any static server (for example, `npx serve` or VS Code Live Server). Enter a city name and submit to view the current weather.
