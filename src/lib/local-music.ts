/**
 * 내 음원 라이브러리: tags read in the browser from a music folder on the PC. Only text (tags, length, audio format,
 * the file's path inside the chosen folder) and small cover thumbnails are kept; audio never leaves the PC.
 */
export type LocalTrack={path:string;title:string;artist:string;albumArtist:string;album:string;track:number|null;disc:number|null;year:number|null;genre:string;seconds:number|null;format:string;sampleRate:number|null;bits:number|null;kbps:number|null;lossless:boolean;modified:number};
export type CoverRef={id?:string;url?:string};
export type LocalLibrary={folder:string;scannedAt:string;tracks:LocalTrack[];covers:Record<string,CoverRef>};
export type LocalAlbum={key:string;title:string;artist:string;year:number|null;genre:string;folder:string;tracks:LocalTrack[];seconds:number;addedAt:number;quality:string;tier:'hires'|'cd'|'lossy';cover:CoverRef};

export const MAX_LOCAL_TRACKS=20000;
export const AUDIO_EXTENSIONS=['flac','mp3','m4a','alac','aac','wav','aiff','aif','dsf','dff','ape','ogg','opus','wv','wma'];
export const COVER_NAMES=/^(cover|folder|front|album|albumart|albumartlarge)\.(jpe?g|png|webp)$/i;
const discFolder=/^(cd|disc|disk|디스크)\s*\d{1,2}$/i;

const clean=(v:unknown,max=300)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
/** The album folder of a path: its parent, or the one above for disc folders (…/Album/CD1/01.flac). */
export function albumFolder(path:string){const dirs=path.split('/').slice(0,-1);if(dirs.length>1&&discFolder.test(dirs.at(-1)!))dirs.pop();return dirs.join('/');}
/** "Artist_Album" or "Artist - Album" folder names, as many rips are named. */
export function splitFolderName(name:string){const dash=name.indexOf(' - '),under=name.indexOf('_');const at=dash>0?{i:dash,len:3}:under>0?{i:under,len:1}:null;return at?{artist:name.slice(0,at.i).trim(),album:name.slice(at.i+at.len).trim()}:{artist:'',album:name.trim()};}
const whole=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&Math.round(v)>=min&&Math.round(v)<=max?Math.round(v):null;
/** A path inside the picked folder the server accepts: relative, no '.' or '..' parts, no control characters or backslashes. */
export const safePath=(path:string)=>!!path&&path.length<=1000&&!path.startsWith('/')&&!/[\u0000-\u001f\\]/.test(path)&&path.split('/').every(p=>p!==''&&p!=='.'&&p!=='..');
const titleFromFile=(file:string)=>{const base=file.replace(/\.[^.]+$/,'');const m=base.match(/^(?:\d{1,2}[-.])?\d{1,3}(?:\s*[-._]\s*|\s+)(.+)$/);return (m?m[1]:base).trim();};

type Tags={title?:string;artist?:string;albumartist?:string;album?:string;year?:number;genre?:string[];track?:{no:number|null};disk?:{no:number|null}};
type Format={container?:string;codec?:string;lossless?:boolean;sampleRate?:number;bitsPerSample?:number;bitrate?:number;duration?:number};
/** One track from music-metadata's common tags and format, with the folder and file name filling missing tags. */
export function trackFromTags(path:string,tags:Tags,format:Format,modified:number):LocalTrack{
  const folder=albumFolder(path).split('/').at(-1)??'',fromFolder=splitFolderName(folder),file=path.split('/').at(-1)??path,ext=(file.split('.').pop()??'').toLowerCase();
  const artist=clean(tags.artist)||clean(tags.albumartist)||fromFolder.artist;
  const rate=format.sampleRate&&format.sampleRate>0?Math.round(format.sampleRate):null;
  const dsd=ext==='dsf'||ext==='dff'||/dsd/i.test(format.codec??'');
  const label=dsd?'DSD':ext==='m4a'?(format.lossless?'ALAC':'AAC'):(clean(format.container,20)||ext).toUpperCase().replace('MPEG','MP3');
  // Every value stays inside what validateLocalLibrary accepts, so odd tags (huge or broken numbers, empty titles) never block saving.
  const parent=path.split('/').slice(-2,-1)[0]??'';
  return {path,title:clean(tags.title)||clean(titleFromFile(file))||clean(file)||'제목 없음',artist:clean(artist)||'아티스트 미상',albumArtist:clean(tags.albumartist)||clean(artist)||'아티스트 미상',album:clean(tags.album)||clean(fromFolder.album)||'앨범 미상',
    track:whole(tags.track?.no,0,9999),disc:whole(tags.disk?.no,0,99)??(discFolder.test(parent)?whole(Number(parent.replace(/\D/g,'')),0,99):null),year:whole(tags.year,1001,2999),
    genre:clean(tags.genre?.[0],60),seconds:whole(format.duration,1,1000000),format:label.slice(0,12),sampleRate:whole(rate,1,50000000),bits:whole(format.bitsPerSample,1,64),
    kbps:whole(format.bitrate?format.bitrate/1000:null,1,100000),lossless:dsd||!!format.lossless,modified:Number.isSafeInteger(modified)&&modified>=0?modified:0};
}

export const albumKeyOf=(t:Pick<LocalTrack,'albumArtist'|'album'>)=>`${t.albumArtist.toLocaleLowerCase()}\u0001${t.album.toLocaleLowerCase()}`;
const dsdName=(rate:number)=>`DSD${Math.round(rate/44100)}`;
/** One label for an album's sound: the best track's rate and depth (FLAC 24bit / 96kHz, DSD64, MP3 320kbps). */
export function albumQuality(tracks:LocalTrack[]):{quality:string;tier:LocalAlbum['tier']}{
  const best=[...tracks].sort((a,b)=>Number(b.lossless)-Number(a.lossless)||(b.sampleRate??0)-(a.sampleRate??0)||(b.bits??0)-(a.bits??0)||(b.kbps??0)-(a.kbps??0))[0];
  if(!best)return {quality:'',tier:'lossy'};
  if(best.format==='DSD')return {quality:best.sampleRate?dsdName(best.sampleRate):'DSD',tier:'hires'};
  if(!best.lossless)return {quality:`${best.format}${best.kbps?` ${best.kbps}kbps`:''}`,tier:'lossy'};
  const khz=best.sampleRate?`${Number((best.sampleRate/1000).toFixed(1))}kHz`:'';
  const hires=(best.bits??16)>16||(best.sampleRate??44100)>48000;
  return {quality:[best.format,best.bits?`${best.bits}bit`:'',khz].filter(Boolean).join(' ').replace(/bit (\d)/,'bit / $1'),tier:hires?'hires':'cd'};
}
const byTrack=(a:LocalTrack,b:LocalTrack)=>(a.disc??1)-(b.disc??1)||(a.track??999)-(b.track??999)||a.path.localeCompare(b.path);
const common=(values:string[])=>[...values.reduce((m,v)=>v?m.set(v,(m.get(v)??0)+1):m,new Map<string,number>())].sort((a,b)=>b[1]-a[1])[0]?.[0]??'';
/** Tracks grouped into albums by album artist and album, tracks in disc and track order. */
export function groupAlbums(library:Pick<LocalLibrary,'tracks'|'covers'>):LocalAlbum[]{
  const groups=new Map<string,LocalTrack[]>();for(const t of library.tracks){const key=albumKeyOf(t);groups.set(key,[...(groups.get(key)??[]),t]);}
  return [...groups].map(([key,tracks])=>{
    const sorted=[...tracks].sort(byTrack),first=sorted[0],years=sorted.map(t=>t.year).filter((y):y is number=>y!==null);
    return {key,title:first.album,artist:first.albumArtist,year:years.length?Math.min(...years):null,genre:common(sorted.map(t=>t.genre)),folder:albumFolder(first.path),tracks:sorted,seconds:sorted.reduce((s,t)=>s+(t.seconds??0),0),addedAt:Math.max(...sorted.map(t=>t.modified)),...albumQuality(sorted),cover:library.covers[key]??{}};
  });
}
export type AlbumSort='recent'|'artist'|'year'|'title';
export function sortAlbums(albums:LocalAlbum[],sort:AlbumSort){
  const by:Record<AlbumSort,(a:LocalAlbum,b:LocalAlbum)=>number>={recent:(a,b)=>b.addedAt-a.addedAt,artist:(a,b)=>a.artist.localeCompare(b.artist,'ko')||a.title.localeCompare(b.title,'ko'),year:(a,b)=>(b.year??0)-(a.year??0)||a.title.localeCompare(b.title,'ko'),title:(a,b)=>a.title.localeCompare(b.title,'ko')};
  return [...albums].sort((a,b)=>by[sort](a,b)||a.key.localeCompare(b.key));
}
/** Albums whose artist, album, genre or any track title holds every search word. */
export function filterAlbums(albums:LocalAlbum[],{query,genre,tier}:{query:string;genre:string;tier:string}){
  const words=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return albums.filter(a=>(!genre||a.genre===genre)&&(!tier||a.tier===tier)&&words.every(w=>`${a.title} ${a.artist} ${a.genre} ${a.tracks.map(t=>t.title).join(' ')}`.toLocaleLowerCase().includes(w)));
}
/** What a new reading changes compared with the saved library. */
export function libraryDiff(before:LocalTrack[],after:LocalTrack[]){
  const old=new Map(before.map(t=>[t.path,t])),now=new Set(after.map(t=>t.path)),albums=new Set(before.map(albumKeyOf));
  const strip=({modified:_m,...rest}:LocalTrack)=>JSON.stringify(rest);
  return {newAlbums:new Set(after.map(albumKeyOf).filter(k=>!albums.has(k))).size,newTracks:after.filter(t=>!old.has(t.path)).length,changedTracks:after.filter(t=>old.has(t.path)&&strip(old.get(t.path)!)!==strip(t)).length,removedTracks:before.filter(t=>!now.has(t.path)).length};
}
export const formatLength=(seconds:number)=>{const h=Math.floor(seconds/3600),m=Math.round(seconds%3600/60);return h?`${h}시간 ${m}분`:`${m}분`;};
export const trackTime=(seconds:number|null)=>seconds===null?'':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
/** A steady colour per album for the frame when it has no cover. */
export function albumTone(key:string){const tones=['#3d4f6b','#2f5f57','#9a5b2e','#5a3f2e','#6b3d5e','#46636e','#38424d','#56602f','#7a3f35','#4a3a5c'];let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))>>>0;return tones[h%tones.length];}
export const albumMark=(title:string)=>{const words=title.replace(/[^\p{L}\p{N}\s]/gu,' ').trim().split(/\s+/).filter(Boolean);if(!words.length)return '♪';if(/[가-힣]/.test(words[0]))return words[0].slice(0,2);return words.slice(0,2).map(w=>w[0].toUpperCase()).join('');};

const isText=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
const isCount=(v:unknown,max:number)=>v===null||(Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=max);
/** Checks a library sent to the server. */
export function validateLocalLibrary(input:unknown):LocalLibrary{
  const d=input as LocalLibrary;
  if(!d||typeof d!=='object'||!isText(d.folder,200)||!isText(d.scannedAt,40)||!Number.isFinite(Date.parse(d.scannedAt))||!Array.isArray(d.tracks)||!d.tracks.length||d.tracks.length>MAX_LOCAL_TRACKS||!d.covers||typeof d.covers!=='object'||Array.isArray(d.covers))throw new Error('음원 라이브러리를 확인해주세요.');
  const tracks=d.tracks.map(t=>{
    if(!t||!isText(t.path,1000)||!safePath(t.path)||![t.title,t.artist,t.albumArtist,t.album].every(v=>isText(v,300)&&v)||!isText(t.genre,60)||!isText(t.format,12)||!isCount(t.track,9999)||!isCount(t.disc,99)||!isCount(t.year,3000)||!isCount(t.seconds,1000000)||!isCount(t.sampleRate,50000000)||!isCount(t.bits,64)||!isCount(t.kbps,100000)||typeof t.lossless!=='boolean'||!Number.isSafeInteger(t.modified)||t.modified<0)throw new Error(`곡 정보를 확인해주세요: ${typeof t?.path==='string'?t.path.slice(0,200):'경로 없음'}`);
    return {path:t.path,title:t.title,artist:t.artist,albumArtist:t.albumArtist,album:t.album,track:t.track,disc:t.disc,year:t.year,genre:t.genre,seconds:t.seconds,format:t.format,sampleRate:t.sampleRate,bits:t.bits,kbps:t.kbps,lossless:t.lossless,modified:t.modified};
  });
  const keys=new Set(tracks.map(albumKeyOf)),covers:Record<string,CoverRef>={};
  for(const [key,ref] of Object.entries(d.covers)){
    if(!keys.has(key)||!ref||typeof ref!=='object')continue;
    const id=typeof ref.id==='string'&&/^[a-f0-9]{32}$/.test(ref.id)?ref.id:undefined,url=typeof ref.url==='string'&&/^https:\/\/coverartarchive\.org\/[\w/.-]{1,300}$/.test(ref.url)?ref.url:undefined;
    if(id||url)covers[key]={...(id?{id}:{}),...(url?{url}:{})};
  }
  return {folder:d.folder,scannedAt:d.scannedAt,tracks,covers};
}
