import type {Entry} from './store.ts';
import {validateSpotify,validateListening,type SpotifyMetadata,type ListeningSession} from './spotify.ts';
import type {SpotifyEntity} from './spotify-account.ts';
import {validateLocalPlaylist,type SavedLocalPlaylist} from './local-playlist.ts';
export const musicFormats=['디지털','FLAC','CD','LP','스트리밍'];
export const musicStatuses=['컬렉션','위시리스트','감상 예정'];
export type AlbumMetadata={id:string;title:string;artist:string;firstReleaseDate:string;type:string;sourceUrl:string;coverUrl:string;checkedAt:string};
export type MusicDetails={artist:string;genre:string;releaseDate:string;rating:number|null;listenedAt:string;favoriteTrack:string;tags:string[];catalog?:AlbumMetadata;type?:'album'|'playlist';favorite?:boolean;spotify?:SpotifyMetadata;listens?:ListeningSession[];localCover?:string;localPlaylist?:SavedLocalPlaylist};
export const emptyMusic=():MusicDetails=>({artist:'',genre:'',releaseDate:'',rating:null,listenedAt:'',favoriteTrack:'',tags:[]});
export function spotifyMusicDraft(entity:SpotifyEntity):Entry{
  if(!['album','playlist'].includes(entity.type))throw new Error('앨범과 플레이리스트만 HUB 컬렉션에 추가할 수 있어요.');
  const type=entity.type as 'album'|'playlist';
  return {id:crypto.randomUUID(),kind:'music',title:entity.name.slice(0,200),detail:'',category:'스트리밍',status:'컬렉션',url:entity.url,date:'',done:false,createdAt:new Date().toISOString(),music:{...emptyMusic(),type,artist:entity.artist.slice(0,200),...(type==='playlist'?{favorite:true}:{}),spotify:{id:entity.id,type,url:entity.url,title:entity.name.slice(0,200),coverUrl:entity.coverUrl,checkedAt:new Date().toISOString()}}};
}
export function lastListenedAt(music?:MusicDetails){return (music?.listens??[]).reduce((date,s)=>s.date>date?s.date:date,music?.listenedAt??'');}
export function musicDate(value:unknown,partial=false){if(typeof value!=='string'||!(partial?/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/:/^\d{4}-\d{2}-\d{2}$/).test(value))return false;const full=value.length===4?value+'-01-01':value.length===7?value+'-01':value;const date=new Date(full+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===full;}
export function validateAlbum(input:unknown):AlbumMetadata{
  const a=input as AlbumMetadata;
  if(!a||typeof a.id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(a.id)||typeof a.title!=='string'||!a.title.trim()||a.title.length>200||typeof a.artist!=='string'||!a.artist.trim()||a.artist.length>200||typeof a.firstReleaseDate!=='string'||(a.firstReleaseDate&&!musicDate(a.firstReleaseDate,true))||typeof a.type!=='string'||a.type.length>50||a.sourceUrl!==`https://musicbrainz.org/release-group/${a.id}`||a.coverUrl!==`https://coverartarchive.org/release-group/${a.id}/front-250`||typeof a.checkedAt!=='string'||a.checkedAt.length>50||!/^\d{4}-\d\d-\d\dT/.test(a.checkedAt)||!Number.isFinite(Date.parse(a.checkedAt)))throw new Error('앨범 정보의 형식을 확인해주세요.');
  return {id:a.id,title:a.title,artist:a.artist,firstReleaseDate:a.firstReleaseDate,type:a.type,sourceUrl:a.sourceUrl,coverUrl:a.coverUrl,checkedAt:a.checkedAt};
}
export function validateMusic(input:unknown):MusicDetails{
  const m=input as MusicDetails;
  if(!m||typeof m!=='object'||typeof m.artist!=='string'||m.artist.length>200||typeof m.genre!=='string'||m.genre.length>100||typeof m.releaseDate!=='string'||(m.releaseDate&&!musicDate(m.releaseDate,true))||(m.rating!==null&&(typeof m.rating!=='number'||!Number.isFinite(m.rating)||m.rating<0||m.rating>5||m.rating*2%1!==0))||typeof m.listenedAt!=='string'||(m.listenedAt&&!musicDate(m.listenedAt))||typeof m.favoriteTrack!=='string'||m.favoriteTrack.length>200||!Array.isArray(m.tags)||m.tags.length>8||m.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>30))throw new Error('아티스트·별점·날짜·태그를 확인해주세요.');
  if(m.type!==undefined&&!['album','playlist'].includes(m.type)||m.favorite!==undefined&&typeof m.favorite!=='boolean')throw new Error('음악 종류와 즐겨찾기를 확인해주세요.');
  const spotify=m.spotify!==undefined?validateSpotify(m.spotify):undefined;
  if(spotify&&spotify.type!==(m.type??'album'))throw new Error('음악 종류와 Spotify 링크 종류가 달라요.');
  if(m.localCover!==undefined&&(typeof m.localCover!=='string'||!/^[a-f0-9]{32}$/.test(m.localCover)))throw new Error('내 음원 표지 정보를 확인해주세요.');
  if(m.localPlaylist!==undefined&&(m.type!=='playlist'||spotify||m.catalog!==undefined))throw new Error('내 음원 플레이리스트 종류를 확인해주세요.');
  return {artist:m.artist,genre:m.genre,releaseDate:m.releaseDate,rating:m.rating,listenedAt:m.listenedAt,favoriteTrack:m.favoriteTrack,tags:[...new Set(m.tags.map(t=>t.trim()))],...(m.catalog!==undefined?{catalog:validateAlbum(m.catalog)}:{}),...(m.type!==undefined?{type:m.type}:{}),...(m.favorite!==undefined?{favorite:m.favorite}:{}),...(spotify?{spotify}:{}),...(m.listens!==undefined?{listens:validateListening(m.listens)}:{}),...(m.localCover!==undefined?{localCover:m.localCover}:{}),...(m.localPlaylist!==undefined?{localPlaylist:validateLocalPlaylist(m.localPlaylist)}:{})};
}
export function musicStats(entries:Entry[]){const albums=entries.filter(e=>e.kind==='music'&&e.music?.type!=='playlist'),rated=albums.filter(e=>e.music?.rating!=null);return {count:albums.length,collection:albums.filter(e=>e.status==='컬렉션').length,wishlist:albums.filter(e=>e.status==='위시리스트').length,rated:rated.length,average: rated.length?Math.round(rated.reduce((sum,e)=>sum+(e.music?.rating??0),0)/rated.length*10)/10:null};}
/** The cover to show for an album or playlist: Spotify, then MusicBrainz, then the thumbnail saved from the PC music folder. */
export function musicCoverUrl(music?:MusicDetails){return music?.spotify?.coverUrl||music?.catalog?.coverUrl||(music?.localCover?`/api/music/local/cover?id=${music.localCover}`:'');}
/** "앨범 14장 · 플레이리스트 3개 · 이번 달 감상 9번" for the music page heading. */
export function musicSummary(entries:Entry[],today:string){
  const music=entries.filter(e=>e.kind==='music'),albums=music.filter(e=>e.music?.type!=='playlist').length,playlists=music.length-albums,month=today.slice(0,7);
  const listens=music.reduce((n,e)=>n+(e.music?.listens??[]).filter(l=>l.date.startsWith(month)).length,0);
  return [`앨범 ${albums}장`,...(playlists?[`플레이리스트 ${playlists}개`]:[]),...(listens?[`이번 달 감상 ${listens}번`]:[])].join(' · ');
}
