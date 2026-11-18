import { weatherCities } from './weather-cities.ts';

export function forecastUrl(city: string) {
  const { lat, lon } = weatherCities[city];
  const query = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '7',
    timezone: 'Asia/Seoul',
  });
  return `https://api.open-meteo.com/v1/forecast?${query}`;
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function at(series: unknown, index: number) {
  return Array.isArray(series) ? finite(series[index]) : null;
}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const hourPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function times(series: unknown, pattern: RegExp) {
  if (!Array.isArray(series)) return [];
  return series.flatMap((time: unknown, index) =>
    typeof time === 'string' && pattern.test(time) ? [{ time, index }] : [],
  );
}

export function parseForecast(value: unknown) {
  const data = fields(value);
  const current = fields(data.current);
  const temperature = finite(current.temperature_2m);
  const time = current.time;
  if (temperature === null || typeof time !== 'string' || !hourPattern.test(time)) {
    throw new Error('현재 날씨 데이터가 올바르지 않습니다.');
  }

  const hourly = fields(data.hourly);
  const daily = fields(data.daily);
  const localHour = `${time.slice(0, 13)}:00`;
  return {
    current: {
      time, temperature,
      feelsLike: finite(current.apparent_temperature),
      code: finite(current.weather_code),
      night: current.is_day === 0,
      wind: finite(current.wind_speed_10m),
    },
    hours: times(hourly.time, hourPattern)
      .filter(hour => hour.time >= localHour)
      .slice(0, 24)
      .map(({ time, index }) => ({
        time,
        temperature: at(hourly.temperature_2m, index),
        code: at(hourly.weather_code, index),
        night: at(hourly.is_day, index) === 0,
        rain: at(hourly.precipitation_probability, index),
      })),
    days: times(daily.time, dayPattern)
      .filter(day => day.time >= time.slice(0, 10))
      .slice(0, 7)
      .map(({ time, index }) => ({
        time,
        high: at(daily.temperature_2m_max, index),
        low: at(daily.temperature_2m_min, index),
        code: at(daily.weather_code, index),
        rain: at(daily.precipitation_probability_max, index),
      })),
  };
}

export type Forecast = ReturnType<typeof parseForecast>;
