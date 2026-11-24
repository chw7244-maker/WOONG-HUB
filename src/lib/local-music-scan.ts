/**
 * Reads a music folder picked in the browser (Chrome/Edge): tags with music-metadata, one cover per album made
 * into a 300px JPEG thumbnail. Runs only in the browser; nothing is sent anywhere here.
 */
import {AUDIO_EXTENSIONS,COVER_NAMES,albumFolder,albumKeyOf,trackFromTags,type CoverRef,type LocalLibrary,type LocalTrack} from './local-music.ts';

export type ScanProgress={read:number;total:number;covers:number;coverTotal:number;current:string;skipped:number};
export type ScanResult={library:LocalLibrary;thumbnails:Map<string,Blob>;skipped:number};
const THUMB=300,MAX_THUMB_BYTES=78*1024;
const relative=(file:File)=>{const parts=(file.webkitRelativePath||file.name).split('/');return {root:parts.length>1?parts[0]:'',path:(parts.length>1?parts.slice(1):parts).join('/')};};
const ext=(name:string)=>(name.split('.').pop()??'').toLowerCase();

async function sha32(blob:Blob){const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);}
/** A square, centre-cropped JPEG of at most 300px, small enough for the server (quality steps down if needed). */
export async function thumbnail(image:Blob):Promise<Blob|null>{
  try{
    const bitmap=await createImageBitmap(image),side=Math.min(bitmap.width,bitmap.height),size=Math.min(THUMB,side);
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size);bitmap.close();
    for(const quality of [.82,.7,.55]){const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=MAX_THUMB_BYTES)return blob;}
    return null;
  }catch{return null;}
}

/** Reads every audio file under the picked folder (4 at a time) and makes one thumbnail per album folder. */
export async function scanFolder(files:File[],onProgress:(p:ScanProgress)=>void,signal:AbortSignal):Promise<ScanResult>{
  const {parseBlob}=await import('music-metadata');
  const audio=files.filter(f=>AUDIO_EXTENSIONS.includes(ext(f.name))&&!f.name.startsWith('._'));
  const images=new Map<string,File>();
  for(const f of files)if(COVER_NAMES.test(f.name)){const {path}=relative(f),dir=path.split('/').slice(0,-1).join('/');if(!images.has(dir))images.set(dir,f);}
  const root=relative(audio[0]??files[0]??new File([],'')).root||'음악 폴더';
  const tracks:LocalTrack[]=[],pictures=new Map<string,Blob>(),progress:ScanProgress={read:0,total:audio.length,covers:0,coverTotal:0,current:'',skipped:0};
  let next=0;
  async function worker(){
    while(next<audio.length&&!signal.aborted){
      const file=audio[next++],{path}=relative(file),folder=albumFolder(path);
      progress.current=path;
      try{
        const meta=await parseBlob(file,{skipCovers:pictures.has(folder),duration:false});
        tracks.push(trackFromTags(path,meta.common,meta.format,file.lastModified||0));
        const pic=meta.common.picture?.find(p=>/front/i.test(p.type??''))??meta.common.picture?.[0];
        if(pic&&!pictures.has(folder))pictures.set(folder,new Blob([new Uint8Array(pic.data)],{type:pic.format}));
      }catch{progress.skipped++;}
      progress.read++;onProgress({...progress});
    }
  }
  await Promise.all(Array.from({length:4},worker));
  if(signal.aborted)throw new DOMException('멈췄어요.','AbortError');

  // One cover per album: the embedded picture, else cover/folder/front image in the album folder (or a disc folder in it).
  const folders=new Map<string,string>();for(const t of tracks){const folder=albumFolder(t.path),key=albumKeyOf(t);if(!folders.has(key))folders.set(key,folder);}
  const covers:Record<string,CoverRef>={},thumbnails=new Map<string,Blob>();
  progress.coverTotal=folders.size;onProgress({...progress});
  for(const [key,folder] of folders){
    if(signal.aborted)throw new DOMException('멈췄어요.','AbortError');
    const disc=[...images.keys()].find(dir=>dir.startsWith(folder+'/'));
    const source=pictures.get(folder)??images.get(folder)??(disc?images.get(disc):undefined)??[...pictures].find(([dir])=>dir.startsWith(folder+'/'))?.[1];
    const thumb=source?await thumbnail(source):null;
    if(thumb){const id=await sha32(thumb);covers[key]={id};thumbnails.set(id,thumb);}
    progress.covers++;onProgress({...progress});
  }
  return {library:{folder:root.slice(0,200),scannedAt:new Date().toISOString(),tracks:tracks.slice(0,20000),covers},thumbnails,skipped:progress.skipped};
}
