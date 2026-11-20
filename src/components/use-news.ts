'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {type NewsArticle,type NewsPreferences,type NewsResponse,type NewsSync} from '@/lib/news';

export type NewsView='interest'|'all'|'saved'|'hidden';
export function useNews(options:{category?:string;view?:NewsView;query?:string;date?:string;limit?:number;unread?:boolean;documentRevision?:number}={}){
  const {category='all',view='interest',query='',date='',limit=24,unread=false,documentRevision=0}=options;
  const key=new URLSearchParams({category,view,q:query,date,limit:String(limit),...(unread&&{unread:'1'})}).toString();
  const scope=view==='interest'?`${key}:${documentRevision}`:key;
  const [response,setResponse]=useState<NewsResponse|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[mutationError,setMutationError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState<Set<string>>(new Set());
  const [responseKey,setResponseKey]=useState(scope);
  const active=useRef(true),requestId=useRef(0),controller=useRef<AbortController|null>(null),pendingValues=useRef(new Map<string,boolean>()),queues=useRef(new Map<string,Promise<void>>()),latestLoad=useRef<(()=>Promise<void>)|null>(null);
  const overlay=useCallback((articles:NewsArticle[])=>articles.map(a=>{const copy={...a};for(const field of ['read','saved','hidden'] as const){const value=pendingValues.current.get(`${a.id}:${field}`);if(value!==undefined)copy[field]=value;}return copy;}),[]);
  const load=useCallback(async(append=false,cursor?:string,quiet=false)=>{
    const id=++requestId.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    if(!quiet)setLoading(true);
    try{
      const r=await fetch(`/api/news?${key}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,{credentials:'same-origin',cache:'no-store',signal:abort.signal});
      if(!r.ok||!r.headers.get('Content-Type')?.includes('application/json'))throw new Error(r.status===401?'로그인을 확인한 뒤 다시 시도해주세요.':'뉴스를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      const result=await r.json() as NewsResponse;
      if(!Array.isArray(result.articles)||!result.sync)throw new Error('뉴스 응답을 확인하지 못했어요.');
      if(active.current&&id===requestId.current){
        setError('');
        setResponse(previous=>{
          const retain=quiet&&previous&&previous.preferences.revision===result.preferences.revision&&previous.articles.length>limit;
          const items=append&&previous?[...previous.articles,...result.articles]:result.articles;
          const unique=new Map(items.map(article=>[article.id,article]));
          if(retain) for(const article of previous.articles) if(!unique.has(article.id)) unique.set(article.id,article);
          return {...result,nextCursor:retain?previous.nextCursor:result.nextCursor,articles:overlay([...unique.values()])};
        });
      }
    }catch(e){if(!abort.signal.aborted&&active.current&&id===requestId.current)setError(e instanceof Error?e.message:'뉴스 연결을 확인해주세요.');}
    finally{if(active.current&&id===requestId.current)setLoading(false);}
  },[key,overlay,limit]);
  latestLoad.current=()=>load(false,undefined,true);
  useEffect(()=>{active.current=true;setResponseKey(scope);setResponse(null);setError('');void load();return()=>{active.current=false;controller.current?.abort();};},[scope,load]);
  useEffect(()=>{
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load(false,undefined,true);},response?.sync.running?2500:60000);
    const focus=()=>void load(false,undefined,true);window.addEventListener('focus',focus);
    return()=>{clearInterval(timer);window.removeEventListener('focus',focus);};
  },[load,response?.sync.running]);
  const refresh=useCallback(async()=>{
    setMessage('');setError('');setMutationError('');
    try{
      const r=await fetch('/api/news/refresh',{method:'POST',credentials:'same-origin'});
      if(!r.ok)throw new Error('기사 수집 요청을 보내지 못했어요.');
      const result=await r.json() as {accepted:boolean;sync:NewsSync};
      if(active.current){setResponse(prev=>prev?{...prev,sync:result.sync}:prev);setMessage(result.accepted?'새 기사를 확인하고 있어요.':result.sync.running?'이미 새 기사를 확인하고 있어요.':'방금 확인한 기사입니다. 재수집은 잠시 후에 가능합니다.');latestLoad.current?.();}
    }catch(e){if(active.current)setError(e instanceof Error?e.message:'수집 연결을 확인해주세요.');}
  },[load]);
  const setArticleState=useCallback((article:NewsArticle,field:'read'|'saved'|'hidden',value:boolean)=>{
    const fieldKey=`${article.id}:${field}`;if(pendingValues.current.has(fieldKey))return;
    setMutationError('');
    pendingValues.current.set(fieldKey,value);setPending(new Set(pendingValues.current.keys()));
    setResponse(prev=>prev?{...prev,articles:prev.articles.map(a=>a.id===article.id?{...a,[field]:value}:a)}:prev);
    const before=article[field];
    const task=(queues.current.get(article.id)??Promise.resolve()).then(async()=>{
      try{
        const r=await fetch('/api/news/state',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:article.id,field,value})});
        if(!r.ok)throw new Error('읽음·스크랩 상태를 저장하지 못했어요. 다시 눌러주세요.');
        const result=await r.json();
        if(active.current)setResponse(prev=>prev?{...prev,articles:prev.articles.map(a=>a.id===article.id?{...a,[field]:result[field],stateUpdatedAt:result.updatedAt}:a)}:prev);
      }catch(e){if(active.current){setMutationError(e instanceof Error?e.message:'상태를 저장하지 못했어요.');setResponse(prev=>prev?{...prev,articles:prev.articles.map(a=>a.id===article.id?{...a,[field]:before}:a)}:prev);}}
      finally{pendingValues.current.delete(fieldKey);if(active.current){setPending(new Set(pendingValues.current.keys()));latestLoad.current?.();}}
    });
    queues.current.set(article.id,task);
  },[load]);
  async function savePreferences(preferences:NewsPreferences){
    const r=await fetch('/api/news/preferences',{method:'PUT',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(preferences)});
    if(r.status===409){
      await latestLoad.current?.();
      throw new Error('다른 곳에서 관심 설정이 바뀌었어요. 창을 닫고 최신 설정에서 다시 시도해주세요.');
    }
    if(!r.ok)throw new Error('관심 설정을 저장하지 못했어요. 다시 시도해주세요.');
    await latestLoad.current?.();
  }
  const displayMessage=message.includes('확인하고 있어요')&&response&&!response.sync.running?'새 기사 확인을 마쳤어요.':message;
  const isCurrent=responseKey===scope;
  return {response:isCurrent?response:null,loading:!isCurrent||loading,error:mutationError||(isCurrent?error:''),message:displayMessage,pending,refresh,reload:()=>load(false,undefined,true),more:()=>response?.nextCursor&&load(true,response.nextCursor),setArticleState,savePreferences};
}
