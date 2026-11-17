import type {Entry} from './store.ts';
export const musicFormats=['디지털','FLAC','CD','LP','스트리밍'];
export const musicStatuses=['컬렉션','위시리스트','감상 예정'];
export type AlbumMetadata={id:string;title:string;artist:string;firstReleaseDate:string;type:string;sourceUrl:string;coverUrl:string;checkedAt:string};
export type MusicDetails={artist:string;genre:string;releaseDate:string;rating:number|null;listenedAt:string;favoriteTrack:string;tags:string[];catalog?:AlbumMetadata};
export const emptyMusic=():MusicDetails=>({artist:'',genre:'',releaseDate:'',rating:null,listenedAt:'',favoriteTrack:'',tags:[]});
export function musicDate(value:unknown,partial=false){if(typeof value!=='string'||!(partial?/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/:/^\d{4}-\d{2}-\d{2}$/).test(value))return false;const full=value.length===4?value+'-01-01':value.length===7?value+'-01':value;const date=new Date(full+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===full;}
export function validateAlbum(input:unknown):AlbumMetadata{
  const a=input as AlbumMetadata;
  if(!a||typeof a.id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(a.id)||typeof a.title!=='string'||!a.title.trim()||a.title.length>200||typeof a.artist!=='string'||!a.artist.trim()||a.artist.length>200||typeof a.firstReleaseDate!=='string'||(a.firstReleaseDate&&!musicDate(a.firstReleaseDate,true))||typeof a.type!=='string'||a.type.length>50||a.sourceUrl!==`https://musicbrainz.org/release-group/${a.id}`||a.coverUrl!==`https://coverartarchive.org/release-group/${a.id}/front-250`||typeof a.checkedAt!=='string'||a.checkedAt.length>50||!/^\d{4}-\d\d-\d\dT/.test(a.checkedAt)||!Number.isFinite(Date.parse(a.checkedAt)))throw new Error('앨범 정보의 형식을 확인해주세요.');
  return {id:a.id,title:a.title,artist:a.artist,firstReleaseDate:a.firstReleaseDate,type:a.type,sourceUrl:a.sourceUrl,coverUrl:a.coverUrl,checkedAt:a.checkedAt};
}
export function validateMusic(input:unknown):MusicDetails{
  const m=input as MusicDetails;
  if(!m||typeof m!=='object'||typeof m.artist!=='string'||m.artist.length>200||typeof m.genre!=='string'||m.genre.length>100||typeof m.releaseDate!=='string'||(m.releaseDate&&!musicDate(m.releaseDate,true))||(m.rating!==null&&(typeof m.rating!=='number'||!Number.isFinite(m.rating)||m.rating<0||m.rating>5||m.rating*2%1!==0))||typeof m.listenedAt!=='string'||(m.listenedAt&&!musicDate(m.listenedAt))||typeof m.favoriteTrack!=='string'||m.favoriteTrack.length>200||!Array.isArray(m.tags)||m.tags.length>8||m.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>30))throw new Error('아티스트·별점·날짜·태그를 확인해주세요.');
  return {artist:m.artist,genre:m.genre,releaseDate:m.releaseDate,rating:m.rating,listenedAt:m.listenedAt,favoriteTrack:m.favoriteTrack,tags:[...new Set(m.tags.map(t=>t.trim()))],...(m.catalog!==undefined?{catalog:validateAlbum(m.catalog)}:{})};
}
export function musicStats(entries:Entry[]){const albums=entries.filter(e=>e.kind==='music'),rated=albums.filter(e=>e.music?.rating!=null);return {count:albums.length,collection:albums.filter(e=>e.status==='컬렉션').length,wishlist:albums.filter(e=>e.status==='위시리스트').length,rated:rated.length,average: rated.length?Math.round(rated.reduce((sum,e)=>sum+(e.music?.rating??0),0)/rated.length*10)/10:null};}
