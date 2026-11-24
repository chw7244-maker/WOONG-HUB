'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Download,FileUp,ListMusic,RefreshCw,Shuffle,Trash2,X} from 'lucide-react';
import {decodeCsv} from '@/lib/audio-csv';
import {albumKey,defaultRules,parseM3u,playlistFileName,playlistM3u,playlistSuffix,selectTracks,totalSeconds,trackFromPath,unknownLengths,validateDeviceLibrary,type DeviceLibrary,type DeviceTrack,type PlaylistRules} from '@/lib/device-music';

const MAX_FILE=8*1024*1024;
const length=(seconds:number)=>{const h=Math.floor(seconds/3600),m=Math.round(seconds%3600/60);return h?`${h}시간 ${m}분`:`${m}분`;};
const day=(iso:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
const counts=(values:string[])=>[...values.reduce((m,v)=>m.set(v,(m.get(v)??0)+1),new Map<string,number>())].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko'));

/** Chosen values as chips, with a search box that offers the most common matching values to add. */
function Picker({label,options,chosen,onChange}:{label:string;options:[string,number][];chosen:string[];onChange:(next:string[])=>void}){
  const [query,setQuery]=useState('');
  const shown=options.filter(([v])=>!chosen.includes(v)&&v.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,query?12:8);
  return <fieldset className="fiio-picker"><legend>{label}</legend>
    {chosen.length>0&&<div className="fiio-chips">{chosen.map(v=><button type="button" key={v} className="selected" onClick={()=>onChange(chosen.filter(x=>x!==v))} aria-label={`${v} 빼기`}>{v}<X size={13} aria-hidden="true"/></button>)}</div>}
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`${label} 찾기`} aria-label={`${label} 찾기`}/>
    <div className="fiio-chips">{shown.map(([v,n])=><button type="button" key={v} onClick={()=>{onChange([...chosen,v]);setQuery('');}}>{v}<span>{n}</span></button>)}{!shown.length&&<small>맞는 항목이 없어요.</small>}</div>
  </fieldset>;
}

/**
 * Playlists for a FiiO player: the track list comes from a playlist exported by FiiO Music (paths only, kept on the
 * server per account), tracks are picked by rules, and the result downloads as an M3U file FiiO Music can import.
 */
export default function FiioPlaylists(){
  const [library,setLibrary]=useState<DeviceLibrary|null>(null),[loading,setLoading]=useState(true),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [rules,setRules]=useState<PlaylistRules>(defaultRules),[excluded,setExcluded]=useState<Set<string>>(()=>new Set()),[name,setName]=useState(''),[downloaded,setDownloaded]=useState('');
  const input=useRef<HTMLInputElement>(null);
  // A search handed over from 내 음원 라이브러리 (?q=album) starts the rules with it.
  useEffect(()=>{const q=new URLSearchParams(window.location.search).get('q');if(q)setRules(current=>({...current,query:q.slice(0,100)}));},[]);
  useEffect(()=>{void (async()=>{try{const response=await fetch('/api/music/device',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error();const body=await response.json();setLibrary(body.library?validateDeviceLibrary(body.library):null);}catch{setError('곡 목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');}finally{setLoading(false);}})();},[]);
  const tracks=useMemo(()=>library?library.tracks.map(trackFromPath):[],[library]);
  const artists=useMemo(()=>counts(tracks.map(t=>t.artist)),[tracks]),albums=useMemo(()=>counts(tracks.filter(t=>!rules.artists.length||rules.artists.includes(t.artist)).map(albumKey)),[tracks,rules.artists]);
  const formats=useMemo(()=>counts(tracks.map(t=>t.format)),[tracks]),volumes=useMemo(()=>counts(tracks.map(t=>t.volume)),[tracks]);
  const picked=useMemo(()=>selectTracks(tracks,rules,excluded),[tracks,rules,excluded]);
  const set=(next:Partial<PlaylistRules>)=>{setRules(current=>({...current,...next}));setDownloaded('');};
  const toggle=(key:'formats'|'volumes',value:string)=>set({[key]:rules[key].includes(value)?rules[key].filter(v=>v!==value):[...rules[key],value]});

  async function importFile(file:File){
    setError('');setStatus('');
    if(file.size>MAX_FILE){setError('M3U는 8MB까지 가져올 수 있어요.');return;}
    const parsed=parseM3u(decodeCsv(await file.arrayBuffer())),usable=parsed.filter(t=>t.p.startsWith('/')),skipped=parsed.length-usable.length;
    if(!usable.length){setError(parsed.length?'기기 안의 경로(/storage/…)가 있는 곡이 없어요. FiiO Music에서 내보낸 파일인지 확인해 주세요.':'곡 경로를 찾지 못했어요. M3U 파일인지 확인해 주세요.');return;}
    const next=validateDeviceLibrary({name:file.name.slice(0,200),suffix:playlistSuffix(file.name),importedAt:new Date().toISOString(),tracks:usable});
    setStatus(`${usable.length.toLocaleString('ko-KR')}곡을 저장하는 중…`);
    try{
      const response=await fetch('/api/music/device',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
      if(!response.ok)throw new Error(response.status===413?'곡 목록이 너무 커요. 2만 곡까지 저장할 수 있어요.':'곡 목록을 저장하지 못했어요. 잠시 후 다시 해 주세요.');
      setLibrary(next);setExcluded(new Set());setRules(defaultRules());setDownloaded('');
      setStatus(`${usable.length.toLocaleString('ko-KR')}곡을 가져왔어요.${skipped?` 기기 경로가 아닌 ${skipped}곡은 뺐어요.`:''}`);
    }catch(e){setStatus('');setError(e instanceof Error?e.message:'곡 목록을 저장하지 못했어요.');}
  }
  async function removeLibrary(){
    if(!window.confirm('저장한 곡 목록을 지울까요? M23의 음원과 플레이리스트는 그대로예요.'))return;
    const response=await fetch('/api/music/device',{method:'DELETE',credentials:'same-origin'});
    if(response.ok){setLibrary(null);setStatus('곡 목록을 지웠어요.');}else setError('곡 목록을 지우지 못했어요.');
  }
  function download(){
    const title=name.trim()||`HUB ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}).format(new Date())} 플레이리스트`;
    const file=playlistFileName(title,library?.suffix??'.m3u8');
    const url=URL.createObjectURL(new Blob([playlistM3u(title,picked.tracks)],{type:'audio/x-mpegurl;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=file;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setDownloaded(file);
  }

  return <div className="fiio-playlists">
    <input ref={input} type="file" accept=".m3u,.m3u8,audio/x-mpegurl,audio/mpegurl" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importFile(file);}}/>
    <section className="fiio-card fiio-library" aria-labelledby="fiio-library-title">
      <span className="fiio-icon" aria-hidden="true"><ListMusic size={20}/></span>
      <div className="fiio-library-copy"><h2 id="fiio-library-title">M23 곡 목록</h2>
        <p role="status">{loading?'불러오는 중…':library?`${tracks.length.toLocaleString('ko-KR')}곡 · 아티스트 ${artists.length.toLocaleString('ko-KR')} · 앨범 ${counts(tracks.map(albumKey)).length.toLocaleString('ko-KR')} · ${day(library.importedAt)} 가져옴 (${library.name})`:'아직 가져온 곡 목록이 없어요.'}</p>
        {status&&<p className="fiio-status">{status}</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>
      <div className="fiio-actions"><button type="button" className="button primary" onClick={()=>input.current?.click()}>{library?<RefreshCw size={15} aria-hidden="true"/>:<FileUp size={15} aria-hidden="true"/>}{library?'새 M3U로 바꾸기':'M3U로 목록 가져오기'}</button>{library&&<button type="button" className="button secondary" onClick={()=>void removeLibrary()}><Trash2 size={15} aria-hidden="true"/>목록 지우기</button>}</div>
      <details className="fiio-guide" open={!library&&!loading}><summary>곡 목록을 가져오는 방법</summary><ol>
        <li>M23의 <strong>FiiO Music</strong>에서 모든 곡을 선택해 플레이리스트 하나(예: ‘전체 곡’)에 담습니다.</li>
        <li>플레이리스트 화면 오른쪽 위 <strong>⋯</strong>에서 M3U로 내보내고, 그 파일(.m3u8)을 PC로 복사합니다. 내보낸 파일은 보통 <code>Android/data/com.fiio.music/playlist</code> 폴더에 있어요.</li>
        <li>여기서 <strong>M3U로 목록 가져오기</strong>를 눌러 그 파일을 고릅니다. 음원은 올라가지 않고 파일 경로만 저장돼요.</li>
      </ol></details>
    </section>

    {library&&<div className="fiio-builder">
      <section className="fiio-card fiio-rules" aria-labelledby="fiio-rules-title"><h2 id="fiio-rules-title">조건으로 고르기</h2>
        <label className="fiio-field"><span>검색</span><input value={rules.query} onChange={e=>set({query:e.target.value})} placeholder="아티스트, 앨범, 곡, 폴더 이름"/></label>
        <Picker label="아티스트" options={artists} chosen={rules.artists} onChange={v=>set({artists:v,albums:[]})}/>
        <Picker label="앨범" options={albums} chosen={rules.albums} onChange={v=>set({albums:v})}/>
        <fieldset className="fiio-picker"><legend>포맷</legend><div className="fiio-chips">{formats.map(([f,n])=><button type="button" key={f} aria-pressed={rules.formats.includes(f)} className={rules.formats.includes(f)?'selected':''} onClick={()=>toggle('formats',f)}>{f}<span>{n}</span></button>)}</div></fieldset>
        {volumes.length>1&&<fieldset className="fiio-picker"><legend>저장 위치</legend><div className="fiio-chips">{volumes.map(([v,n])=><button type="button" key={v} aria-pressed={rules.volumes.includes(v)} className={rules.volumes.includes(v)?'selected':''} onClick={()=>toggle('volumes',v)}>{v}<span>{n}</span></button>)}</div></fieldset>}
        <div className="fiio-row"><label className="fiio-field"><span>분량</span><span className="fiio-amount"><input type="number" min={1} max={rules.limit==='count'?2000:6000} value={rules.amount} onChange={e=>set({amount:Number(e.target.value)})}/><select aria-label="분량 단위" value={rules.limit} onChange={e=>set({limit:e.target.value as PlaylistRules['limit']})}><option value="count">곡</option><option value="minutes">분</option></select></span></label>
          <label className="fiio-field"><span>순서</span><select value={rules.order} onChange={e=>set({order:e.target.value as PlaylistRules['order']})}><option value="shuffle">무작위</option><option value="album">앨범 순서</option><option value="artist">아티스트 순서</option></select></label></div>
        <button type="button" className="text-button" onClick={()=>{setRules(defaultRules());setExcluded(new Set());setDownloaded('');}}>조건 초기화</button>
      </section>

      <section className="fiio-card fiio-result" aria-labelledby="fiio-result-title">
        <div className="fiio-result-head"><div><h2 id="fiio-result-title">{picked.tracks.length.toLocaleString('ko-KR')}곡 · {length(totalSeconds(picked.tracks))}</h2><small>조건에 맞는 곡 {picked.matched.toLocaleString('ko-KR')}개{unknownLengths(picked.tracks)?` · 길이 모르는 곡 ${unknownLengths(picked.tracks)}개 제외한 시간`:''}{excluded.size?` · 뺀 곡 ${excluded.size}개`:''}</small></div>
          {rules.order==='shuffle'&&<button type="button" className="button secondary" onClick={()=>set({seed:rules.seed+1})}><Shuffle size={15} aria-hidden="true"/>다시 섞기</button>}</div>
        <ol className="fiio-tracks">{picked.tracks.map((t:DeviceTrack)=><li key={t.path}><span className="fiio-track-copy"><strong>{t.title}</strong><small>{t.artist} · {t.album}{t.seconds?` · ${Math.floor(t.seconds/60)}:${String(t.seconds%60).padStart(2,'0')}`:''} · {t.format}</small></span>
          <button type="button" className="icon-button" aria-label={`${t.title} 빼기`} onClick={()=>{setExcluded(current=>new Set(current).add(t.path));setDownloaded('');}}><X size={15}/></button></li>)}</ol>
        {!picked.tracks.length&&<p className="fiio-muted">조건에 맞는 곡이 없어요. 조건을 줄여 보세요.</p>}
        <div className="fiio-download"><label className="fiio-field"><span>플레이리스트 이름</span><input value={name} maxLength={80} onChange={e=>{setName(e.target.value);setDownloaded('');}} placeholder="예: 밤에 듣는 재즈"/></label>
          <button type="button" className="button primary" disabled={!picked.tracks.length} onClick={download}><Download size={15} aria-hidden="true"/>M3U 내려받기</button></div>
        {downloaded&&<div className="fiio-next" role="status"><strong>내려받은 파일: {downloaded}</strong><span>M23에 넣는 방법</span><ol>
          <li>M23을 PC에 USB로 연결하고, 파일 탐색기에서 <code>Android/data/com.fiio.music/playlist</code> 폴더에 이 파일을 복사합니다.</li>
          <li>FiiO Music → 플레이리스트 → 오른쪽 위 <strong>⋯</strong> → M3U 가져오기를 누릅니다.</li></ol></div>}
      </section>
    </div>}
  </div>;
}
