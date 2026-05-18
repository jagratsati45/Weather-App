'use strict';

import { API_KEY, BASE_URL, ICON_URL } from './config.js';

// ---------- DOM references ----------
const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const geoBtn = document.getElementById('geo-btn');
const unitToggle = document.getElementById('unit-toggle');
const favoriteBtn = document.getElementById('favorite-btn');
const cityNameEl = document.getElementById('city-name');
const weatherCardEl = document.getElementById('weather-card');
const temperatureEl = document.getElementById('temperature');
const conditionEl = document.getElementById('condition');
const weatherIconEl = document.getElementById('weather-icon');
const humidityEl = document.getElementById('humidity');
const windSpeedEl = document.getElementById('wind-speed');
const uvIndexEl = document.getElementById('uv-index');
const visibilityEl = document.getElementById('visibility-value');
const humidityFillEl = document.getElementById('humidity-fill');
const windFillEl = document.getElementById('wind-fill');
const uvFillEl = document.getElementById('uv-fill');
const visibilityFillEl = document.getElementById('visibility-fill');
const forecastEl = document.getElementById('forecast');
const hourlyEl = document.getElementById('hourly-strip');
const aqiWidgetEl = document.getElementById('aqi-widget');
const aqiBadgeEl = document.getElementById('aqi-badge');
const aqiNumberEl = document.getElementById('aqi-number');
const aqiLabelEl = document.getElementById('aqi-label');
const aqiPm25El = document.getElementById('aqi-pm25');
const aqiCoEl = document.getElementById('aqi-co');
const aqiO3El = document.getElementById('aqi-o3');
const tipsWidgetEl = document.getElementById('tips-widget');
const tipsClothingEl = document.getElementById('tips-clothing');
const tipsActivitiesEl = document.getElementById('tips-activities');
const weatherSkeletonEl = document.getElementById('weather-skeleton');
const ptrIndicator = document.getElementById('ptr-indicator');
const sunArcEl = document.getElementById('sun-arc');
const sunArcProgressEl = document.getElementById('sun-arc-progress');
const sunDotEl = document.getElementById('sun-dot');
const sunriseTimeEl = document.getElementById('sunrise-time');
const sunsetTimeEl = document.getElementById('sunset-time');
const historyEl = document.getElementById('history');
const autocompleteEl = document.getElementById('autocomplete');
const errorMsgEl = document.getElementById('error-msg');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// ---------- Utilities: debounce & sanitize ----------
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ---------- Animation helpers ----------
const prefersReducedMotion =
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animate a numeric value in an element from `from` to `to`.
 * Uses easeOutQuart for a snappy slowdown.
 */
function animateCounter(element, from, to, duration = 600, format = (v) => v) {
  if (!element) return;

  if (prefersReducedMotion) {
    element.textContent = format(to);
    return;
  }

  // Cancel any in-flight animation on the same element.
  if (element._counterRaf) cancelAnimationFrame(element._counterRaf);

  const start = performance.now();
  const delta = to - from;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    // easeOutQuart: 1 - (1 - t)^4
    const eased = 1 - Math.pow(1 - t, 4);
    const value = from + delta * eased;
    element.textContent = format(value);

    if (t < 1) {
      element._counterRaf = requestAnimationFrame(frame);
    } else {
      element._counterRaf = null;
    }
  }

  element._counterRaf = requestAnimationFrame(frame);
}

/**
 * Crossfade an <img> to a new src.
 * Fades out → swaps src → fades back in once the new image loads.
 */
function crossfadeImage(img, newSrc, newAlt) {
  if (!img) return;
  if (img.src === newSrc) {
    img.alt = newAlt || img.alt;
    return;
  }

  if (prefersReducedMotion) {
    img.src = newSrc;
    img.alt = newAlt || '';
    return;
  }

  img.style.opacity = '0';

  const swap = () => {
    img.src = newSrc;
    img.alt = newAlt || '';
    // Wait for the new image to be ready before fading in
    if (img.complete) {
      requestAnimationFrame(() => (img.style.opacity = '1'));
    } else {
      img.addEventListener(
        'load',
        () => requestAnimationFrame(() => (img.style.opacity = '1')),
        { once: true }
      );
      img.addEventListener(
        'error',
        () => (img.style.opacity = '1'),
        { once: true }
      );
    }
  };

  // Wait one frame so the opacity:0 transition is visible
  setTimeout(swap, 300);
}

/**
 * Re-trigger a CSS animation by toggling a class.
 * Forces a reflow between remove/add so the animation always replays.
 */
function replayAnimation(el, className) {
  if (!el || prefersReducedMotion) return;
  el.classList.remove(className);
  // Force reflow to restart the animation
  void el.offsetWidth;
  el.classList.add(className);
}

/**
 * Apply staggered slide-in to a list of elements within a container.
 */
function staggerSlideIn(container) {
  if (!container || prefersReducedMotion) return;
  const items = container.querySelectorAll('.stat-item');
  items.forEach((el) => {
    el.classList.remove('slide-in');
    void el.offsetWidth; // reflow to restart
    el.classList.add('slide-in');
  });
}

/**
 * Animate a stat bar fill from its current width to a target percentage.
 * The CSS transition handles the animation; we just reset to 0 first
 * so the bar always animates from empty when new data arrives.
 */
function animateStatBar(el, percent) {
  if (!el) return;
  const clamped = Math.max(0, Math.min(100, percent || 0));

  if (prefersReducedMotion) {
    el.style.width = `${clamped}%`;
    return;
  }

  // Reset to 0, force reflow, then set the target. The CSS transition
  // (width 0.6s ease) takes care of the animation.
  el.style.width = '0%';
  void el.offsetWidth;
  el.style.width = `${clamped}%`;
}

function sanitizeCity(raw) {
  // Trim, strip anything that isn't a letter, digit, space, hyphen, period, or apostrophe
  let cleaned = raw.trim().replace(/[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF0-9\s\-'.]/g, '');
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  // Cap at 50 characters
  return cleaned.slice(0, 50);
}

// ---------- Cache (sessionStorage) ----------
function getCached(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCached(key, data, ttlMinutes = 10) {
  try {
    const expiry = Date.now() + ttlMinutes * 60 * 1000;
    sessionStorage.setItem(key, JSON.stringify({ data, expiry }));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

function cacheKey(prefix, query) {
  return `${prefix}_${query.toLowerCase().replace(/\s+/g, '_')}`;
}

// ---------- Global state ----------
const state = {
  unit: localStorage.getItem('unit') || 'C',
  currentCity: null,
  tempC: null,
  forecastDays: [],
  hourlyEntries: [],
  history: JSON.parse(localStorage.getItem('history') || '[]'),
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
  // Last successful query, for pull-to-refresh
  lastQuery: null, // { type: 'city' | 'coords', value }
  isLoading: false,
};

// ---------- Dynamic background ----------
const BG_CLASSES = ['bg-sunny', 'bg-night', 'bg-cloudy', 'bg-rainy', 'bg-snowy', 'bg-stormy'];

/**
 * Map OpenWeatherMap icon code to an emoji.
 * Icon codes: https://openweathermap.org/weather-conditions
 * Format: "01d" (day) or "01n" (night)
 */
function getWeatherEmoji(iconCode) {
  const map = {
    '01d': '☀️',    // clear sky day
    '01n': '🌙',    // clear sky night
    '02d': '⛅',    // few clouds day
    '02n': '☁️',    // few clouds night
    '03d': '☁️',    // scattered clouds
    '03n': '☁️',
    '04d': '☁️',    // broken clouds
    '04n': '☁️',
    '09d': '🌧️',   // shower rain
    '09n': '🌧️',
    '10d': '🌦️',   // rain day
    '10n': '🌧️',   // rain night
    '11d': '⛈️',   // thunderstorm
    '11n': '⛈️',
    '13d': '❄️',    // snow
    '13n': '❄️',
    '50d': '🌫️',   // mist/fog
    '50n': '🌫️',
  };
  return map[iconCode] || '🌤️';
}

function getBgClass(weatherId, isNight) {
  if (isNight) return 'bg-night';
  const group = Math.floor(weatherId / 100);
  switch (group) {
    case 2: return 'bg-stormy';
    case 3:
    case 5: return 'bg-rainy';
    case 6: return 'bg-snowy';
    case 7: return 'bg-cloudy';
    case 8: return weatherId === 800 ? 'bg-sunny' : 'bg-cloudy';
    default: return 'bg-sunny';
  }
}

function isNightTime(data) {
  const { dt, sys } = data;
  if (!sys || sys.sunrise == null || sys.sunset == null) return false;
  return dt < sys.sunrise || dt > sys.sunset;
}

function applyBgClass(className) {
  document.body.classList.remove(...BG_CLASSES);
  document.body.classList.add(className);
  applyWeatherParticles(className);
}

// ---------- Weather particles ----------
const particlesContainer = document.getElementById('weather-particles');
const weatherCanvas = document.getElementById('weather-canvas');
const ctx = weatherCanvas ? weatherCanvas.getContext('2d') : null;
let particleAnimId = null;
let particles = [];
let currentWeatherTheme = null;
let lightningTimer = null;
let lightningOpacity = 0;

function resizeCanvas() {
  if (!weatherCanvas) return;
  weatherCanvas.width = window.innerWidth;
  weatherCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function applyWeatherParticles(bgClass) {
  if (!ctx) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Stop previous animation
  if (particleAnimId) cancelAnimationFrame(particleAnimId);
  if (lightningTimer) clearInterval(lightningTimer);
  particles = [];
  lightningOpacity = 0;
  currentWeatherTheme = bgClass;

  switch (bgClass) {
    case 'bg-night':
      initNightParticles();
      break;
    case 'bg-rainy':
      initRainParticles();
      break;
    case 'bg-snowy':
      initSnowParticles();
      break;
    case 'bg-sunny':
      initSunParticles();
      break;
    case 'bg-stormy':
      initStormParticles();
      break;
    case 'bg-cloudy':
      initCloudParticles();
      break;
  }

  animateParticles();
}

function animateParticles() {
  if (!ctx) return;
  ctx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);

  // Lightning flash overlay for stormy
  if (lightningOpacity > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${lightningOpacity})`;
    ctx.fillRect(0, 0, weatherCanvas.width, weatherCanvas.height);
    lightningOpacity *= 0.9;
    if (lightningOpacity < 0.01) lightningOpacity = 0;
  }

  for (const p of particles) {
    p.update();
    p.draw(ctx);
  }

  particleAnimId = requestAnimationFrame(animateParticles);
}

// ---- NIGHT: Stars + shooting stars ----
function initNightParticles() {
  const w = weatherCanvas.width;
  const h = weatherCanvas.height;

  // Static twinkling stars
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: 1 + Math.random() * 2.5,
      twinkleSpeed: 0.02 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
      update() {
        this.phase += this.twinkleSpeed;
      },
      draw(c) {
        const alpha = 0.5 + Math.sin(this.phase) * 0.5;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, alpha)})`;
        c.shadowBlur = 4;
        c.shadowColor = 'rgba(255, 255, 255, 0.8)';
        c.fill();
        c.shadowBlur = 0;
      },
    });
  }

  // Shooting stars (continuous)
  for (let i = 0; i < 5; i++) {
    particles.push(createShootingStar(w, h, i * 2));
  }
}

function createShootingStar(w, h, delay) {
  return {
    x: Math.random() * w * 0.8 + w * 0.1,
    y: Math.random() * h * 0.4,
    speed: 4 + Math.random() * 3,
    length: 60 + Math.random() * 40,
    opacity: 0,
    delay: delay,
    timer: 0,
    active: false,
    update() {
      this.timer++;
      if (this.timer < this.delay * 60) return;
      this.active = true;
      this.x -= this.speed;
      this.y += this.speed * 0.6;
      this.opacity = Math.min(1, this.opacity + 0.05);

      // Reset when off screen
      if (this.x < -100 || this.y > weatherCanvas.height + 50) {
        this.x = Math.random() * weatherCanvas.width * 0.8 + weatherCanvas.width * 0.1;
        this.y = Math.random() * weatherCanvas.height * 0.3;
        this.opacity = 0;
        this.delay = 1 + Math.random() * 3;
        this.timer = 0;
        this.active = false;
      }
    },
    draw(c) {
      if (!this.active) return;
      const gradient = c.createLinearGradient(
        this.x, this.y,
        this.x + this.length * 0.7, this.y - this.length * 0.4
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.beginPath();
      c.moveTo(this.x, this.y);
      c.lineTo(this.x + this.length * 0.7, this.y - this.length * 0.4);
      c.strokeStyle = gradient;
      c.lineWidth = 1.5;
      c.stroke();
      // Head glow
      c.beginPath();
      c.arc(this.x, this.y, 2, 0, Math.PI * 2);
      c.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
      c.fill();
    },
  };
}

// ---- RAINY: Continuous rain drops ----
function initRainParticles() {
  const w = weatherCanvas.width;
  const h = weatherCanvas.height;

  for (let i = 0; i < 200; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      speed: 10 + Math.random() * 8,
      length: 20 + Math.random() * 20,
      opacity: 0.4 + Math.random() * 0.5,
      wind: -2,
      width: 1.5 + Math.random() * 1,
      update() {
        this.y += this.speed;
        this.x += this.wind;
        if (this.y > weatherCanvas.height) {
          this.y = -this.length;
          this.x = Math.random() * weatherCanvas.width;
        }
        if (this.x < 0) this.x = weatherCanvas.width;
      },
      draw(c) {
        c.beginPath();
        c.moveTo(this.x, this.y);
        c.lineTo(this.x + this.wind * 2, this.y + this.length);
        c.strokeStyle = `rgba(174, 214, 241, ${this.opacity})`;
        c.lineWidth = this.width;
        c.lineCap = 'round';
        c.stroke();
      },
    });
  }
}

// ---- SNOWY: Drifting snowflakes ----
function initSnowParticles() {
  const w = weatherCanvas.width;
  const h = weatherCanvas.height;

  for (let i = 0; i < 100; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: 3 + Math.random() * 5,
      speed: 0.8 + Math.random() * 2,
      wind: Math.random() * 0.5 - 0.25,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.02,
      opacity: 0.6 + Math.random() * 0.4,
      update() {
        this.y += this.speed;
        this.wobble += this.wobbleSpeed;
        this.x += Math.sin(this.wobble) * 0.8 + this.wind;
        if (this.y > weatherCanvas.height + 10) {
          this.y = -10;
          this.x = Math.random() * weatherCanvas.width;
        }
        if (this.x < -10) this.x = weatherCanvas.width + 10;
        if (this.x > weatherCanvas.width + 10) this.x = -10;
      },
      draw(c) {
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        c.shadowBlur = 3;
        c.shadowColor = 'rgba(255, 255, 255, 0.5)';
        c.fill();
        c.shadowBlur = 0;
      },
    });
  }
}

// ---- SUNNY: Keep existing DOM-based (don't touch) ----
function initSunParticles() {
  // Sunny uses the existing subtle DOM particles — keep it light
  particlesContainer.innerHTML = '';
  for (let i = 0; i < 15; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle-sun';
    particle.style.cssText = `
      position:absolute;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      width:${3 + Math.random() * 4}px;
      height:${3 + Math.random() * 4}px;
      background:rgba(255,215,0,0.4);
      border-radius:50%;
      animation:sun-float ${3 + Math.random() * 4}s ease-in-out infinite;
      animation-delay:${Math.random() * 3}s;
      display:block !important;
    `;
    particlesContainer.appendChild(particle);
  }
}

// ---- STORMY: Heavy rain + lightning ----
function initStormParticles() {
  const w = weatherCanvas.width;
  const h = weatherCanvas.height;

  // Heavy rain
  for (let i = 0; i < 250; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      speed: 14 + Math.random() * 10,
      length: 25 + Math.random() * 25,
      opacity: 0.3 + Math.random() * 0.5,
      wind: -4 + Math.random() * -2,
      width: 1.5 + Math.random() * 1,
      update() {
        this.y += this.speed;
        this.x += this.wind;
        if (this.y > weatherCanvas.height) {
          this.y = -this.length;
          this.x = Math.random() * weatherCanvas.width;
        }
        if (this.x < -20) this.x = weatherCanvas.width + 20;
      },
      draw(c) {
        c.beginPath();
        c.moveTo(this.x, this.y);
        c.lineTo(this.x + this.wind * 1.5, this.y + this.length);
        c.strokeStyle = `rgba(200, 220, 240, ${this.opacity})`;
        c.lineWidth = this.width;
        c.lineCap = 'round';
        c.stroke();
      },
    });
  }

  // Lightning flashes at random intervals
  lightningTimer = setInterval(() => {
    if (Math.random() > 0.4) {
      lightningOpacity = 0.25 + Math.random() * 0.3;
      // Double flash
      setTimeout(() => {
        lightningOpacity = 0.15 + Math.random() * 0.25;
      }, 80 + Math.random() * 80);
    }
  }, 1500 + Math.random() * 2500);
}

// ---- CLOUDY: Clouds drifting across ----
function initCloudParticles() {
  const w = weatherCanvas.width;
  const h = weatherCanvas.height;

  for (let i = 0; i < 10; i++) {
    particles.push({
      x: Math.random() * w - 200,
      y: 30 + Math.random() * (h * 0.5),
      width: 200 + Math.random() * 250,
      height: 50 + Math.random() * 40,
      speed: 0.3 + Math.random() * 0.5,
      opacity: 0.08 + Math.random() * 0.1,
      update() {
        this.x += this.speed;
        if (this.x > weatherCanvas.width + 300) {
          this.x = -this.width - 100;
          this.y = 30 + Math.random() * (weatherCanvas.height * 0.5);
        }
      },
      draw(c) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        c.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        // Main body
        c.beginPath();
        c.ellipse(cx, cy, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
        c.fill();
        // Left bump
        c.beginPath();
        c.ellipse(cx - this.width * 0.25, cy + 8, this.width * 0.3, this.height * 0.5, 0, 0, Math.PI * 2);
        c.fill();
        // Right bump
        c.beginPath();
        c.ellipse(cx + this.width * 0.2, cy - 5, this.width * 0.35, this.height * 0.55, 0, 0, Math.PI * 2);
        c.fill();
      },
    });
  }
}

// ---------- Unit helpers ----------
function cToF(c) {
  return (c * 9) / 5 + 32;
}

function formatTemp(celsius) {
  if (state.unit === 'F') return `${Math.round(cToF(celsius))}°F`;
  return `${Math.round(celsius)}°C`;
}

function applyUnit() {
  unitToggle.textContent = state.unit === 'C' ? '°C' : '°F';
  unitToggle.setAttribute('aria-pressed', state.unit === 'F' ? 'true' : 'false');

  if (state.tempC !== null) {
    temperatureEl.textContent = formatTemp(state.tempC);
  }

  // Update 5-day forecast
  const tempSpans = forecastEl.querySelectorAll('.temp');
  state.forecastDays.forEach((day, i) => {
    if (tempSpans[i]) {
      tempSpans[i].textContent = `${formatTemp(day.max)} / ${formatTemp(day.min)}`;
    }
  });

  // Update hourly strip
  const hourTempSpans = hourlyEl.querySelectorAll('.hour-temp');
  state.hourlyEntries.forEach((hour, i) => {
    if (hourTempSpans[i]) {
      hourTempSpans[i].textContent = formatTemp(hour.temp);
    }
  });
}

function toggleUnit() {
  state.unit = state.unit === 'C' ? 'F' : 'C';
  localStorage.setItem('unit', state.unit);
  applyUnit();

  // Refresh document title with the new unit
  if (state.tempC != null && state.currentCity) {
    const condition = conditionEl.textContent || '';
    const temp = state.unit === 'F'
      ? Math.round(cToF(state.tempC))
      : Math.round(state.tempC);
    document.title = `${temp}° ${capitalize(condition)} — ${state.currentCity} | Weather View`;
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------- Custom error ----------
class WeatherApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'WeatherApiError';
    this.status = status;
  }
}

// ---------- Document title ----------
const DEFAULT_TITLE = 'Weather View — Your Sky, Your Way';

/**
 * Update the browser tab title to reflect the current weather.
 * Format: "23° Cloudy — New Delhi | Weather View"
 */
function updateDocumentTitle(data) {
  if (!data) {
    document.title = DEFAULT_TITLE;
    return;
  }

  const tempC = data.main?.temp;
  const condition = data.weather?.[0]?.main || '';
  const city = data.name || '';

  if (tempC == null || !city) {
    document.title = DEFAULT_TITLE;
    return;
  }

  const temp = state.unit === 'F' ? Math.round(cToF(tempC)) : Math.round(tempC);
  document.title = `${temp}° ${condition} — ${city} | Weather View`;
}

// ---------- Shared request helper ----------
async function requestJson(endpoint, params) {
  const query = new URLSearchParams({
    ...params,
    units: 'metric',
    appid: API_KEY,
  });
  const response = await fetch(`${BASE_URL}${endpoint}?${query}`);

  if (response.status !== 200) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body && body.message) message = body.message;
    } catch {
      // Response body wasn't JSON; keep the default message.
    }
    throw new WeatherApiError(message, response.status);
  }

  return response.json();
}

// ---------- Fetch weather ----------
async function fetchWeather(city, { forceRefresh = false } = {}) {
  const key = cacheKey('weather', city);
  if (!forceRefresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const data = await requestJson('/weather', { q: city });
  setCached(key, data);
  return data;
}

async function fetchWeatherByCoords(lat, lon, { forceRefresh = false } = {}) {
  const key = cacheKey('weather', `${lat},${lon}`);
  if (!forceRefresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const data = await requestJson('/weather', { lat, lon });
  setCached(key, data);
  return data;
}

// ---------- Fetch 5-day forecast ----------
async function fetchForecast(city, { forceRefresh = false } = {}) {
  const key = cacheKey('forecast', city);
  if (!forceRefresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const data = await requestJson('/forecast', { q: city });
  setCached(key, data);
  return data;
}

async function fetchForecastByCoords(lat, lon, { forceRefresh = false } = {}) {
  const key = cacheKey('forecast', `${lat},${lon}`);
  if (!forceRefresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const data = await requestJson('/forecast', { lat, lon });
  setCached(key, data);
  return data;
}

// ---------- Fetch air pollution ----------
async function fetchAirPollution(lat, lon, { forceRefresh = false } = {}) {
  const key = cacheKey('aqi', `${lat},${lon}`);
  if (!forceRefresh) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const data = await requestJson('/air_pollution', { lat, lon });
  setCached(key, data);
  return data;
}

// ---------- Pick one entry per day ----------
function pickDailyEntries(list) {
  const byDate = new Map();

  for (const entry of list) {
    const [date, time] = entry.dt_txt.split(' ');
    const hour = Number(time.slice(0, 2));
    const existing = byDate.get(date);

    if (!existing) {
      byDate.set(date, entry);
      continue;
    }

    const existingHour = Number(existing.dt_txt.slice(11, 13));
    const isCloserToNoon = Math.abs(hour - 12) < Math.abs(existingHour - 12);
    if (isCloserToNoon) byDate.set(date, entry);
  }

  return Array.from(byDate.values()).slice(0, 5);
}

// ---------- Render weather ----------
function renderWeather(data) {
  const { name, sys, main, weather, wind } = data;
  const condition = weather && weather[0] ? weather[0] : { description: '', icon: '01d', id: 800 };

  // Capture previous values for animation
  const prevTempC = state.tempC;
  const prevHumidity = parseFloat(humidityEl.textContent) || 0;
  const prevWind = parseFloat(windSpeedEl.textContent) || 0;

  // Store raw Celsius in state
  state.tempC = main.temp;
  state.currentCity = name;

  cityNameEl.textContent = sys && sys.country ? `${name}, ${sys.country}` : name;
  conditionEl.textContent = condition.description;

  // Animated counters
  const targetTemp = state.unit === 'F' ? cToF(main.temp) : main.temp;
  const tempUnit = state.unit === 'F' ? '°F' : '°C';
  const fromTemp = prevTempC == null
    ? targetTemp
    : (state.unit === 'F' ? cToF(prevTempC) : prevTempC);
  animateCounter(
    temperatureEl,
    fromTemp,
    targetTemp,
    600,
    (v) => `${Math.round(v)}${tempUnit}`
  );

  animateCounter(
    humidityEl,
    prevHumidity,
    main.humidity,
    600,
    (v) => `${Math.round(v)}%`
  );

  const targetWindKmh = Math.round(wind.speed * 3.6);
  animateCounter(
    windSpeedEl,
    prevWind,
    targetWindKmh,
    600,
    (v) => `${Math.round(v)} km/h`
  );

  // Visibility (meters in API response, max 10km)
  const visibilityKm = data.visibility != null
    ? Math.min(10, data.visibility / 1000)
    : null;
  if (visibilityKm != null) {
    visibilityEl.textContent = `${visibilityKm.toFixed(1)} km`;
  } else {
    visibilityEl.textContent = '—';
  }

  // UV index — not available on /weather (free plan). Display placeholder.
  // If main.uvi is provided (e.g. via One Call API), it'll populate.
  const uv = data.uvi != null ? data.uvi : (main.uvi != null ? main.uvi : null);
  if (uv != null) {
    uvIndexEl.textContent = uv.toFixed(1);
  } else {
    uvIndexEl.textContent = '—';
  }

  // Animate stat bar fills
  // humidity = raw %, wind = min(speed_kmh / 50 * 100, 100), uv = uv/11*100, visibility = km/10*100
  animateStatBar(humidityFillEl, main.humidity);
  animateStatBar(windFillEl, Math.min((targetWindKmh / 50) * 100, 100));
  animateStatBar(uvFillEl, uv != null ? Math.min((uv / 11) * 100, 100) : 0);
  animateStatBar(visibilityFillEl, visibilityKm != null ? (visibilityKm / 10) * 100 : 0);

  // Weather emoji instead of image
  weatherIconEl.textContent = getWeatherEmoji(condition.icon);
  weatherIconEl.setAttribute('aria-label', condition.description || 'Weather');

  // Sunrise/sunset arc
  renderSunArc(data);

  // Dynamic background
  const night = isNightTime(data);
  const weatherId = condition.id || 800;
  applyBgClass(getBgClass(weatherId, night));

  // Smart tips based on the new conditions
  renderTips(main.temp, weatherId, night);

  // Update document title to reflect current weather
  updateDocumentTitle(data);

  // Show and sync favorite button
  favoriteBtn.hidden = false;
  syncFavoriteBtn();

  // Pulse the card + stagger the stat rows
  replayAnimation(weatherCardEl, 'pulse');
  staggerSlideIn(weatherCardEl);

  // Mark sections as having data so they become visible
  weatherCardEl.classList.add('has-data');

  hideError();
}

// ---------- Render forecast ----------
function renderForecast(days) {
  // Store raw Celsius values in state for unit toggling
  state.forecastDays = days.map((entry) => ({
    min: entry.main.temp_min,
    max: entry.main.temp_max,
    icon: entry.weather && entry.weather[0] ? entry.weather[0].icon : '01d',
    description: entry.weather && entry.weather[0] ? entry.weather[0].description : '',
    dt: entry.dt,
  }));

  forecastEl.replaceChildren();

  const fragment = document.createDocumentFragment();
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

  for (const entry of state.forecastDays) {
    const date = new Date(entry.dt * 1000);

    const li = document.createElement('li');

    const day = document.createElement('span');
    day.className = 'day';
    day.textContent = dayFmt.format(date);

    const emoji = document.createElement('span');
    emoji.className = 'forecast-emoji';
    emoji.textContent = getWeatherEmoji(entry.icon);
    emoji.setAttribute('aria-hidden', 'true');

    const temp = document.createElement('span');
    temp.className = 'temp';
    temp.textContent = `${formatTemp(entry.max)} / ${formatTemp(entry.min)}`;

    li.append(day, emoji, temp);
    fragment.append(li);
  }

  forecastEl.append(fragment);

  // Show the forecast section
  forecastEl.closest('section')?.classList.add('has-data');
}

// ---------- Render hourly strip (next 24h = 8 x 3-hour entries) ----------
function renderHourly(list) {
  hourlyEl.replaceChildren();

  // Store raw Celsius for unit toggle
  state.hourlyEntries = list.slice(0, 8).map((entry) => ({
    dt: entry.dt,
    temp: entry.main.temp,
    icon: entry.weather && entry.weather[0] ? entry.weather[0].icon : '01d',
    description: entry.weather && entry.weather[0] ? entry.weather[0].description : '',
  }));

  const fragment = document.createDocumentFragment();
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  for (const entry of state.hourlyEntries) {
    const card = document.createElement('div');
    card.className = 'hour-card';
    card.setAttribute('role', 'listitem');

    const time = document.createElement('span');
    time.className = 'hour-time';
    time.textContent = timeFmt.format(new Date(entry.dt * 1000));

    const emoji = document.createElement('span');
    emoji.className = 'hour-emoji';
    emoji.textContent = getWeatherEmoji(entry.icon);
    emoji.setAttribute('aria-hidden', 'true');

    const temp = document.createElement('span');
    temp.className = 'hour-temp';
    temp.textContent = formatTemp(entry.temp);

    card.append(time, emoji, temp);
    fragment.append(card);
  }

  hourlyEl.append(fragment);

  // Show the hourly section
  hourlyEl.closest('section')?.classList.add('has-data');
}

// ---------- Render AQI ----------
const AQI_LABELS = {
  1: 'Good',
  2: 'Fair',
  3: 'Moderate',
  4: 'Poor',
  5: 'Very Poor',
};

function renderAQI(data) {
  if (!data || !data.list || !data.list[0]) {
    aqiWidgetEl.hidden = true;
    return;
  }

  const entry = data.list[0];
  const aqi = entry.main?.aqi;
  const components = entry.components || {};

  if (!aqi) {
    aqiWidgetEl.hidden = true;
    return;
  }

  // Badge
  aqiBadgeEl.dataset.aqi = String(aqi);
  aqiNumberEl.textContent = String(aqi);
  aqiBadgeEl.setAttribute('aria-label', `AQI ${aqi} ${AQI_LABELS[aqi]}`);

  // Label
  aqiLabelEl.textContent = AQI_LABELS[aqi] || 'Unknown';

  // Pollutant pills (round to 1 decimal)
  aqiPm25El.textContent = formatNumber(components.pm2_5);
  aqiCoEl.textContent = formatNumber(components.co);
  aqiO3El.textContent = formatNumber(components.o3);

  aqiWidgetEl.hidden = false;
  aqiWidgetEl.classList.add('has-data');
  staggerSlideIn(aqiWidgetEl);
}

function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 100) return Math.round(value).toString();
  return value.toFixed(1);
}

// ---------- Smart tips ----------
/**
 * Build tip lists from current conditions.
 * @param {number} temp     Temperature in Celsius
 * @param {number} conditionId  OpenWeatherMap condition id
 * @param {boolean} isNight
 * @returns {{ clothing: Array<{icon,text}>, activities: Array<{icon,text}> }}
 */
function getTips(temp, conditionId, isNight) {
  const clothing = [];
  const activities = [];
  const group = Math.floor((conditionId || 800) / 100);
  const isRainy = group === 3 || group === 5;
  const isSnowy = group === 6;
  const isStormy = group === 2;
  const isClear = conditionId === 800;
  const isCloudy = group === 8 && !isClear;

  // ---- Clothing by temperature ----
  if (temp < 5) {
    clothing.push({ icon: '🧥', text: 'Heavy coat' });
    clothing.push({ icon: '🧣', text: 'Scarf' });
    clothing.push({ icon: '🧤', text: 'Gloves' });
  } else if (temp < 15) {
    clothing.push({ icon: '🧥', text: 'Light jacket' });
    clothing.push({ icon: '👖', text: 'Long pants' });
  } else if (temp < 25) {
    clothing.push({ icon: '👕', text: 'T-shirt' });
    clothing.push({ icon: '🧶', text: 'Light layer' });
  } else {
    clothing.push({ icon: '🩳', text: 'Shorts' });
    clothing.push({ icon: '🧴', text: 'Sunscreen' });
    clothing.push({ icon: '🕶️', text: 'Sunglasses' });
  }

  // ---- Clothing by condition (overrides/adds) ----
  if (isRainy || isStormy) {
    clothing.unshift({ icon: '☔', text: 'Umbrella' });
    clothing.push({ icon: '🥾', text: 'Waterproof boots' });
  }
  if (isSnowy) {
    clothing.push({ icon: '🥾', text: 'Snow boots' });
  }

  // ---- Activities ----
  if ((isClear || isCloudy) && temp >= 15 && !isNight) {
    activities.push({ icon: '🚴', text: 'Cycling' });
    activities.push({ icon: '🧺', text: 'Picnic' });
    activities.push({ icon: '🚶', text: 'Walk in the park' });
  } else if (isRainy || isStormy) {
    activities.push({ icon: '🏛️', text: 'Visit a museum' });
    activities.push({ icon: '📖', text: 'Read indoors' });
    activities.push({ icon: '🎬', text: 'Watch a movie' });
  } else if (temp < 5 || isSnowy) {
    activities.push({ icon: '🏋️', text: 'Hit the gym' });
    activities.push({ icon: '☕', text: 'Hot drinks' });
    activities.push({ icon: '🍲', text: 'Comfort food' });
  } else if (isNight) {
    activities.push({ icon: '🌙', text: 'Stargazing' });
    activities.push({ icon: '📚', text: 'Read at home' });
  } else {
    activities.push({ icon: '🚶', text: 'Take a walk' });
    activities.push({ icon: '☕', text: 'Coffee outside' });
  }

  if (isNight) {
    activities.push({ icon: '🌃', text: 'Avoid outdoor runs' });
  }

  return {
    clothing: clothing.slice(0, 3),
    activities: activities.slice(0, 3),
  };
}

function renderTips(temp, conditionId, isNight) {
  const tips = getTips(temp, conditionId, isNight);

  renderTipList(tipsClothingEl, tips.clothing);
  renderTipList(tipsActivitiesEl, tips.activities);

  tipsWidgetEl.hidden = false;
  tipsWidgetEl.classList.add('has-data');
  staggerSlideIn(tipsWidgetEl);
}

function renderTipList(listEl, items) {
  listEl.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'tip-pill';

    const icon = document.createElement('span');
    icon.className = 'tip-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.icon;

    const label = document.createElement('span');
    label.textContent = item.text;

    li.append(icon, label);
    fragment.append(li);
  }
  listEl.append(fragment);
}

// ---------- Sunrise/sunset arc ----------
let sunArcLength = null;
let sunRafId = null;

function getSunArcLength() {
  if (sunArcLength == null) {
    sunArcLength = sunArcProgressEl.getTotalLength();
    // Initialize the progress arc to be hidden; we'll reveal a portion of it.
    sunArcProgressEl.style.strokeDasharray = `${sunArcLength}`;
    sunArcProgressEl.style.strokeDashoffset = `${sunArcLength}`;
  }
  return sunArcLength;
}

function formatTimeFromUnix(unix, tzOffsetSec = 0) {
  // Apply API timezone offset so we show the location's local time.
  const ms = (unix + tzOffsetSec) * 1000;
  const d = new Date(ms);
  // Use UTC getters because we already shifted by the offset.
  let hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12; // convert 0 → 12, 13 → 1, etc.
  return `${hours}:${minutes} ${period}`;
}

function renderSunArc(data) {
  const sys = data?.sys;
  if (!sys || sys.sunrise == null || sys.sunset == null) {
    sunArcEl.hidden = true;
    return;
  }

  const tzOffset = data.timezone || 0;
  sunriseTimeEl.textContent = formatTimeFromUnix(sys.sunrise, tzOffset);
  sunsetTimeEl.textContent = formatTimeFromUnix(sys.sunset, tzOffset);
  sunArcEl.hidden = false;

  // Compute progress through the day.
  // Use the location's "now" by adjusting current time with the same tz offset
  // and comparing against the same shifted sunrise/sunset.
  const nowLocal = (Date.now() / 1000) + tzOffset;
  const sunriseLocal = sys.sunrise + tzOffset;
  const sunsetLocal = sys.sunset + tzOffset;

  let progress = (nowLocal - sunriseLocal) / (sunsetLocal - sunriseLocal);
  progress = Math.max(0, Math.min(1, progress));

  drawSunPosition(progress);
}

function drawSunPosition(progress) {
  const length = getSunArcLength();

  // Position the dot along the path
  const point = sunArcProgressEl.getPointAtLength(length * progress);
  sunDotEl.setAttribute('cx', point.x.toFixed(2));
  sunDotEl.setAttribute('cy', point.y.toFixed(2));

  // Dim the dot if the sun is below the horizon (night)
  sunDotEl.style.opacity = progress > 0 && progress < 1 ? '1' : '0.35';

  // Animate the filled progress arc with stroke-dashoffset
  if (sunRafId) cancelAnimationFrame(sunRafId);

  const target = length - length * progress;
  const start = parseFloat(sunArcProgressEl.style.strokeDashoffset) || length;
  const duration = 800;
  const t0 = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - t0) / duration);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    const value = start + (target - start) * eased;
    sunArcProgressEl.style.strokeDashoffset = String(value);

    if (t < 1) {
      sunRafId = requestAnimationFrame(frame);
    } else {
      sunRafId = null;
    }
  }

  sunRafId = requestAnimationFrame(frame);
}

// ---------- History ----------
function saveHistory(city, country) {
  const cityName = (typeof city === 'string' ? city : city?.name || '').trim();
  if (!cityName) return;

  const normalized = cityName.toLowerCase();
  // Remove existing duplicate (case-insensitive)
  state.history = state.history.filter((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.name || '';
    return name.toLowerCase() !== normalized;
  });

  // Always store as object going forward
  state.history.unshift({ name: cityName, country: country || '' });
  state.history = state.history.slice(0, 5);
  localStorage.setItem('history', JSON.stringify(state.history));
  renderHistory();
}

// Helpers to read entries that may be legacy strings
function entryName(entry) {
  return typeof entry === 'string' ? entry : entry?.name || '';
}

function entryCountry(entry) {
  return typeof entry === 'string' ? '' : entry?.country || '';
}

function countryToFlag(code) {
  if (!code || code.length !== 2) return '📍';
  const A = 0x1f1e6;
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    A + (upper.charCodeAt(0) - 65),
    A + (upper.charCodeAt(1) - 65)
  );
}

function renderHistory() {
  historyEl.replaceChildren();
  const clearBtn = document.getElementById('clear-history-btn');

  if (state.history.length === 0) {
    historyEl.hidden = true;
    if (clearBtn) clearBtn.hidden = true;
    return;
  }

  historyEl.hidden = false;
  if (clearBtn) clearBtn.hidden = false;
  const fragment = document.createDocumentFragment();

  for (const entry of state.history) {
    const cityName = entryName(entry);
    if (!cityName) continue;

    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-pill';
    btn.setAttribute('aria-label', `Search weather for ${cityName}`);

    const isFav = state.favorites.some(
      (f) => entryName(f).toLowerCase() === cityName.toLowerCase()
    );
    if (isFav) {
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '★';
      star.setAttribute('aria-hidden', 'true');
      btn.append(star);
    }

    btn.append(document.createTextNode(cityName));

    btn.addEventListener('click', () => {
      cityInput.value = cityName;
      handleSearch();
    });

    li.append(btn);
    fragment.append(li);
  }

  historyEl.append(fragment);
}

function clearHistory() {
  state.history = [];
  localStorage.removeItem('history');
  renderHistory();
}

// ---------- Favorites ----------
function isFavorite(city) {
  return state.favorites.some(
    (f) => entryName(f).toLowerCase() === city.toLowerCase()
  );
}

function toggleFavorite() {
  if (!state.currentCity) return;

  const cityLower = state.currentCity.toLowerCase();
  if (isFavorite(state.currentCity)) {
    state.favorites = state.favorites.filter(
      (f) => entryName(f).toLowerCase() !== cityLower
    );
  } else {
    // Find country from history for richer favorites
    const match = state.history.find(
      (e) => entryName(e).toLowerCase() === cityLower
    );
    state.favorites.push({
      name: state.currentCity,
      country: entryCountry(match),
    });
  }

  localStorage.setItem('favorites', JSON.stringify(state.favorites));
  syncFavoriteBtn();
  renderHistory();
}

function syncFavoriteBtn() {
  if (!state.currentCity) return;
  const fav = isFavorite(state.currentCity);
  favoriteBtn.textContent = fav ? '★' : '☆';
  favoriteBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
  favoriteBtn.setAttribute(
    'aria-label',
    fav ? 'Remove from favorites' : 'Add to favorites'
  );
}

// ---------- Autocomplete ----------
let autocompleteIndex = -1;

function getSuggestions(prefix) {
  const seen = new Set();
  const results = [];

  // Favorites first, then history
  const sources = [
    ...state.favorites.map((e) => ({ ...normalizeEntry(e), isFav: true })),
    ...state.history.map((e) => ({ ...normalizeEntry(e), isFav: false })),
  ];

  const lower = prefix.toLowerCase();

  for (const item of sources) {
    if (!item.name) continue;
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    if (lower && !key.startsWith(lower)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= 5) break;
  }

  return results;
}

function normalizeEntry(entry) {
  if (typeof entry === 'string') return { name: entry, country: '' };
  return { name: entry?.name || '', country: entry?.country || '' };
}

function renderAutocomplete(prefix) {
  const suggestions = getSuggestions(prefix);
  autocompleteEl.replaceChildren();
  autocompleteIndex = -1;

  if (suggestions.length === 0) {
    autocompleteEl.hidden = true;
    cityInput.setAttribute('aria-expanded', 'false');
    return;
  }

  const fragment = document.createDocumentFragment();
  suggestions.forEach((item, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.index = String(i);
    li.dataset.city = item.name;

    const flag = document.createElement('span');
    flag.className = 'flag';
    flag.setAttribute('aria-hidden', 'true');
    flag.textContent = countryToFlag(item.country);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.country
      ? `${item.name}, ${item.country}`
      : item.name;

    li.append(flag, name);

    if (item.isFav) {
      const badge = document.createElement('span');
      badge.className = 'badge fav';
      badge.textContent = '★';
      badge.setAttribute('aria-label', 'Favorite');
      li.append(badge);
    }

    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep input focused
      selectSuggestion(item.name);
    });

    fragment.append(li);
  });

  autocompleteEl.append(fragment);
  autocompleteEl.hidden = false;
  cityInput.setAttribute('aria-expanded', 'true');
}

function hideAutocomplete() {
  autocompleteEl.hidden = true;
  autocompleteIndex = -1;
  cityInput.setAttribute('aria-expanded', 'false');
}

function highlightSuggestion(index) {
  const items = autocompleteEl.querySelectorAll('li');
  if (items.length === 0) return;

  // Wrap around
  if (index < 0) index = items.length - 1;
  if (index >= items.length) index = 0;
  autocompleteIndex = index;

  items.forEach((li, i) => {
    li.setAttribute('aria-selected', i === index ? 'true' : 'false');
    if (i === index) li.scrollIntoView({ block: 'nearest' });
  });
}

function selectSuggestion(cityName) {
  cityInput.value = cityName;
  hideAutocomplete();
  handleSearch();
}

// ---------- Error UI ----------
let errorAutoHideTimer = null;

function showError(message) {
  const p = errorMsgEl.querySelector('p') || errorMsgEl;
  p.textContent = message;
  errorMsgEl.hidden = false;

  // Auto-hide after 5 seconds
  clearTimeout(errorAutoHideTimer);
  errorAutoHideTimer = setTimeout(hideError, 5000);
}

function hideError() {
  clearTimeout(errorAutoHideTimer);
  errorMsgEl.hidden = true;
}

/**
 * Map HTTP status codes to user-friendly messages.
 */
function getErrorMessage(err, context) {
  if (!navigator.onLine) {
    return 'You appear to be offline. Check your internet connection and try again.';
  }

  if (err instanceof WeatherApiError) {
    const status = err.status;
    if (status === 401) {
      return 'Invalid API key. Please check your config.js file.';
    }
    if (status === 404) {
      return `City not found: "${context}". Please check the spelling and try again.`;
    }
    if (status === 429) {
      return 'Too many requests. You\'ve hit the rate limit — please wait a minute and try again.';
    }
    if (status >= 500) {
      return 'Weather service is temporarily unavailable. Please try again later.';
    }
    return `Could not load weather for "${context}": ${err.message}`;
  }

  // Network / fetch errors
  if (!navigator.onLine) {
    return 'You appear to be offline. Check your internet connection and try again.';
  }
  return 'Network error. Please check your connection and try again.';
}

// ---------- Geolocation handler ----------
function handleGeolocation() {
  if (!('geolocation' in navigator)) {
    showError('Geolocation is not supported by your browser.');
    return;
  }

  geoBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude: lat, longitude: lon } = position.coords;
      setLoading(true);
      try {
        const [weather, forecast] = await Promise.all([
          fetchWeatherByCoords(lat, lon),
          fetchForecastByCoords(lat, lon),
        ]);
        renderWeather(weather);
        renderHourly(forecast.list);
        renderForecast(pickDailyEntries(forecast.list));
        saveHistory(weather.name, weather.sys?.country);

        // Remember the last query for pull-to-refresh
        state.lastQuery = { type: 'coords', value: { lat, lon } };

        // AQI from the user's coordinates
        try {
          const aqi = await fetchAirPollution(lat, lon);
          renderAQI(aqi);
        } catch (aqiErr) {
          console.warn('AQI fetch failed:', aqiErr);
          aqiWidgetEl.hidden = true;
        }
      } catch (err) {
        showError(getErrorMessage(err, 'your location'));
        console.error(err);
      } finally {
        geoBtn.disabled = false;
        setLoading(false);
      }
    },
    (error) => {
      geoBtn.disabled = false;
      let message;
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message =
            'Location access was denied. Enable it in your browser settings or search by city instead.';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'Your location is currently unavailable. Please try again.';
          break;
        case error.TIMEOUT:
          message = 'Locating you took too long. Please try again.';
          break;
        default:
          message = 'Unable to retrieve your location.';
      }
      showError(message);
      console.error(error);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
  );
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  if (isLoading) {
    weatherSkeletonEl.hidden = false;
    weatherCardEl.classList.add('loading');
  } else {
    weatherSkeletonEl.hidden = true;
    weatherCardEl.classList.remove('loading');
  }
}

// ---------- Search handler ----------
async function handleSearch({ forceRefresh = false } = {}) {
  const raw = cityInput.value;
  const city = sanitizeCity(raw);

  // Update input with sanitized value
  cityInput.value = city;

  if (!city) {
    showError('Please enter a valid city name.');
    return;
  }

  if (!navigator.onLine) {
    showError('You appear to be offline. Check your internet connection and try again.');
    return;
  }

  setLoading(true);

  try {
    const [weather, forecast] = await Promise.all([
      fetchWeather(city, { forceRefresh }),
      fetchForecast(city, { forceRefresh }),
    ]);
    renderWeather(weather);
    renderHourly(forecast.list);
    renderForecast(pickDailyEntries(forecast.list));
    saveHistory(weather.name, weather.sys?.country);

    // Remember the last query for pull-to-refresh
    state.lastQuery = { type: 'city', value: weather.name };

    // Fetch and render AQI using the coords from the weather response
    if (weather.coord) {
      try {
        const aqi = await fetchAirPollution(
          weather.coord.lat,
          weather.coord.lon,
          { forceRefresh }
        );
        renderAQI(aqi);
      } catch (aqiErr) {
        console.warn('AQI fetch failed:', aqiErr);
        aqiWidgetEl.hidden = true;
      }
    }
  } catch (err) {
    showError(getErrorMessage(err, city));
    console.error(err);
  } finally {
    setLoading(false);
  }
}

// ---------- Event listeners ----------
searchBtn.addEventListener('click', (e) => {
  e.preventDefault();
  hideAutocomplete();
  handleSearch();
});

// Form submit (covers Enter key on the input)
document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  // If a suggestion is highlighted, use it; otherwise plain search
  if (autocompleteIndex >= 0) {
    const items = autocompleteEl.querySelectorAll('li');
    const selected = items[autocompleteIndex];
    if (selected) {
      selectSuggestion(selected.dataset.city);
      return;
    }
  }
  hideAutocomplete();
  handleSearch();
});

// Filter suggestions on every input change (case-insensitive prefix match)
cityInput.addEventListener('input', () => {
  renderAutocomplete(cityInput.value.trim());
});

// Show suggestions when input gains focus (if there are any)
cityInput.addEventListener('focus', () => {
  renderAutocomplete(cityInput.value.trim());
});

// Hide suggestions when clicking outside the search section
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-section')) hideAutocomplete();
});

// Keyboard navigation for autocomplete
cityInput.addEventListener('keydown', (e) => {
  const open = !autocompleteEl.hidden;

  if (e.key === 'ArrowDown') {
    if (!open) {
      renderAutocomplete(cityInput.value.trim());
    }
    if (!autocompleteEl.hidden) {
      e.preventDefault();
      highlightSuggestion(autocompleteIndex + 1);
    }
    return;
  }

  if (e.key === 'ArrowUp' && open) {
    e.preventDefault();
    highlightSuggestion(autocompleteIndex - 1);
    return;
  }

  if (e.key === 'Escape') {
    hideAutocomplete();
    return;
  }
  // Enter is handled by the form's submit listener above.
});

// Debounced search on typing — waits 400ms after user stops typing
const debouncedSearch = debounce(() => {
  const city = sanitizeCity(cityInput.value);
  if (city.length >= 3) {
    handleSearch();
  }
}, 400);

cityInput.addEventListener('keyup', (e) => {
  if (
    e.key === 'Enter' ||
    e.key === 'Escape' ||
    e.key.startsWith('Arrow')
  ) return;
  debouncedSearch();
});

geoBtn.addEventListener('click', handleGeolocation);
unitToggle.addEventListener('click', toggleUnit);
favoriteBtn.addEventListener('click', toggleFavorite);
themeToggle.addEventListener('click', toggleTheme);

// ---------- Theme (dark / light) ----------
const SUN_ICON_PATHS = `
  <circle cx="12" cy="12" r="4"></circle>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
`;
const MOON_ICON_PATHS = `
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
`;

function initTheme() {
  const stored = localStorage.getItem('theme');
  let isDark;

  if (stored === 'dark' || stored === 'light') {
    isDark = stored === 'dark';
  } else if (window.matchMedia) {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else {
    isDark = false;
  }

  applyTheme(isDark);

  // Follow system changes only when the user hasn't set a manual preference
  if (window.matchMedia && !stored) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', (e) => {
      if (!localStorage.getItem('theme')) applyTheme(e.matches);
    });
  }
}

function applyTheme(isDark) {
  document.body.classList.toggle('dark', isDark);
  themeIcon.innerHTML = isDark ? SUN_ICON_PATHS : MOON_ICON_PATHS;
  themeToggle.setAttribute(
    'aria-label',
    isDark ? 'Switch to light mode' : 'Switch to dark mode'
  );
  themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
}

function toggleTheme() {
  const isDark = !document.body.classList.contains('dark');
  applyTheme(isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Listen for online/offline events
window.addEventListener('offline', () => {
  showError('You are offline. Weather data may be outdated.');
});

window.addEventListener('online', () => {
  hideError();
});

// ---------- Pull-to-refresh ----------
const PTR_THRESHOLD = 60;
const PTR_MAX = 120;
let ptrStartY = null;
let ptrDelta = 0;
let ptrActive = false;

async function refreshLastQuery() {
  if (state.isLoading) return;
  if (!state.lastQuery) return;

  ptrIndicator.classList.add('spinning');

  try {
    if (state.lastQuery.type === 'city') {
      cityInput.value = state.lastQuery.value;
      await handleSearch({ forceRefresh: true });
    } else {
      const { lat, lon } = state.lastQuery.value;
      setLoading(true);
      try {
        const [weather, forecast] = await Promise.all([
          fetchWeatherByCoords(lat, lon, { forceRefresh: true }),
          fetchForecastByCoords(lat, lon, { forceRefresh: true }),
        ]);
        renderWeather(weather);
        renderHourly(forecast.list);
        renderForecast(pickDailyEntries(forecast.list));
        try {
          const aqi = await fetchAirPollution(lat, lon, { forceRefresh: true });
          renderAQI(aqi);
        } catch {
          aqiWidgetEl.hidden = true;
        }
      } catch (err) {
        showError(getErrorMessage(err, 'your location'));
      } finally {
        setLoading(false);
      }
    }
  } finally {
    ptrIndicator.classList.remove('spinning');
    hidePtrIndicator();
  }
}

function showPtrIndicator(distance) {
  const clamped = Math.min(distance, PTR_MAX);
  // Translate from -80px (hidden) towards 12px as user pulls
  const y = -80 + clamped;
  // Rotate the icon proportionally — 360deg at threshold
  const rotation = Math.min(360, (clamped / PTR_THRESHOLD) * 360);
  ptrIndicator.style.transform = `translate(-50%, ${y}px) rotate(${rotation}deg)`;
  ptrIndicator.classList.add('visible');
}

function hidePtrIndicator() {
  ptrIndicator.classList.remove('visible');
  ptrIndicator.style.transform = 'translate(-50%, -80px) rotate(0deg)';
}

// Only trigger PTR when scrolled to the top of the page
function isAtPageTop() {
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
}

document.addEventListener('touchstart', (e) => {
  if (state.isLoading) return;
  if (!isAtPageTop()) return;
  ptrStartY = e.touches[0].clientY;
  ptrDelta = 0;
  ptrActive = true;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!ptrActive || ptrStartY == null) return;
  const currentY = e.touches[0].clientY;
  ptrDelta = currentY - ptrStartY;

  if (ptrDelta > 0 && isAtPageTop()) {
    showPtrIndicator(ptrDelta);
  } else {
    hidePtrIndicator();
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  if (!ptrActive) return;
  ptrActive = false;

  if (ptrDelta > PTR_THRESHOLD && !state.isLoading && state.lastQuery) {
    refreshLastQuery();
  } else {
    hidePtrIndicator();
  }

  ptrStartY = null;
  ptrDelta = 0;
});
applyUnit();
renderHistory();
initTheme();
initSplash();
initSidebar();
initNavbarAutoHide();
initClearHistory();
autoFetchLocation();
initSidebarPanels();

/**
 * Clear history button
 */
function initClearHistory() {
  const clearBtn = document.getElementById('clear-history-btn');
  if (!clearBtn) return;
  clearBtn.addEventListener('click', clearHistory);
}

/**
 * Show an animated notification prompting the user to tap the geo button.
 * Does NOT auto-fetch location.
 */
function autoFetchLocation() {
  // Don't show if user already has data from a previous session
  if (state.lastQuery) return;

  // Create the notification toast
  const toast = document.createElement('div');
  toast.id = 'geo-toast';
  toast.className = 'geo-toast';
  toast.innerHTML = `
    <span class="geo-toast-icon">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>
      </svg>
    </span>
    <span class="geo-toast-text">Tap <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin:0 3px;opacity:0.8;"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg> to get your local weather</span>
    <button class="geo-toast-close" aria-label="Dismiss">&times;</button>
  `;
  document.body.appendChild(toast);

  // Animate in after a short delay (let splash finish first)
  setTimeout(() => toast.classList.add('visible'), 2800);

  // Auto-dismiss after 8 seconds
  const autoDismiss = setTimeout(() => dismissGeoToast(toast), 8000);

  // Close on click
  toast.querySelector('.geo-toast-close').addEventListener('click', () => {
    clearTimeout(autoDismiss);
    dismissGeoToast(toast);
  });

  // Also dismiss when user clicks the geo button
  const geoBtn = document.getElementById('geo-btn');
  if (geoBtn) {
    geoBtn.addEventListener('click', () => {
      clearTimeout(autoDismiss);
      dismissGeoToast(toast);
    }, { once: true });
  }
}

function dismissGeoToast(toast) {
  if (!toast) return;
  toast.classList.remove('visible');
  toast.classList.add('hiding');
  setTimeout(() => toast.remove(), 400);
}


/**
 * Auto-hide navbar on scroll down, show on scroll up.
 */
function initNavbarAutoHide() {
  const navbar = document.querySelector('.app-navbar');
  if (!navbar) return;

  let lastScrollY = window.scrollY;
  let ticking = false;
  const THRESHOLD = 30; // px scrolled before hiding (faster response)

  function onScroll() {
    const currentY = window.scrollY;

    if (currentY > lastScrollY && currentY > THRESHOLD) {
      // Scrolling down — hide
      navbar.classList.add('nav-hidden');
    } else {
      // Scrolling up — show
      navbar.classList.remove('nav-hidden');
    }

    lastScrollY = currentY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
}

/**
 * Sidebar — sliding nav panel with backdrop.
 */
function initSidebar() {
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!menuBtn || !sidebar || !backdrop) return;

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('sidebar-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'false');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('sidebar-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    sidebar.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
  }

  menuBtn.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });

  // Click on backdrop closes
  backdrop.addEventListener('click', closeSidebar);

  // Click outside sidebar closes (covers cases where backdrop didn't catch)
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('open')) return;
    if (sidebar.contains(e.target)) return;
    if (menuBtn.contains(e.target)) return;
    closeSidebar();
  });

  // Escape closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
      menuBtn.focus();
    }
  });

  // Nav link actions — currently lightweight placeholders
  sidebar.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const action = link.dataset.action;

      switch (action) {
        case 'home':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'favorites':
        case 'history':
          // Scroll to the history pills below the search bar
          document
            .getElementById('history')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        case 'settings':
        case 'about':
          // Placeholder — no dedicated screen yet
          console.info(`[sidebar] "${action}" link clicked`);
          break;
      }

      closeSidebar();
    });
  });
}

/**
 * Splash screen — fades out 2200ms after the DOM is ready,
 * then reveals the app with a 0.5s opacity transition.
 */
function initSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const HOLD_MS = 2200;
  const FADE_MS = 500;

  const start = () => {
    setTimeout(() => {
      splash.classList.add('fade-out');
      // Reveal the rest of the app while the splash fades out
      document.body.classList.remove('splash-active');

      // Once the fade finishes, fully remove the overlay from layout
      setTimeout(() => {
        splash.hidden = true;
      }, FADE_MS);
    }, HOLD_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

// ---------- Sidebar panels ----------
function initSidebarPanels() {
  const backdrop = document.getElementById('panel-backdrop');

  // Open panel helper
  function openPanel(id) {
    closeAllPanels();
    const panel = document.getElementById(`panel-${id}`);
    if (!panel) return;
    panel.hidden = false;
    panel.style.visibility = 'visible';
    panel.style.pointerEvents = 'auto';
    backdrop.hidden = false;
    backdrop.style.visibility = 'visible';
    backdrop.style.pointerEvents = 'auto';
    // Populate content
    if (id === 'favorites') renderFavoritesPanel();
    if (id === 'history') renderHistoryPanel();
    if (id === 'settings') syncSettingsPanel();
  }

  function closeAllPanels() {
    ['favorites', 'history', 'settings', 'about'].forEach((id) => {
      const p = document.getElementById(`panel-${id}`);
      if (p) {
        p.hidden = true;
        p.style.visibility = 'hidden';
        p.style.pointerEvents = 'none';
      }
    });
    backdrop.hidden = true;
    backdrop.style.visibility = 'hidden';
    backdrop.style.pointerEvents = 'none';
  }

  // Close buttons
  document.querySelectorAll('.side-panel-close').forEach((btn) => {
    btn.addEventListener('click', closeAllPanels);
  });

  // Backdrop click closes
  backdrop.addEventListener('click', closeAllPanels);

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllPanels();
  });

  // Wire sidebar nav links
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.querySelectorAll('.sidebar-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const action = link.dataset.action;

        // Close the sidebar first
        const menuBtn = document.getElementById('menu-btn');
        sidebar.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('open');
        document.body.classList.remove('sidebar-open');
        menuBtn?.setAttribute('aria-expanded', 'false');

        switch (action) {
          case 'home':
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;
          case 'favorites':
            openPanel('favorites');
            break;
          case 'history':
            openPanel('history');
            break;
          case 'settings':
            openPanel('settings');
            break;
          case 'about':
            openPanel('about');
            break;
        }
      });
    });
  }

  // ---- Favorites panel ----
  function renderFavoritesPanel() {
    const list = document.getElementById('favorites-list');
    const empty = document.getElementById('favorites-empty');
    list.replaceChildren();

    if (state.favorites.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    state.favorites.forEach((entry) => {
      const name = entryName(entry);
      const li = document.createElement('li');

      const nameBtn = document.createElement('span');
      nameBtn.className = 'item-name';
      nameBtn.textContent = `⭐ ${name}`;
      nameBtn.addEventListener('click', () => {
        cityInput.value = name;
        handleSearch();
        closeAllPanels();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'item-delete';
      delBtn.textContent = '✕';
      delBtn.setAttribute('aria-label', `Remove ${name} from favorites`);
      delBtn.addEventListener('click', () => {
        state.favorites = state.favorites.filter(
          (f) => entryName(f).toLowerCase() !== name.toLowerCase()
        );
        localStorage.setItem('favorites', JSON.stringify(state.favorites));
        syncFavoriteBtn();
        renderHistory();
        renderFavoritesPanel();
      });

      li.append(nameBtn, delBtn);
      list.append(li);
    });
  }

  // ---- History panel ----
  function renderHistoryPanel() {
    const list = document.getElementById('history-panel-list');
    const empty = document.getElementById('history-panel-empty');
    list.replaceChildren();

    if (state.history.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    state.history.forEach((entry) => {
      const name = entryName(entry);
      const li = document.createElement('li');

      const nameBtn = document.createElement('span');
      nameBtn.className = 'item-name';
      nameBtn.textContent = `🕐 ${name}`;
      nameBtn.addEventListener('click', () => {
        cityInput.value = name;
        handleSearch();
        closeAllPanels();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'item-delete';
      delBtn.textContent = '✕';
      delBtn.setAttribute('aria-label', `Remove ${name} from history`);
      delBtn.addEventListener('click', () => {
        state.history = state.history.filter(
          (h) => entryName(h).toLowerCase() !== name.toLowerCase()
        );
        localStorage.setItem('history', JSON.stringify(state.history));
        renderHistory();
        renderHistoryPanel();
      });

      li.append(nameBtn, delBtn);
      list.append(li);
    });
  }

  // Clear all history from panel
  document.getElementById('clear-all-history-btn')?.addEventListener('click', () => {
    clearHistory();
    renderHistoryPanel();
  });

  // ---- Settings panel ----
  function syncSettingsPanel() {
    const unitBtn = document.getElementById('settings-unit-btn');
    const themeBtn = document.getElementById('settings-theme-btn');
    if (unitBtn) unitBtn.textContent = state.unit === 'C' ? '°C' : '°F';
    if (themeBtn) themeBtn.textContent = document.body.classList.contains('dark') ? '🌙 Dark' : '☀️ Light';
  }

  document.getElementById('settings-unit-btn')?.addEventListener('click', () => {
    toggleUnit();
    syncSettingsPanel();
  });

  document.getElementById('settings-theme-btn')?.addEventListener('click', () => {
    toggleTheme();
    syncSettingsPanel();
  });

  document.getElementById('settings-clear-btn')?.addEventListener('click', () => {
    if (confirm('Clear all history and favorites?')) {
      clearHistory();
      state.favorites = [];
      localStorage.removeItem('favorites');
      syncFavoriteBtn();
      renderHistory();
      syncSettingsPanel();
      showError('All data cleared.');
    }
  });
}
