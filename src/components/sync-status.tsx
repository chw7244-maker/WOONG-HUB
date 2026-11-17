'use client';
import {Cloud,CloudOff,Database,RefreshCw,ShieldCheck,Check,ArrowDownToLine,ArrowUpFromLine} from 'lucide-react';
import {useHubSync} from './sync-provider';
const labels={connecting:'연결 확인 중',synced:'서버 저장 완료',pending:'동기화 대기',saving:'저장 중',offline:'오프라인 · 기기에 보관',error:'동기화 재시도 필요',auth:'로그인 확인 필요'};
export function SyncIndicator(){
  const s=useHubSync();const Icon=s.phase==='offline'?CloudOff:['pending','saving','connecting'].includes(s.phase)?RefreshCw:Cloud;
  return <button className={`sync-indicator phase-${s.phase}`} onClick={()=>void s.client.retry()} aria-label={`저장 상태: ${labels[s.phase]}. 다시 확인`} title={s.error||labels[s.phase]}><Icon size={13} className={s.phase==='saving'?'spinning':''}/><span>{s.localPreview?'로컬 테스트 · ':''}{labels[s.phase]}</span></button>;
}
export function SyncNotice({onLegacyBackup}:{onLegacyBackup:()=>void}){
  const s=useHubSync();
  return <>
    {s.migration&&<div className="migration-notice"><span className="migration-icon"><ArrowUpFromLine size={19}/></span><div><strong>이 브라우저의 이전 기록을 옮겨주세요</strong><p>기록 {s.migration.entries.length}개와 설정을 서버 데이터에 합칩니다. 이전 브라우저 원본은 그대로 남습니다.</p></div><div className="button-row"><button className="button secondary" onClick={onLegacyBackup}><ArrowDownToLine size={13}/>이전 기록 백업</button><button className="button primary" onClick={()=>s.client.migrate()}>서버로 옮기기</button></div></div>}
    {(s.error||s.phase==='auth'||s.phase==='offline')&&<div className={`sync-notice ${s.phase==='auth'?'auth':''}`} role="status"><span>{s.error||(s.phase==='offline'?'연결이 끊겼어요. 변경 내용을 기기에 보관하고 연결되면 다시 동기화합니다.':'로그인을 확인해주세요.')}</span>{s.phase==='auth'?<a href="/signin-with-chatgpt?return_to=%2F" target="_top" className="text-button blue">ChatGPT로 로그인</a>:<button className="text-button blue" onClick={()=>void s.client.retry()}><RefreshCw size={12}/>다시 시도</button>}</div>}
    {s.conflicts>0&&<div className="sync-notice" role="status">다른 기기와 동시에 변경된 기록이 있어 사본 또는 수정된 기록을 보존했습니다. 제목에 ‘사본’이 붙은 기록을 확인해주세요.</div>}
  </>;
}
export function CloudStorageSettings({onExport,onImport,count}:{onExport:()=>void;onImport:()=>void;count:number}){
  const s=useHubSync();
  const time=s.updatedAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(s.updatedAt)):null;
  return <section className="panel settings-panel" id="sync"><div className="panel-heading"><h2>데이터와 동기화</h2><span className={`badge ${s.phase==='synced'?'blue':''}`}>{labels[s.phase]}</span></div><div className="storage-info"><Cloud size={25}/><div><strong>{s.localPreview?'로컬 테스트 DB':'나의 서버 저장소'}</strong><p>총 {count}개의 기록 · 버전 {s.revision}</p></div></div><p className="muted">같은 ChatGPT 계정으로 로그인하면 PC와 아이폰에서 같은 기록을 사용할 수 있습니다. 변경 내용은 기기에 먼저 보관하고 서버 저장을 확인합니다.</p><div className="sync-facts"><span><ShieldCheck size={13}/>로그인 계정별로 분리 저장</span><span><RefreshCw size={13}/>15초마다 · 화면 복귀 시 확인</span><span><Check size={13}/>{time?`마지막 서버 저장 ${time} KST`:'첫 기록을 저장할 준비가 됐어요'}</span></div><div className="button-row"><button className="button secondary" onClick={()=>void s.client.retry()}><RefreshCw size={14}/>지금 동기화</button><button className="button secondary" onClick={onExport}><ArrowDownToLine size={14}/>JSON 내보내기</button><button className="button secondary" onClick={onImport}><ArrowUpFromLine size={14}/>백업 가져오기</button></div><small className="setting-caption">오프라인 변경은 서버 저장 완료가 표시될 때까지 기기에 남습니다. 그 전에 브라우저 데이터를 삭제하지 마세요. 백업에는 현재 화면의 대기 중 변경도 포함됩니다.</small></section>;
}
