import { initial, KEY, type HubData, validateData } from './store.ts';
import { mergeData, same } from './merge.ts';

export type Phase = 'connecting' | 'synced' | 'pending' | 'saving' | 'offline' | 'error' | 'auth';
export type SyncState = {
  data: HubData; ready: boolean; phase: Phase; userId: string | null; revision: number;
  updatedAt: string | null; error: string; conflicts: number; migration: HubData | null;
  localPreview: boolean;
};
type Remote = {userId:string; revision:number; data:HubData; updatedAt:string|null; localPreview?:boolean};
type Cache = {version:2; data:HubData; base:HubData; revision:number; migratedLegacy:string; draftId:string};
type Environment = {fetch:typeof fetch; storage:Pick<Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>; online:()=>boolean; auto?:boolean};
const serverState: SyncState = {data:initial,ready:false,phase:'connecting',userId:null,revision:0,updatedAt:null,error:'',conflicts:0,migration:null,localPreview:false};
function fingerprint(data:HubData) {
  let h=2166136261;for(const c of JSON.stringify(data))h=Math.imul(h^c.charCodeAt(0),16777619);
  return `v1-${(h>>>0).toString(36)}`;
}
function asRemote(value:unknown): Remote {
  const r=value as Remote;
  if(!r || typeof r.userId!=='string' || !r.userId || !Number.isSafeInteger(r.revision) || r.revision<0 || (r.updatedAt!==null&&typeof r.updatedAt!=='string'))throw new Error('서버 응답을 확인하지 못했어요.');
  return {...r,data:validateData(r.data)};
}

export class SyncClient {
  private state:SyncState=serverState;
  private base:HubData=initial;
  private listeners=new Set<()=>void>();
  private busy=false;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private poll:ReturnType<typeof setInterval>|undefined;
  private migratedLegacy='';
  private clientId=crypto.randomUUID();
  private draftId=crypto.randomUUID();
  private recovered=new Map<string,string>();
  private started=false;
  private env:Environment;
  constructor(env:Environment){this.env=env;}
  getSnapshot=()=>this.state;
  getServerSnapshot=()=>serverState;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  private update(patch:Partial<SyncState>){this.state={...this.state,...patch};for(const l of this.listeners)l();}
  private prefix(userId=this.state.userId){return `woong-hub:sync:v2:${encodeURIComponent(userId??'')}:`;}
  private key(userId=this.state.userId){return this.prefix(userId)+this.clientId;}
  private migrationKey(userId=this.state.userId){return `woong-hub:migrated:${encodeURIComponent(userId??'')}`;}
  private dirty(){return !same(this.state.data,this.base);}
  private cache(data=this.state.data,base=this.base,revision=this.state.revision) {
    if(same(data,base)) {
      if(this.migratedLegacy)this.env.storage.setItem(this.migrationKey(),this.migratedLegacy);
      this.env.storage.removeItem(this.key());return;
    }
    this.env.storage.setItem(this.key(),JSON.stringify({version:2,data,base,revision,migratedLegacy:this.migratedLegacy,draftId:this.draftId} satisfies Cache));
  }
  private restoreDrafts(userId:string,working:HubData) {
    let conflicts=0;let error='';
    const keys=Array.from({length:this.env.storage.length},(_,i)=>this.env.storage.key(i)).filter((key):key is string=>!!key&&key.startsWith(this.prefix(userId))&&key!==this.key(userId));
    for(const key of keys) {
      try {
        const raw=this.env.storage.getItem(key);if(!raw)continue;
        const c=JSON.parse(raw) as Cache;
        if(c.version!==2 || !Number.isSafeInteger(c.revision) || c.revision<0 || typeof c.draftId!=='string')throw new Error();
        const data=validateData(c.data),base=validateData(c.base);
        if(c.migratedLegacy)this.migratedLegacy=c.migratedLegacy;
        if(same(data,base)||this.recovered.get(key)===c.draftId||this.env.storage.getItem(`woong-hub:ack:${key}`)===c.draftId)continue;
        const merged=mergeData(base,data,working);working=merged.data;conflicts+=merged.conflicts;this.recovered.set(key,c.draftId);
      }catch{error='기기에 남은 일부 변경을 읽지 못했어요. 원본은 보존했으며 서버 기록을 표시합니다.';}
    }
    return {working,conflicts,error};
  }
  private acknowledgeRecovered() {
    for(const [key,draftId] of this.recovered) {
      this.env.storage.setItem(`woong-hub:ack:${key}`,draftId);
    }
  }
  private async request(init?:RequestInit) {
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await this.env.fetch('/api/hub',{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(response.status===401 || !response.headers.get('content-type')?.includes('application/json')) {
        this.update({phase:'auth',error:'로그인한 계정을 확인해주세요.'});
        return null;
      }
      const body=await response.json();
      if(!response.ok && !(response.status===409&&body.error==='revision_conflict')) {
        if(response.status===413)throw new Error('저장 용량(1MB)을 초과했어요. 기록을 백업하고 일부 내용을 줄여주세요.');
        if(response.status===400)throw new Error('기록의 형식을 확인해주세요.');
        throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
      }
      return {remote:asRemote(body),conflict:response.status===409};
    } finally {clearTimeout(timeout);}
  }
  start(){
    if(this.started)return;this.started=true;
    void this.refresh();
    if(this.env.auto!==false)this.poll=setInterval(()=>{if(this.dirty())void this.flush();else void this.refresh();},15000);
  }
  stop(){this.started=false;clearTimeout(this.timer);clearInterval(this.poll);}
  private queue(){if(this.env.auto===false)return;clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),350);}
  async retry(){if(this.state.ready&&this.dirty())await this.flush();else await this.refresh();}
  async refresh() {
    if(this.busy)return;
    this.busy=true;
    try {
      const result=await this.request();if(!result)return;
      const remote=result.remote;let working=remote.data;let conflicts=0;let cacheError='';
      if(this.state.userId===remote.userId&&this.state.ready) {
        const merged=mergeData(this.base,this.state.data,remote.data);working=merged.data;conflicts=merged.conflicts;
      } else {this.migratedLegacy=this.env.storage.getItem(this.migrationKey(remote.userId))??'';this.recovered.clear();}
      try{const restored=this.restoreDrafts(remote.userId,working);working=restored.working;conflicts+=restored.conflicts;cacheError=restored.error;}catch{cacheError='기기의 동기화 기록을 읽지 못했어요. 서버 기록을 표시합니다.';}
      let migration:HubData|null=null;
      try {
        const raw=this.env.storage.getItem(KEY);
        if(raw){const old=validateData(JSON.parse(raw));if((old.entries.length>0||!same(old.preferences,initial.preferences))&&this.migratedLegacy!==fingerprint(old))migration=old;}
      }catch{cacheError='이전 브라우저 기록을 읽지 못했어요. 기존 백업 파일을 확인해주세요.';}
      this.base=remote.data;
      this.update({data:working,ready:true,userId:remote.userId,revision:remote.revision,updatedAt:remote.updatedAt,localPreview:!!remote.localPreview,phase:same(working,remote.data)?'synced':'pending',error:cacheError,conflicts:this.state.conflicts+conflicts,migration});
      // A damaged old cache is left untouched so the user can recover it.
      if(!cacheError){try{this.cache();if(!this.dirty())this.acknowledgeRecovered();}catch{this.update({error:'기기 임시 저장 공간에 접근하지 못했어요. 새 변경 전 저장 권한을 확인해주세요.'});}}
      if(this.dirty())this.queue();
    }catch(e){this.fail(e);}finally{this.busy=false;}
  }
  change(next:HubData):boolean {
    if(!this.state.ready || !this.state.userId || this.state.phase==='auth'){this.update({error:'서버 연결과 로그인을 확인한 후 다시 저장해주세요.'});return false;}
    try {
      const data=validateData(next);
      if(new TextEncoder().encode(JSON.stringify(data)).byteLength>1024*1024)throw new Error('저장 용량(1MB)을 초과했어요. 백업 후 기록을 정리해주세요.');
      this.draftId=crypto.randomUUID();this.cache(data);
      this.update({data,phase:same(data,this.base)?'synced':this.env.online()?'pending':'offline',error:''});this.queue();return true;
    }catch(e){this.update({error:e instanceof Error&&e.message.includes('용량')?e.message:'기기에 변경 내용을 보관하지 못했어요. 저장 공간과 브라우저 권한을 확인해주세요.'});return false;}
  }
  migrate():boolean {
    const legacy=this.state.migration;if(!legacy)return false;
    const previous=this.migratedLegacy;
    try {
      const merged=mergeData(initial,legacy,this.state.data);
      this.migratedLegacy=fingerprint(legacy);
      if(!this.change(merged.data)){this.migratedLegacy=previous;return false;}
      this.update({migration:null,conflicts:this.state.conflicts+merged.conflicts});return true;
    }catch{this.migratedLegacy=previous;this.update({error:'이전 기록을 합치지 못했어요. JSON 백업을 먼저 내보내주세요.'});return false;}
  }
  private fail(e:unknown){this.update({phase:this.env.online()?'error':'offline',error:this.env.online()?(e instanceof Error?e.message:'연결을 확인해주세요.'):'오프라인입니다. 변경 내용은 이 기기에 보관하고 연결되면 다시 보냅니다.'});}
  async flush() {
    if(this.busy || !this.state.ready || !this.dirty() || this.state.phase==='auth')return;
    if(!this.env.online()){this.update({phase:'offline'});return;}
    this.busy=true;
    try {
      for(let attempt=0;attempt<4&&this.dirty();attempt++) {
        const sent=this.state.data,base=this.base,userId=this.state.userId;
        this.update({phase:'saving',error:''});
        const result=await this.request({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:sent,expectedRevision:this.state.revision,mutationId:crypto.randomUUID()})});
        if(!result)return;
        if(result.remote.userId!==userId){this.update({phase:'auth',error:'로그인 계정이 변경되었어요. 새로고침 후 다시 확인해주세요.'});return;}
        if(result.conflict){
          const merged=mergeData(base,this.state.data,result.remote.data);
          this.base=result.remote.data;
          this.update({data:merged.data,revision:result.remote.revision,updatedAt:result.remote.updatedAt,conflicts:this.state.conflicts+merged.conflicts,phase:'pending'});
        } else {
          // Edits made while the request was in flight stay in the working copy.
          this.base=sent;
          this.update({revision:result.remote.revision,updatedAt:result.remote.updatedAt,phase:this.dirty()?'pending':'synced'});
        }
        try{this.cache();if(!result.conflict)this.acknowledgeRecovered();}catch{this.update({error:'서버 응답 후 기기 캐시를 갱신하지 못했어요. JSON 백업을 권장합니다.'});}
      }
      if(this.dirty())this.update({phase:'pending',error:'다른 기기의 변경이 이어지고 있어요. 잠시 후 다시 동기화합니다.'});
      else this.update({phase:'synced'});
    }catch(e){this.fail(e);}finally{this.busy=false;if(this.dirty()&&this.state.phase==='pending')this.queue();}
  }
}
