import type {Entry} from './store.ts';
import {emptyGame,steamAppId,validateGame,validateSteam,type SteamMetadata} from './games.ts';
import {emptyMusic,validateMusic,type AlbumMetadata} from './music.ts';
import {validateWatch,type WatchCatalogItem,type WatchStatus} from './watch.ts';

/** A game found by name in the Steam store, before its store details are read. */
export type SteamSearchItem={appId:number;name:string;imageUrl:string};
export type WishlistItem={appId:number;addedAt:string};

const base=(kind:Entry['kind'],title:string,now:Date,createdAt?:string)=>({id:crypto.randomUUID(),kind,title:title.trim().slice(0,200),detail:'',category:'',status:'',url:'',date:'',done:false,createdAt:createdAt||now.toISOString()});

/** Every Steam App ID the HUB's games already point at, by store details or by a linked account. */
export function gameAppIds(entries:Entry[]){const ids=new Set<number>();for(const e of entries){if(e.kind!=='games')continue;const store=e.game?.steam?.appId,linked=e.game?.steamAccount?.appId;if(store)ids.add(store);if(linked)ids.add(linked);}return ids;}
/** A Steam store link or a bare App ID typed into the quick add box, or null for a name. */
export const steamReference=(query:string)=>{const value=query.trim();return /^\d+$/.test(value)||value.startsWith('https://')?steamAppId(value):null;};

/** A new game: with store details when Steam answered, otherwise just the name (details can be filled later). */
export function steamGameEntry({name,steam}:{name:string;steam?:SteamMetadata},status:string,now=new Date(),createdAt?:string):Entry{
  const details=steam?validateSteam(steam):undefined;
  return {...base('games',details?.name||name,now,createdAt),category:'PC',status,url:details?.storeUrl??'',game:validateGame({...emptyGame(),...(details?{steam:details}:{})})};
}
/** Adds store details to a game that has none, keeping its own title and records. */
export function withStoreInfo(entry:Entry,steam:SteamMetadata):Entry{
  const game=validateGame({...(entry.game??emptyGame()),steam:validateSteam(steam)});
  return {...entry,url:entry.url||game.steam?.storeUrl||'',game};
}
/** Games linked to a Steam account (so the App ID is known) that have no store details yet. */
export const storeInfoMissing=(entries:Entry[])=>entries.filter(e=>e.kind==='games'&&!!e.game?.steamAccount&&!e.game.steam);

/**
 * Compares the Steam wishlist with the HUB: `fresh` are wishlisted App IDs the HUB has no game for (newest first);
 * `gone` are HUB wishlist games whose App ID is no longer on the Steam wishlist. Nothing is removed for those.
 */
export function wishlistChanges(entries:Entry[],items:WishlistItem[]){
  const known=gameAppIds(entries),onSteam=new Set(items.map(i=>i.appId));
  const fresh=items.filter(i=>!known.has(i.appId)).sort((a,b)=>b.addedAt.localeCompare(a.addedAt));
  const gone=entries.filter(e=>e.kind==='games'&&e.status==='위시리스트'&&!!e.game?.steam&&!onSteam.has(e.game.steam.appId)).map(e=>e.id);
  return {fresh,gone};
}

export const tmdbLink=(type:'movie'|'tv',item:WatchCatalogItem)=>`https://www.themoviedb.org/${type}/${item.id}?language=ko-KR`;
export function watchEntry(item:WatchCatalogItem,type:'movie'|'tv',status:WatchStatus,now=new Date()):Entry{
  return {...base('watch',item.title,now),url:tmdbLink(type,item),watch:validateWatch({type,status,catalog:item,updatedAt:now.toISOString()})};
}
export function albumEntry(album:AlbumMetadata,status:string,now=new Date()):Entry{
  return {...base('music',album.title,now),category:'디지털',status,url:album.sourceUrl,music:validateMusic({...emptyMusic(),artist:album.artist,releaseDate:album.firstReleaseDate,catalog:album,type:'album'})};
}
