import {musicDate} from './music.ts';

export type SpotifyResource={type:'album'|'playlist';id:string;url:string};
export type SpotifyMetadata=SpotifyResource&{title:string;coverUrl:string;checkedAt:string};
export type ListeningSession={id:string;date:string;track:string;equipment:string;rating:number|null;note:string;createdAt:string};

export function spotifyResource(input:unknown,expected?:SpotifyResource['type']):SpotifyResource {
  if(typeof input!=='string'||input.length>2000)throw new Error('Spotify 앨범 또는 플레이리스트 공유 링크를 입력해주세요.');
  const value=input.trim();let match=value.match(/^spotify:(album|playlist):([a-zA-Z0-9]{22})$/);
  if(!match){
    let url;try{url=new URL(value);}catch{throw new Error('Spotify 공유 링크를 확인해주세요.');}
    if(url.protocol!=='https:'||url.hostname!=='open.spotify.com'||url.port||url.username||url.password)throw new Error('open.spotify.com의 전체 공유 링크를 사용해주세요.');
    match=url.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(album|playlist)\/([a-zA-Z0-9]{22})\/?$/);
  }
  if(!match||expected&&match[1]!==expected)throw new Error(expected==='album'?'Spotify 앨범 링크를 입력해주세요.':expected==='playlist'?'Spotify 플레이리스트 링크를 입력해주세요.':'앨범 또는 플레이리스트 링크만 연결할 수 있어요.');
  const type=match[1] as SpotifyResource['type'],id=match[2];return {type,id,url:`https://open.spotify.com/${type}/${id}`};
}
export function spotifyCover(input:unknown){
  if(input==='')return '';
  if(typeof input!=='string'||input.length>2000)throw new Error('Spotify 표지 주소를 확인해주세요.');
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['i.scdn.co','mosaic.scdn.co','image-cdn-ak.spotifycdn.com','image-cdn-fa.spotifycdn.com'].includes(url.hostname))throw new Error('Spotify 표지 주소를 확인해주세요.');
  return url.href;
}
export function validateSpotify(input:unknown):SpotifyMetadata{
  const s=input as SpotifyMetadata;if(!s)throw new Error('Spotify 연결 정보를 확인해주세요.');const resource=spotifyResource(s.url);
  if(resource.id!==s.id||resource.type!==s.type||resource.url!==s.url||typeof s.title!=='string'||!s.title.trim()||s.title.length>200||typeof s.checkedAt!=='string'||s.checkedAt.length>50||!/^\d{4}-\d\d-\d\dT/.test(s.checkedAt)||!Number.isFinite(Date.parse(s.checkedAt)))throw new Error('Spotify 연결 정보를 확인해주세요.');
  return {...resource,title:s.title,coverUrl:spotifyCover(s.coverUrl),checkedAt:s.checkedAt};
}
export function validateListening(input:unknown):ListeningSession[]{
  if(!Array.isArray(input)||input.length>200)throw new Error('감상 기록은 항목당 최대 200개까지 보관할 수 있어요.');const ids=new Set();
  return input.map(s=>{
    if(!s||typeof s.id!=='string'||!s.id||s.id.length>100||ids.has(s.id)||!musicDate(s.date)||typeof s.track!=='string'||s.track.length>200||typeof s.equipment!=='string'||s.equipment.length>200||typeof s.note!=='string'||s.note.length>3000||s.rating!==null&&(typeof s.rating!=='number'||!Number.isFinite(s.rating)||s.rating<0||s.rating>5||s.rating*2%1!==0)||typeof s.createdAt!=='string'||s.createdAt.length>50||!Number.isFinite(Date.parse(s.createdAt)))throw new Error('감상 날짜·별점·메모를 확인해주세요.');
    ids.add(s.id);return {id:s.id,date:s.date,track:s.track,equipment:s.equipment,rating:s.rating,note:s.note,createdAt:s.createdAt};
  });
}
