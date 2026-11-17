'use client';
import { useEffect, useState } from 'react';
import { Cloud, CloudRain, Sun, Snowflake, MapPin, Droplets, Wind, RefreshCw, ArrowUpRight } from 'lucide-react';
import { cities } from '@/lib/store';
type Weather = {current:{temperature_2m:number;apparent_temperature:number;weather_code:number;wind_speed_10m:number;relative_humidity_2m:number;time:string};daily:{temperature_2m_max:number[];temperature_2m_min:number[];precipitation_probability_max:number[]}};
export default function WeatherCard({city,onSettings}:{city:string;onSettings:()=>void}) {
  const [weather,setWeather]=useState<Weather|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),12000); let active=true;
    setLoading(true);setError(false);setWeather(null);
    const c=cities[city];
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=Asia%2FSeoul`,{signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{if(!d.current || !d.daily || !Number.isFinite(d.current.temperature_2m))throw new Error();if(active)setWeather(d);}).catch(()=>{if(active)setError(true);}).finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
    return ()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[city,retry]);
  const code=weather?.current.weather_code??0;const Icon=code>=71&&code<=77?Snowflake:code>=51?CloudRain:code>=2?Cloud:Sun;const description=code===0?'맑음':code<=3?'구름 조금':code<=48?'안개':code<=67?'비':code<=77?'눈':'소나기';
  return <section className="panel weather-card"><div className="panel-heading"><h2>오늘의 날씨</h2><button className="text-button muted" onClick={onSettings}><MapPin size={13}/>{cities[city].label}<ArrowUpRight size={13}/></button></div>
    {loading?<div className="weather-pending"><Cloud size={42}/><p>지금 날씨를 불러오는 중</p></div>:error||!weather?<div className="weather-pending"><Cloud size={38}/><p>날씨를 불러오지 못했어요</p><button className="text-button blue" onClick={()=>setRetry(v=>v+1)}><RefreshCw size={13}/>다시 시도</button></div>:<><div className="weather-main"><div><div className="temperature">{Math.round(weather.current.temperature_2m)}<span>°</span></div><p>{description}<span>체감 {Math.round(weather.current.apparent_temperature)}°</span></p></div><Icon className="weather-symbol" size={83} strokeWidth={1.25}/></div><div className="weather-highlow">최고 {Math.round(weather.daily.temperature_2m_max[0])}°<span>최저 {Math.round(weather.daily.temperature_2m_min[0])}°</span></div><div className="weather-meta"><span><Droplets size={14}/>강수 {weather.daily.precipitation_probability_max[0]}%</span><span><Wind size={14}/>{weather.current.wind_speed_10m} km/h</span></div><a className="weather-source" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo · {weather.current.time.slice(11,16)} 기준</a></>}
  </section>;
}
