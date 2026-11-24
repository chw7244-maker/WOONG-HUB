export type SteamAccountRef={steamId:string;appId:number};
export const steamLibraryHref=(steamId:string,appId?:number)=>'/games/steam/?'+new URLSearchParams({steamId,...(appId?{q:String(appId)}:{})});
export type SteamOwnedGame={appId:number;name:string;totalMinutes:number|null;recentMinutes:number|null;lastPlayedAt:string;imageUrl:string;storeUrl:string};
export type SteamLinkedAccount={steamId:string;name:string;avatarUrl:string;profileUrl:string;connectedAt:string;ownedAt:string;recentAt:string;error:string;recentError:string;retryAt:number;count:number|null};
export type SteamAccountStatus={configured:boolean;hasKey:boolean;keySource:'user'|'server'|'none';accounts:SteamLinkedAccount[];activeSteamId:string};
export type SteamEntryStat={steamId:string;appId:number;accountName:string;game:SteamOwnedGame|null;checkedAt:string;error:string;connected:boolean};
export type SteamSnapshotStats={owned:number|null;totalMinutes:number;recorded:number;recentCount:number|null;recentMinutes:number;recentRecorded:number};
export type SteamSummary={accounts:{steamId:string;name:string}[];activeSteamId:string;account:SteamLinkedAccount|null;stats:SteamSnapshotStats|null;recentGames:SteamOwnedGame[]};
export type SteamSearchItem=SteamOwnedGame&{steamId:string;accountName:string;checkedAt:string;error:string};
export type SteamSearchResult={items:SteamSearchItem[];count:number;hasMore:boolean;nextOffset:number;accounts:{steamId:string;name:string;checkedAt:string;error:string}[]};
export function steamId64(value:unknown):string|null{if(typeof value!=='string'||!/^\d{17}$/.test(value))return null;try{const id=BigInt(value);return id>BigInt('76561197960265728')&&id<=BigInt('76561202255233023')?value:null;}catch{return null;}}
export function validateSteamRef(input:unknown):SteamAccountRef{const value=input as SteamAccountRef;if(!value||!steamId64(value.steamId)||!Number.isSafeInteger(value.appId)||value.appId<1||value.appId>2147483647)throw new Error('Steam 계정·게임 연결 정보를 확인해주세요.');return {steamId:value.steamId,appId:value.appId};}
