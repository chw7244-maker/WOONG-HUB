'use client';
import {useEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {X} from 'lucide-react';

// Only the topmost dialog handles Escape and traps keyboard focus.
const dialogStack:symbol[]=[];
let previousOverflow='';

export default function Dialog({title,onClose,children,className='',backdropClassName='',backdropStyle,header,focusField=true}: {
  title:string; onClose:()=>void; children:ReactNode; className?:string;
  backdropClassName?:string; backdropStyle?:CSSProperties; header?:ReactNode; focusField?:boolean;
}){
  const ref=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;

  useEffect(()=>{
    const dialogId=Symbol();
    if(!dialogStack.length)previousOverflow=document.body.style.overflow;
    dialogStack.push(dialogId);
    document.body.style.overflow='hidden';
    const previous=document.activeElement as HTMLElement|null;
    const el=ref.current;
    const focusable=()=>Array.from(el?.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, summary, [tabindex="0"]')??[])
      .filter(node=>!node.matches(':disabled')&&node.getClientRects().length>0);
    const timer=setTimeout(()=>{
      if(dialogStack.at(-1)!==dialogId)return;
      const field=focusField?focusable().find(node=>['INPUT','TEXTAREA','SELECT'].includes(node.tagName)):undefined;
      (field??el)?.focus({preventScroll:true});
    },0);
    const handle=(event:KeyboardEvent)=>{
      if(dialogStack.at(-1)!==dialogId)return;
      if(event.key==='Escape'){
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if(event.key!=='Tab')return;
      const elements=focusable();
      if(!elements.length){event.preventDefault();return;}
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===el)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handle);
    return()=>{
      const wasTop=dialogStack.at(-1)===dialogId;
      dialogStack.splice(dialogStack.indexOf(dialogId),1);
      clearTimeout(timer);
      if(!dialogStack.length)document.body.style.overflow=previousOverflow;
      document.removeEventListener('keydown',handle);
      if(wasTop&&previous?.isConnected)previous.focus({preventScroll:true});
    };
  },[focusField]);

  return <div className={`modal-backdrop ${backdropClassName}`} style={backdropStyle} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className={`dialog ${className}`} ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      {header===undefined?<div className="dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="창 닫기" onClick={onClose}><X size={19}/></button></div>:header}
      {children}
    </div>
  </div>;
}
