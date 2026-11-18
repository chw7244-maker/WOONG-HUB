'use client';

import { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSun, Droplets, MapPin, Moon, RefreshCw, Snowflake, Sun, Wind } from 'lucide-react';
import { weatherRegions } from '@/lib/weather-cities';
import { forecastUrl, parseForecast, type Forecast } from '@/lib/weather';

export function WeatherCitySelect({ id, city, onChange }: {
  id: string; city: string; onChange: (city: string) => void;
}) {
  return <select id={id} value={city} onChange={event => onChange(event.target.value)}>
    {weatherRegions.map(region => <optgroup key={region.label} label={region.label}>
      {Object.entries(region.cities).map(([value, { label }]) =>
        <option key={value} value={value}>{label}</option>,
      )}
    </optgroup>)}
  </select>;
}

function condition(code: number | null, night = false) {
  switch (code) {
    case 0: return { Icon: night ? Moon : Sun, label: '맑음' };
    case 1:
    case 2: return { Icon: night ? CloudMoon : CloudSun, label: '구름 조금' };
    case 3: return { Icon: Cloud, label: '흐림' };
    case 45:
    case 48: return { Icon: CloudFog, label: '안개' };
    case 51:
    case 53:
    case 55:
    case 56:
    case 57: return { Icon: CloudDrizzle, label: '이슬비' };
    case 61:
    case 63:
    case 65:
    case 66:
    case 67: return { Icon: CloudRain, label: '비' };
    case 71:
    case 73:
    case 75:
    case 77: return { Icon: Snowflake, label: '눈' };
    case 80:
    case 81:
    case 82: return { Icon: CloudRain, label: '소나기' };
    case 85:
    case 86: return { Icon: Snowflake, label: '눈 소나기' };
    case 95:
    case 96:
    case 99: return { Icon: CloudLightning, label: '뇌우' };
    default: return { Icon: Cloud, label: '날씨 정보 없음' };
  }
}

const shortDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short',
});

const degrees = (value: number | null) => value === null ? '–' : `${Math.round(value)}°`;
const probability = (value: number | null) => value === null ? '–' : `${value}%`;
const dateLabel = (day: string) => shortDate.format(new Date(`${day}T00:00:00+09:00`));

function WeatherCondition({ code, night }: { code: number | null; night?: boolean }) {
  const { Icon, label } = condition(code, night);
  return <Icon size={21} role="img" aria-label={label}><title>{label}</title></Icon>;
}

function HourlyForecast({ forecast }: { forecast: Forecast }) {
  return <div className="weather-hour-scroll" role="region" aria-label="시간별 기온과 강수 확률" tabIndex={0}>
    <ol className="weather-hours">
      {forecast.hours.map((hour, index) => {
        const day = hour.time.slice(0, 10);
        const time = hour.time.slice(11);
        const label = day === forecast.current.time.slice(0, 10) ? '오늘' : dateLabel(day);
        return <li key={hour.time}>
          <time dateTime={`${hour.time}+09:00`} aria-label={`${label} ${time}`}>
            {index === 0 ? '지금' : time === '00:00' ? '내일 00시' : `${time.slice(0, 2)}시`}
          </time>
          <WeatherCondition code={hour.code} night={hour.night}/>
          <strong>{degrees(hour.temperature)}</strong>
          <span className="weather-probability" aria-label={`강수 확률 ${probability(hour.rain)}`}>{probability(hour.rain)}</span>
        </li>;
      })}
    </ol>
  </div>;
}

function DailyForecast({ forecast }: { forecast: Forecast }) {
  const today = forecast.current.time.slice(0, 10);
  return <ol className="weather-days" aria-label="일별 최저·최고 기온과 강수 확률">
    {forecast.days.map(day => <li key={day.time}>
      <time dateTime={day.time}>{day.time === today ? '오늘' : dateLabel(day.time)}</time>
      <WeatherCondition code={day.code}/>
      <span className="weather-probability" aria-label={`강수 확률 ${probability(day.rain)}`}>{probability(day.rain)}</span>
      <span className="weather-range" aria-label={`최저 ${degrees(day.low)}, 최고 ${degrees(day.high)}`}>
        {degrees(day.low)} <strong>{degrees(day.high)}</strong>
      </span>
    </li>)}
  </ol>;
}

type RequestResult = { city: string; retry: number; forecast: Forecast | null };

export default function WeatherCard({ city, onCityChange }: { city: string; onCityChange: (city: string) => void }) {
  const [result, setResult] = useState<RequestResult>();
  const [retry, setRetry] = useState(0);
  const [period, setPeriod] = useState<'hourly' | 'daily'>('hourly');

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let active = true;
    async function loadForecast() {
      try {
        const response = await fetch(forecastUrl(city), { signal: controller.signal });
        if (!response.ok) throw new Error('예보 요청 실패');
        const forecast = parseForecast(await response.json());
        if (active) setResult({ city, retry, forecast });
      } catch {
        if (active) setResult({ city, retry, forecast: null });
      } finally {
        clearTimeout(timeout);
      }
    }
    void loadForecast();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [city, retry]);

  const settled = result?.city === city && result.retry === retry;
  const weather = settled ? result.forecast : null;
  const today = weather?.days.find(day => day.time === weather.current.time.slice(0, 10));
  const { Icon, label } = condition(weather?.current.code ?? null, weather?.current.night);
  const hasForecast = period === 'hourly' ? weather?.hours.length : weather?.days.length;

  return <section className="panel weather-card" aria-label="날씨">
    <div className="panel-heading">
      <h2>날씨</h2>
      <div className="weather-location">
        <label htmlFor="weather-city"><MapPin size={15} aria-hidden="true"/><span>날씨 지역</span></label>
        <WeatherCitySelect id="weather-city" city={city} onChange={onCityChange}/>
      </div>
    </div>
    {!settled ? <div className="weather-pending" role="status"><Cloud size={42}/><p>날씨를 불러오는 중</p></div>
      : !weather ? <div className="weather-pending" role="status">
        <Cloud size={38}/><p>날씨를 불러오지 못했어요</p>
        <button type="button" className="text-button blue weather-retry" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13}/>다시 시도</button>
      </div>
      : <>
        <div className="weather-layout">
          <div className="weather-overview">
            <div className="weather-main">
              <div>
                <div className="temperature">{Math.round(weather.current.temperature)}<span>°</span></div>
                <p>{label}{weather.current.feelsLike !== null && <span>체감 {degrees(weather.current.feelsLike)}</span>}</p>
              </div>
              <Icon className="weather-symbol" size={68} strokeWidth={1.25} aria-hidden="true"/>
            </div>
            {today && <div className="weather-highlow">최고 {degrees(today.high)}<span>최저 {degrees(today.low)}</span></div>}
            <div className="weather-meta">
              {today?.rain != null && <span><Droplets size={14}/>오늘 강수 {probability(today.rain)}</span>}
              {weather.current.wind !== null && <span><Wind size={14}/>{weather.current.wind} km/h</span>}
            </div>
          </div>
          <div className="weather-forecast">
            <div className="weather-period" role="group" aria-label="예보 보기">
              <button type="button" aria-pressed={period === 'hourly'} onClick={() => setPeriod('hourly')}>시간별</button>
              <button type="button" aria-pressed={period === 'daily'} onClick={() => setPeriod('daily')}>일별</button>
            </div>
            {!hasForecast ? <p className="weather-empty">예보 데이터를 받지 못했어요.</p>
              : period === 'hourly' ? <HourlyForecast forecast={weather}/>
              : <DailyForecast forecast={weather}/>}
          </div>
        </div>
        <a className="weather-source" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo · {weather.current.time.slice(11, 16)} 기준 (KST)</a>
      </>}
  </section>;
}
