'use client';

import {useEffect, useState} from 'react';
import {Gamepad2, Image as ImageIcon, List} from 'lucide-react';

export function GameCover({imageUrl,title,thumb=false}:{imageUrl?:string;title:string;thumb?:boolean}) {
  const [failed,setFailed] = useState(false);
  return <div className={thumb?'game-cover game-thumb':'game-cover'}>
    {imageUrl && !failed
      ? <img src={imageUrl} alt={thumb?'':title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
      : <div className="game-cover-placeholder"><Gamepad2 size={thumb?20:43} strokeWidth={thumb?1.6:1.1} aria-hidden="true"/></div>}
  </div>;
}

export function useDeviceChoice<T extends string>(key:string,fallback:T,allowed:readonly T[],legacy?:Record<string,T>) {
  const [value,setValue] = useState<T>(fallback);
  useEffect(()=>{
    try {
      const saved = localStorage.getItem(key);
      const known = saved && (legacy?.[saved] ?? allowed.find(choice=>choice===saved));
      if (known) setValue(known);
    } catch { /* Storage can be unavailable in this browser. */ }
  },[key]); // The options are fixed for each storage key.
  const update = (next:T) => {
    setValue(next);
    try { localStorage.setItem(key,next); } catch { /* Keep the in-memory selection. */ }
  };
  return [value,update] as const;
}

type GameView = 'list' | 'cover';
const gameViews = ['list','cover'] as const;

export function useGameView(platform:'games'|'steam'|'xbox') {
  return useDeviceChoice<GameView>(`woong-hub:${platform}-view`,platform==='games'?'list':'cover',gameViews,{cards:'cover'});
}

export function GameViewToggle({view,onChange,label}:{view:GameView;onChange:(view:GameView)=>void;label:string}) {
  return <div className="game-view-toggle" role="group" aria-label={label}>
    <button type="button" aria-pressed={view==='list'} onClick={()=>onChange('list')}><List size={15} aria-hidden="true"/>목록</button>
    <button type="button" aria-pressed={view==='cover'} onClick={()=>onChange('cover')}><ImageIcon size={15} aria-hidden="true"/>표지</button>
  </div>;
}
