'use client';
import {createContext,useContext,useEffect,useState,useSyncExternalStore} from 'react';
import {SyncClient} from '@/lib/sync-client';

const Context=createContext<SyncClient|null>(null);
export function SyncProvider({children}:{children:React.ReactNode}) {
  const [client]=useState(()=>new SyncClient({fetch:(...args)=>fetch(...args),storage:{getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k),key:i=>localStorage.key(i),get length(){return localStorage.length;}},online:()=>navigator.onLine}));
  useEffect(()=>{
    client.start();
    const resume=()=>void client.retry();
    const visible=()=>{if(document.visibilityState==='visible')void client.retry();};
    const storage=(event:StorageEvent)=>{if(event.key?.startsWith('woong-hub:sync:v2:'))void client.retry();};
    window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',visible);window.addEventListener('storage',storage);
    return()=>{client.stop();window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',visible);window.removeEventListener('storage',storage);};
  },[client]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useHubSync(){const client=useContext(Context);if(!client)throw new Error('SyncProvider is required');const state=useSyncExternalStore(client.subscribe,client.getSnapshot,client.getServerSnapshot);return {...state,client};}
