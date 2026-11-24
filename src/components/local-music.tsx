'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Check,FolderOpen,ImageOff,Search,Sparkles,Trash2} from 'lucide-react';
import Dialog from './dialog';
import type {Entry} from '@/lib/store';
import {emptyMusic,validateMusic} from '@/lib/music';
import {albumMark,albumTone,filterAlbums,formatLength,groupAlbums,libraryDiff,sortAlbums,trackTime,validateLocalLibrary,type AlbumSort,type LocalAlbum,type LocalLibrary} from '@/lib/local-music';
import {scanFolder,type ScanProgress,type ScanResult} from '@/lib/local-music-scan';

const tierLabels:Record<string,string>={'':'음질 · 전체',hires:'고해상도',cd:'CD 음질',lossy:'손실 압축'};
const sortLabels:Record<AlbumSort,string>={recent:'최근 추가순',artist:'아티스트순',year:'연도순',title:'앨범명순'};
const when=(iso:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));

/** The album cover: the stored thumbnail, a found cover address, or a coloured tile with the album's initials. */
function Cover({album,big=false}:{album:LocalAlbum;big?:boolean}){
  const src=album.cover.id?`/api/music/local/cover?id=${album.cover.id}`:album.cover.url;
  const [failed,setFailed]=useState(false);
  return src&&!failed?<img className="local-cover-img" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
    :<span className={big?'local-cover-tile big':'local-cover-tile'} style={{background:albumTone(album.key)}} aria-hidden="true">{albumMark(album.title)}</span>;
}

function AlbumDetail({album,inCollection,onCollect}:{album:LocalAlbum;inCollection:boolean;onCollect:()=>void}){
  return <div className="local-detail">
    <div className="local-mat big"><Cover album={album} big/></div>
    <div><h2>{album.title}</h2><p>{album.artist}{album.year?` · ${album.year}`:''}</p></div>
    <div className="local-tags">{album.genre&&<span>{album.genre}</span>}<span className="accent">{album.quality}</span><span>{album.tracks.length}곡{album.seconds?` · ${formatLength(album.seconds)}`:''}</span></div>
    <ol className="local-tracks">{album.tracks.map((t,i)=><li key={t.path}><span>{t.track??i+1}</span><span>{t.title}</span><span>{trackTime(t.seconds)}</span></li>)}</ol>
    <p className="local-source">표지: {album.cover.id?'파일·폴더에서 읽음':album.cover.url?'MusicBrainz에서 찾음':'없음'} · 폴더 <code>{album.folder||'(맨 위)'}</code></p>
    <div className="local-detail-actions">
      <button type="button" className="button secondary" onClick={onCollect} disabled={inCollection}>{inCollection?<><Check size={15} aria-hidden="true"/>컬렉션에 있어요</>:'앨범 컬렉션에 담기'}</button>
      <Link className="button primary" href={`/music/fiio/?q=${encodeURIComponent(album.title)}`}>M23 플레이리스트로</Link>
    </div>
  </div>;
}

/**
 * 내 음원 라이브러리: reads a PC music folder in the browser, keeps tags and cover thumbnails on the account and shows
 * albums as framed covers on a wall, with the picked album's details beside it (a sheet on phones).
 */
export default function LocalMusic({collection,onCollect}:{collection:Entry[];onCollect:(entry:Entry,message:string)=>void}){
  const [library,setLibrary]=useState<LocalLibrary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [progress,setProgress]=useState<ScanProgress|null>(null),[result,setResult]=useState<ScanResult|null>(null),[saving,setSaving]=useState('');
  const [query,setQuery]=useState(''),[genre,setGenre]=useState(''),[tier,setTier]=useState(''),[sort,setSort]=useState<AlbumSort>('recent'),[selected,setSelected]=useState(''),[sheet,setSheet]=useState(false),[finding,setFinding]=useState<string|null>(null);
  const input=useRef<HTMLInputElement>(null),abort=useRef<AbortController|null>(null),stopFind=useRef(false);
  useEffect(()=>{input.current?.setAttribute('webkitdirectory','');input.current?.setAttribute('directory','');},[]);
  useEffect(()=>{void (async()=>{try{const r=await fetch('/api/music/local',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error();const body=await r.json();setLibrary(body.library?validateLocalLibrary(body.library):null);}catch{setError('라이브러리를 불러오지 못했어요. 잠시 후 다시 열어 주세요.');}finally{setLoading(false);}})();return()=>{abort.current?.abort();stopFind.current=true;};},[]);

  const albums=useMemo(()=>library?groupAlbums(library):[],[library]);
  const genres=useMemo(()=>[...albums.reduce((m,a)=>a.genre?m.set(a.genre,(m.get(a.genre)??0)+1):m,new Map<string,number>())].sort((a,b)=>b[1]-a[1]).slice(0,6),[albums]);
  const shown=useMemo(()=>sortAlbums(filterAlbums(albums,{query,genre,tier}),sort),[albums,query,genre,tier,sort]);
  const current=shown.find(a=>a.key===selected)??shown[0];
  const missing=albums.filter(a=>!a.cover.id&&!a.cover.url);
  const owned=new Set(collection.map(e=>`${e.music?.artist.toLocaleLowerCase()}\u0001${e.title.toLocaleLowerCase()}`));
  const inCollection=(a:LocalAlbum)=>owned.has(`${a.artist.toLocaleLowerCase()}\u0001${a.title.toLocaleLowerCase()}`);

  async function read(files:File[]){
    setError('');setNotice('');setResult(null);
    if(!files.length)return;
    const controller=new AbortController();abort.current=controller;
    setProgress({read:0,total:0,covers:0,coverTotal:0,current:'',skipped:0});
    try{
      const scanned=await scanFolder(files,setProgress,controller.signal);
      if(!scanned.library.tracks.length){setError('이 폴더에서 음악 파일을 찾지 못했어요. FLAC·MP3·M4A·DSF·WAV 파일이 든 폴더를 골라 주세요.');setProgress(null);return;}
      setResult(scanned);
    }catch(e){setProgress(null);if((e as Error).name!=='AbortError')setError('폴더를 읽지 못했어요. Chrome이나 Edge에서 다시 해 주세요.');}
  }
  async function save(){
    if(!result)return;
    try{
      setSaving('표지를 올리는 중…');
      const have=new Set<string>((await (await fetch('/api/music/local/covers',{credentials:'same-origin',cache:'no-store'})).json()).ids??[]);
      const todo=[...result.thumbnails].filter(([id])=>!have.has(id));
      for(const [i,[id,blob]] of todo.entries()){
        setSaving(`표지를 올리는 중… ${i+1}/${todo.length}`);
        const r=await fetch('/api/music/local/covers',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/jpeg'},body:blob});
        if(!r.ok&&r.status!==409)throw new Error('표지를 올리지 못했어요.');
        if(r.ok&&(await r.json()).id!==id)throw new Error('표지를 확인하지 못했어요.');
      }
      // Keep covers found on MusicBrainz for albums the folder still has no picture for.
      const covers={...Object.fromEntries(Object.entries(library?.covers??{}).filter(([,c])=>c.url&&!c.id).map(([k,c])=>[k,{url:c.url}])),...result.library.covers};
      const next={...result.library,covers};
      setSaving('라이브러리를 저장하는 중…');
      const r=await fetch('/api/music/local',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
      if(!r.ok)throw new Error(r.status===413?'곡이 너무 많아요. 2만 곡까지 저장할 수 있어요.':'라이브러리를 저장하지 못했어요.');
      setLibrary(validateLocalLibrary(next));setResult(null);setProgress(null);setSaving('');
      setNotice(`앨범 ${groupAlbums(next).length}장, ${next.tracks.length.toLocaleString('ko-KR')}곡을 저장했어요.`);
    }catch(e){setSaving('');setError(e instanceof Error?e.message:'라이브러리를 저장하지 못했어요.');}
  }
  async function findCovers(){
    if(!library||finding)return;
    stopFind.current=false;let found=0;const covers={...library.covers};
    for(const [i,album] of missing.entries()){
      if(stopFind.current)break;
      setFinding(`표지 찾는 중… ${i+1}/${missing.length}`);
      try{
        const r=await fetch(`/api/music/albums?${new URLSearchParams({album:album.title,artist:album.artist==='아티스트 미상'?'':album.artist})}`,{credentials:'same-origin',cache:'no-store'});
        if(r.ok){const url=(await r.json()).albums?.[0]?.coverUrl;if(typeof url==='string'){covers[album.key]={url};found++;}}
      }catch{/* try the next album */}
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    const next={...library,covers};
    const r=await fetch('/api/music/local',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)}).catch(()=>null);
    if(r?.ok)setLibrary(validateLocalLibrary(next));
    setFinding(null);setNotice(r?.ok?`표지 ${found}장을 찾았어요.${missing.length-found?` ${missing.length-found}장은 찾지 못했어요.`:''}`:'찾은 표지를 저장하지 못했어요.');
  }
  async function remove(){
    if(!window.confirm('저장한 음원 라이브러리와 표지를 지울까요? PC의 음악 파일은 그대로예요.'))return;
    const r=await fetch('/api/music/local',{method:'DELETE',credentials:'same-origin'});
    if(r.ok){setLibrary(null);setNotice('라이브러리를 지웠어요.');}else setError('라이브러리를 지우지 못했어요.');
  }
  function collect(album:LocalAlbum){
    const year=album.year?String(album.year):'';
    onCollect({id:crypto.randomUUID(),kind:'music',title:album.title.slice(0,200),detail:'',category:album.tier==='lossy'?'디지털':'FLAC',status:'컬렉션',url:'',date:'',done:false,createdAt:new Date().toISOString(),
      music:validateMusic({...emptyMusic(),artist:album.artist==='아티스트 미상'?'':album.artist.slice(0,200),genre:album.genre.slice(0,100),releaseDate:year,type:'album'})},`${album.title}을(를) 앨범 컬렉션에 담았어요.`);
  }
  const diff=result&&library?libraryDiff(library.tracks,result.library.tracks):result?{newAlbums:groupAlbums(result.library).length,newTracks:result.library.tracks.length,changedTracks:0,removedTracks:0}:null;
  const resultMissing=result?groupAlbums(result.library).filter(a=>!a.cover.id).length:0;

  return <div className="local-music">
    <input ref={input} type="file" multiple hidden onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';void read(files);}}/>
    <div className="local-head">
      <p>{loading?'불러오는 중…':library?`${library.folder}에서 읽은 앨범 ${albums.length}장 · ${library.tracks.length.toLocaleString('ko-KR')}곡 · ${when(library.scannedAt)} 읽음`:'PC의 음악 폴더를 고르면 곡 정보와 표지를 읽어 앨범 표지 벽을 만들어요.'}</p>
      <div className="local-head-actions">
        {library&&<label className="local-search"><Search size={16} aria-hidden="true"/><input aria-label="앨범 검색" placeholder="앨범, 아티스트, 곡 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
        <button type="button" className="button secondary local-pill" onClick={()=>input.current?.click()} disabled={!!progress}><FolderOpen size={16} aria-hidden="true"/>{library?'폴더 다시 읽기':'음악 폴더 고르기'}</button>
      </div>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {notice&&<p className="local-notice" role="status">{notice}</p>}

    {progress&&<section className="local-scan" aria-label="폴더 읽기">
      <div className="local-scan-head"><strong>{result?'다 읽었어요':'음악 폴더 읽는 중'}</strong>{!result&&<button type="button" className="button secondary local-pill" onClick={()=>abort.current?.abort()}>멈추기</button>}</div>
      <div className="local-bars">
        <span>곡 정보</span><span>{progress.read.toLocaleString('ko-KR')} / {progress.total.toLocaleString('ko-KR')}곡</span>
        <div className="local-bar" role="progressbar" aria-label="곡 정보 읽기" aria-valuemin={0} aria-valuemax={progress.total||1} aria-valuenow={progress.read}><i style={{width:`${progress.total?progress.read/progress.total*100:0}%`}}/></div>
        <span>표지 썸네일 만들기</span><span>{progress.covers} / {progress.coverTotal||'…'}장</span>
        <div className="local-bar teal" role="progressbar" aria-label="표지 만들기" aria-valuemin={0} aria-valuemax={progress.coverTotal||1} aria-valuenow={progress.covers}><i style={{width:`${progress.coverTotal?progress.covers/progress.coverTotal*100:0}%`}}/></div>
      </div>
      {!result&&progress.current&&<p className="local-muted">지금 읽는 곳: {progress.current}</p>}
      {result&&diff&&<>
        <div className="local-diff">
          <div><small>새 앨범</small><strong>{diff.newAlbums}</strong></div><div><small>새 곡</small><strong>{diff.newTracks}</strong></div>
          <div><small>정보가 바뀐 곡</small><strong>{diff.changedTracks}</strong></div><div><small>폴더에서 사라진 곡</small><strong>{diff.removedTracks}</strong></div>
        </div>
        <p className="local-muted">{resultMissing?`표지가 없는 앨범 ${resultMissing}장은 저장한 뒤 MusicBrainz에서 찾을 수 있어요. `:''}{result.skipped?`읽지 못한 파일 ${result.skipped}개는 뺐어요.`:''}</p>
        <div className="local-scan-actions"><button type="button" className="button secondary local-pill" onClick={()=>{setResult(null);setProgress(null);}} disabled={!!saving}>취소</button><button type="button" className="button primary local-pill" onClick={()=>void save()} disabled={!!saving}>{saving||'라이브러리 저장'}</button></div>
      </>}
      <p className="local-privacy">음원 파일은 올라가지 않아요. 곡 제목·아티스트·앨범·연도·장르·길이·음질과 300px 표지 썸네일만 내 계정에 저장해 어느 기기에서나 보여요.</p>
    </section>}

    {library&&<>
      <div className="local-filters">
        <div className="local-chips" role="group" aria-label="장르"><button type="button" aria-pressed={!genre} onClick={()=>setGenre('')}>전체<span>{albums.length}</span></button>{genres.map(([g,n])=><button key={g} type="button" aria-pressed={genre===g} onClick={()=>setGenre(genre===g?'':g)}>{g}<span>{n}</span></button>)}</div>
        <div className="local-selects">
          {missing.length>0&&<button type="button" className="local-find" onClick={()=>finding?(stopFind.current=true):void findCovers()}><Sparkles size={15} aria-hidden="true"/>{finding??`표지 찾기 ${missing.length}장`}</button>}
          <select aria-label="음질" value={tier} onChange={e=>setTier(e.target.value)}>{Object.entries(tierLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
          <select aria-label="정렬" value={sort} onChange={e=>setSort(e.target.value as AlbumSort)}>{Object.entries(sortLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      {shown.length?<div className="local-layout">
        <section className="local-wall" aria-label="앨범 표지 벽"><ul>{shown.map(album=><li key={album.key}>
          <button type="button" className="local-frame" aria-pressed={current?.key===album.key} aria-label={`${album.title} · ${album.artist} 열기`} onClick={()=>{setSelected(album.key);if(window.matchMedia('(max-width: 760px)').matches)setSheet(true);}}>
            <span className="local-mat"><Cover album={album}/></span>
            <span className="local-caption"><strong>{album.title}</strong><small>{album.artist}{album.year?` · ${album.year}`:''}</small></span>
          </button></li>)}</ul></section>
        {current&&<aside className="local-aside" aria-label="앨범 정보"><AlbumDetail album={current} inCollection={inCollection(current)} onCollect={()=>collect(current)}/></aside>}
      </div>:<p className="local-empty">{query||genre||tier?'조건에 맞는 앨범이 없어요.':'앨범이 없어요.'}</p>}
      <button type="button" className="text-button local-remove" onClick={()=>void remove()}><Trash2 size={14} aria-hidden="true"/>저장한 라이브러리 지우기</button>
      {sheet&&current&&<Dialog title={current.title} onClose={()=>setSheet(false)} className="section-detail local-sheet"><AlbumDetail album={current} inCollection={inCollection(current)} onCollect={()=>collect(current)}/></Dialog>}
    </>}
    {!library&&!loading&&!progress&&<section className="local-start"><ImageOff size={36} strokeWidth={1.3} aria-hidden="true"/><h2>아직 읽은 음악 폴더가 없어요</h2><p>PC의 Chrome이나 Edge에서 ‘음악 폴더 고르기’를 눌러 음악이 든 폴더(또는 카드 리더에 꽂은 microSD)를 고르세요. 휴대폰에서는 만든 라이브러리를 볼 수만 있어요.</p></section>}
  </div>;
}
