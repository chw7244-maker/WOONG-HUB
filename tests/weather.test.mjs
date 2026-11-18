import assert from 'node:assert/strict';
import test from 'node:test';
import { initial, validateData } from '../src/lib/store.ts';
import { weatherCities } from '../src/lib/weather-cities.ts';
import { forecastUrl, parseForecast } from '../src/lib/weather.ts';

test('Suwon is the default and new and previously saved cities are valid', () => {
  assert.equal(initial.preferences.city, 'suwon');
  assert.equal(Object.keys(weatherCities).length, 41);
  for (const city of ['seoul', 'busan', 'incheon', 'daegu', 'daejeon', 'gwangju', 'jeju', 'yongin', 'seogwipo']) {
    const saved = { ...initial, preferences: { ...initial.preferences, city } };
    assert.equal(validateData(saved).preferences.city, city);
  }
  const url = new URL(forecastUrl(initial.preferences.city));
  assert.equal(url.searchParams.get('latitude'), '37.2636');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Seoul');
  assert.equal(url.searchParams.get('forecast_days'), '7');
});

test('Forecasts include 24 local hours across midnight and seven days, preserving zero and missing probabilities', () => {
  const hours = Array.from({ length: 48 }, (_, i) =>
    `2026-11-${i < 24 ? '17' : '18'}T${String(i % 24).padStart(2, '0')}:00`,
  );
  const days = Array.from({ length: 7 }, (_, i) => `2026-11-${17 + i}`);
  const forecast = parseForecast({
    current: { time: '2026-11-17T23:45', temperature_2m: 2.1, weather_code: 0, is_day: 0 },
    hourly: { time: hours, temperature_2m: hours.map(() => 2), precipitation_probability: { ...hours, 23: 0 } },
    daily: { time: days, temperature_2m_max: days.map(() => 10), precipitation_probability_max: [0, null, 30] },
  });
  assert.equal(forecast.current.night, true);
  assert.equal(forecast.hours.length, 24);
  assert.equal(forecast.hours[0].time, '2026-11-17T23:00');
  assert.equal(forecast.hours[1].time, '2026-11-18T00:00');
  assert.equal(forecast.hours.at(-1).time, '2026-11-18T22:00');
  assert.equal(forecast.hours[0].temperature, 2);
  assert.equal(forecast.hours[0].rain, null);
  assert.equal(forecast.days.length, 7);
  assert.deepEqual(forecast.days.slice(0, 3).map(day => day.rain), [0, null, 30]);
});

test('A partial response can show current weather and missing current weather is rejected', () => {
  const forecast = parseForecast({ current: { time: '2026-11-17T23:45', temperature_2m: 0 } });
  assert.equal(forecast.current.temperature, 0);
  assert.deepEqual(forecast.hours, []);
  assert.deepEqual(forecast.days, []);
  assert.throws(() => parseForecast({ current: { time: '2026-11-17T23:45', temperature_2m: null } }));
});
