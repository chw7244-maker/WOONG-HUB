export type SpotifyEntity={id:string;type:'track'|'album'|'artist'|'playlist'|'episode';name:string;artist:string;albumName:string;coverUrl:string;url:string;uri:string;durationMs:number;explicit:boolean;playable:boolean;ownerId?:string;editable?:boolean;itemCount?:number|null};
export type SpotifyDevice={id:string;name:string;type:string;active:boolean;restricted:boolean;volume:number|null;supportsVolume:boolean};
export type SpotifyPlayback={item:SpotifyEntity|null;playing:boolean;progressMs:number;durationMs:number;shuffle:boolean;repeat:'off'|'track'|'context';device:SpotifyDevice|null;disallows:Record<string,boolean>;checkedAt:number};
export type SpotifyPage={items:SpotifyEntity[];offset:number;hasMore:boolean;nextOffset:number;total:number|null};
export const spotifyTime=(ms:number)=>{const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
