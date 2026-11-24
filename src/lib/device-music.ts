/**
 * The music on a portable player (FiiO M23 and other Android DAPs), read from a playlist exported by FiiO Music.
 * Only paths and the #EXTINF line are kept; artist, album, title and format are read from the path, so no audio
 * file ever leaves the device.
 */
export type StoredTrack={p:string;s?:number;a?:string;t?:string};
export type DeviceLibrary={name:string;suffix:string;importedAt:string;tracks:StoredTrack[]};
export type DeviceTrack={path:string;title:string;artist:string;album:string;disc:number|null;track:number|null;format:string;seconds:number|null;volume:string;folder:string};

export const MAX_TRACKS=20000;
/** Albums are told apart by artist too, since many artists have an album called e.g. "Live" or "Greatest Hits". */
export const albumKey=(t:DeviceTrack)=>`${t.album} — ${t.artist}`;
const MAX_PATH=1000;
const formats:Record<string,string>={flac:'FLAC',mp3:'MP3',dsf:'DSD',dff:'DSD',wav:'WAV',m4a:'M4A',alac:'ALAC',aac:'AAC',ape:'APE',ogg:'OGG',opus:'OPUS',wv:'WV',aiff:'AIFF',aif:'AIFF',wma:'WMA',iso:'ISO'};
const genericFolders=/^(music|musics|음악|노래|songs?|audio|media|download|downloads)$/i;
const discFolder=/^(cd|disc|disk|디스크)\s*\d{1,2}$/i;

/** Reads an M3U/M3U8 playlist: one path per line, an optional #EXTINF:seconds,Artist - Title before it. Repeated paths count once. */
export function parseM3u(text:string):StoredTrack[]{
  const tracks:StoredTrack[]=[],seen=new Set<string>();let info:{s?:number;a?:string;t?:string}={};
  for(const raw of text.replace(/^﻿/,'').split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    if(line.startsWith('#')){
      const m=line.match(/^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/i);
      if(m){const seconds=Math.round(Number(m[1])),label=m[2].trim(),split=label.indexOf(' - ');info={...(seconds>0?{s:Math.min(seconds,100000)}:{}),...(split>0?{a:label.slice(0,split).trim().slice(0,300),t:label.slice(split+3).trim().slice(0,300)}:label?{t:label.slice(0,300)}:{})};}
      continue;
    }
    const path=line.replace(/\\/g,'/').slice(0,MAX_PATH);
    if(!seen.has(path)&&tracks.length<MAX_TRACKS){seen.add(path);tracks.push({p:path,...info});}
    info={};
  }
  return tracks;
}

/** The storage a path lives on and the folders after it: /storage/emulated/0/… is 내장, /storage/<id>/… a memory card. */
function splitPath(path:string){
  const parts=path.split('/').filter(Boolean);
  if(parts[0]==='storage'&&parts[1]==='emulated'&&/^\d+$/.test(parts[2]??''))return {volume:'내장 메모리',rest:parts.slice(3)};
  if(parts[0]==='storage'&&parts[1])return {volume:parts[1]==='self'?'내장 메모리':'메모리 카드',rest:parts.slice(2)};
  if(parts[0]==='sdcard')return {volume:'내장 메모리',rest:parts.slice(1)};
  return {volume:'기타',rest:parts};
}
/** Artist, album, disc, track number, title and format guessed from a path laid out like …/Artist/Album/(CD1/)01 Title.flac. */
export function trackFromPath(stored:StoredTrack):DeviceTrack{
  const {volume,rest}=splitPath(stored.p);
  const file=rest.at(-1)??stored.p,dot=file.lastIndexOf('.'),ext=dot>0?file.slice(dot+1).toLowerCase():'',base=dot>0?file.slice(0,dot):file;
  let dirs=rest.slice(0,-1);while(dirs.length&&genericFolders.test(dirs[0]))dirs=dirs.slice(1);
  let disc:number|null=null;
  if(dirs.length&&discFolder.test(dirs.at(-1)!)){disc=Number(dirs.at(-1)!.replace(/\D/g,''));dirs=dirs.slice(0,-1);}
  const numbered=base.match(/^(?:(\d{1,2})[-.](?=\d))?(\d{1,3})[\s._-]+(.+)$/);
  const track=numbered?Number(numbered[2]):null;if(numbered?.[1])disc=Number(numbered[1]);
  let title=(numbered?numbered[3]:base).trim(),artist=dirs.length>=2?dirs.at(-2)!:'';
  const album=dirs.at(-1)??'';
  const dash=title.indexOf(' - ');
  if(!artist&&dash>0){artist=title.slice(0,dash).trim();title=title.slice(dash+3).trim();}
  return {path:stored.p,title:stored.t||title,artist:stored.a||artist||'아티스트 미상',album:album||'앨범 미상',disc,track,format:formats[ext]??(ext.toUpperCase()||'기타'),seconds:stored.s??null,volume,folder:dirs.join('/')};
}

/** Checks a library sent to the server: paths only absolute and bounded, at most MAX_TRACKS. */
export function validateDeviceLibrary(input:unknown):DeviceLibrary{
  const d=input as DeviceLibrary;
  if(!d||typeof d!=='object'||typeof d.name!=='string'||d.name.length>200||typeof d.suffix!=='string'||!/^(\.[a-z0-9]{1,10}){1,2}$/i.test(d.suffix)||typeof d.importedAt!=='string'||!Number.isFinite(Date.parse(d.importedAt))||!Array.isArray(d.tracks)||!d.tracks.length||d.tracks.length>MAX_TRACKS)throw new Error('곡 목록을 확인해주세요.');
  const tracks=d.tracks.map(t=>{
    if(!t||typeof t.p!=='string'||!t.p.startsWith('/')||t.p.length>MAX_PATH||/[\u0000-\u001f]/.test(t.p)||(t.s!==undefined&&(!Number.isSafeInteger(t.s)||t.s<1||t.s>100000))||[t.a,t.t].some(v=>v!==undefined&&(typeof v!=='string'||v.length>300)))throw new Error('곡 경로를 확인해주세요.');
    return {p:t.p,...(t.s!==undefined?{s:t.s}:{}),...(t.a?{a:t.a}:{}),...(t.t?{t:t.t}:{})};
  });
  return {name:d.name,suffix:d.suffix,importedAt:d.importedAt,tracks};
}

export type PlaylistRules={query:string;artists:string[];albums:string[];formats:string[];volumes:string[];limit:'count'|'minutes';amount:number;order:'shuffle'|'album'|'artist';seed:number};
export const defaultRules=():PlaylistRules=>({query:'',artists:[],albums:[],formats:[],volumes:[],limit:'count',amount:30,order:'shuffle',seed:1});
/** A small seeded shuffle (mulberry32) so "다시 섞기" gives a new order and the same seed gives the same one. */
function shuffled<T>(list:T[],seed:number){let a=seed>>>0;const rand=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
const byAlbum=(a:DeviceTrack,b:DeviceTrack)=>a.artist.localeCompare(b.artist,'ko')||a.album.localeCompare(b.album,'ko')||(a.disc??0)-(b.disc??0)||(a.track??999)-(b.track??999)||a.path.localeCompare(b.path);
/**
 * Picks tracks by the rules: every word of the search must appear in the artist, album, title or folder; the
 * artist/album/format/storage lists keep only tracks in them (empty means all). Then ordered and cut to a number of
 * tracks or minutes (tracks without a length count as 4 minutes).
 */
export function selectTracks(tracks:DeviceTrack[],rules:PlaylistRules,excluded:Set<string>=new Set()){
  const words=rules.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const match=tracks.filter(t=>!excluded.has(t.path)&&(!rules.artists.length||rules.artists.includes(t.artist))&&(!rules.albums.length||rules.albums.includes(albumKey(t)))&&(!rules.formats.length||rules.formats.includes(t.format))&&(!rules.volumes.length||rules.volumes.includes(t.volume))&&words.every(w=>`${t.artist} ${t.album} ${t.title} ${t.folder}`.toLocaleLowerCase().includes(w)));
  const ordered=rules.order==='shuffle'?shuffled(match,rules.seed):[...match].sort(rules.order==='album'?byAlbum:(a,b)=>a.artist.localeCompare(b.artist,'ko')||byAlbum(a,b));
  const amount=Math.max(1,Math.min(Math.floor(rules.amount)||1,rules.limit==='count'?2000:6000));
  if(rules.limit==='count')return {matched:match.length,tracks:ordered.slice(0,amount)};
  const out:DeviceTrack[]=[];let seconds=0;
  for(const t of ordered){const length=t.seconds??240;if(out.length&&seconds+length>amount*60)break;out.push(t);seconds+=length;}
  return {matched:match.length,tracks:out};
}
export const totalSeconds=(tracks:DeviceTrack[])=>tracks.reduce((sum,t)=>sum+(t.seconds??0),0);
export const unknownLengths=(tracks:DeviceTrack[])=>tracks.filter(t=>t.seconds===null).length;

/** The playlist file FiiO Music imports: UTF-8 extended M3U with the device's own absolute paths. */
export function playlistM3u(name:string,tracks:DeviceTrack[]){
  const lines=['#EXTM3U',`#PLAYLIST:${name.replace(/[\r\n]/g,' ').trim()}`];
  for(const t of tracks)lines.push(`#EXTINF:${t.seconds??-1},${t.artist} - ${t.title}`.replace(/[\r\n]/g,' '),t.path);
  return lines.join('\n')+'\n';
}
/** A file name that works on Windows and Android, ending like the playlist FiiO Music exported. */
export function playlistFileName(name:string,suffix:string){const base=name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'HUB 플레이리스트';return base+(suffix||'.m3u8');}
/** The extension of an exported playlist file (".playlist.m3u8", ".m3u8" or ".m3u"), reused for the files HUB makes. */
export function playlistSuffix(fileName:string){const m=fileName.toLowerCase().match(/(\.playlist)?\.m3u8?$/);return m?m[0]:'.m3u8';}
