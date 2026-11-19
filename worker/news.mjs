import {FEEDS,fetchFeed,steamNewsFeed} from './news-feeds.mjs';
import {newsCategories,starterNewsTopics,steamNewsLimit} from '../src/lib/news.ts';
import {rankNews,validateNewsTopics} from './news-interests.mjs';

const SYNC_KEY='korean-articles-v1';
const HOUR=3600000;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
const getSync=db=>db.prepare('SELECT * FROM news_sync WHERE key = ?').bind(SYNC_KEY).first();
function syncInfo(row,now=Date.now(),scheduled=false){
  let sources=[];try{sources=JSON.parse(row?.sources??'[]');}catch{}
  return {running:scheduled||(row?.lease_until??0)>now,lastAttemptAt:row?.started_at??null,lastSuccessAt:row?.last_success_at??null,finishedAt:row?.finished_at??null,nextAutoAt:row?.finished_at?new Date(new Date(row.finished_at).getTime()+HOUR).toISOString():null,count:row?.count??0,sources};
}
export async function claimNewsSync(db,{force=false,now=new Date()}={}){
  const timestamp=now.getTime(),startedAt=now.toISOString(),leaseUntil=timestamp+120000;
  const cutoff=new Date(timestamp-(force?60000:HOUR)).toISOString();
  const result=await db.prepare(`INSERT INTO news_sync (key, started_at, lease_until, count, sources) VALUES (?, ?, ?, 0, '[]') ON CONFLICT(key) DO UPDATE SET started_at=excluded.started_at, lease_until=excluded.lease_until WHERE news_sync.lease_until < ? AND (news_sync.finished_at IS NULL OR news_sync.finished_at < ?)`)
    .bind(SYNC_KEY,startedAt,leaseUntil,timestamp,cutoff).run();
  return result.meta.changes===1?{leaseUntil,startedAt}:null;
}
async function collectionFeeds(db) {
  const result=await db.prepare("SELECT topics FROM news_preferences ORDER BY user_id LIMIT 30").all();
  const followed=result.results.flatMap(row=>JSON.parse(row.topics)).filter(topic=>!topic.muted&&topic.steamAppId);
  const appIds=new Set([...followed,...starterNewsTopics].map(topic=>topic.steamAppId).filter(Boolean));
  return [...FEEDS,...[...appIds].slice(0,steamNewsLimit).map(steamNewsFeed)];
}
export async function collectNews(env,lease,{fetcher=fetch,now=new Date(),feeds}={}){
  const checkedAt=now.toISOString();
  try{
    const available=feeds??await collectionFeeds(env.DB);
    const publisherQueues=[Promise.resolve(),Promise.resolve()];
    let nextQueue=0;
    const loads=available.map(feed=>{
      if(!feed.publisher)return fetchFeed(feed,fetcher,now);
      const queue=nextQueue++%publisherQueues.length;
      const pending=publisherQueues[queue].then(()=>fetchFeed(feed,fetcher,now));
      publisherQueues[queue]=pending.then(()=>{},()=>{});
      return pending;
    });
    const results=await Promise.allSettled(loads);
    const collected=new Map(),sources=[];
    for(let i=0;i<results.length;i++){
      const feed=available[i],result=results[i];
      if(result.status==='rejected')console.error('News source unavailable',feed.id,String(result.reason?.message??'unknown').slice(0,240));
      sources.push({id:feed.id,name:feed.name,website:feed.website,category:feed.category,language:feed.language,checkedAt,ok:result.status==='fulfilled',count:result.status==='fulfilled'?result.value.length:0,error:result.status==='rejected'?(result.reason?.message?.startsWith('http_')?result.reason.message:'feed_unavailable'):null});
      if(result.status==='fulfilled')for(const article of result.value){const current=collected.get(article.id);if(current)current.categories=[...new Set([...current.categories,...article.categories])];else collected.set(article.id,article);}
    }
    const statements=[];
    const articles=[...collected.values()];
    for(let offset=0;offset<articles.length;offset+=30){
      statements.push(env.DB.prepare(
        "INSERT INTO news_articles (id,title,url,source_name,source_url,description,published_at,first_seen_at,last_seen_at,categories,language) "+
        "SELECT value->>'id',value->>'title',value->>'url',value->>'sourceName',value->>'sourceUrl',value->>'description',value->>'publishedAt',?,?,value->'categories',value->>'language' "+
        "FROM json_each(?) WHERE true ON CONFLICT(url) DO UPDATE SET title=excluded.title,description=excluded.description,last_seen_at=excluded.last_seen_at,"+
        "language=excluded.language,"+
        "categories=(SELECT json_group_array(value) FROM (SELECT value FROM json_each(news_articles.categories) UNION SELECT value FROM json_each(excluded.categories)))"
      ).bind(checkedAt,checkedAt,JSON.stringify(articles.slice(offset,offset+30))));
    }
    if(statements.length)await env.DB.batch(statements);
    const successful=sources.some(s=>s.ok);
    await env.DB.prepare('UPDATE news_sync SET lease_until=0, finished_at=?, last_success_at=CASE WHEN ?=1 THEN ? ELSE last_success_at END, count=?, sources=? WHERE key=? AND lease_until=?')
      .bind(new Date().toISOString(),successful?1:0,checkedAt,collected.size,JSON.stringify(sources),SYNC_KEY,lease.leaseUntil).run();
    return {count:collected.size,sources};
  }catch{
    await env.DB.prepare('UPDATE news_sync SET lease_until=0,finished_at=? WHERE key=? AND lease_until=?').bind(new Date().toISOString(),SYNC_KEY,lease.leaseUntil).run();
    throw new Error('news_sync_failed');
  }
}
function articleFrom(row){
  return {id:row.id,title:row.title,url:row.url,sourceName:row.source_name,sourceUrl:row.source_url,description:row.description,publishedAt:row.published_at,firstSeenAt:row.first_seen_at,categories:JSON.parse(row.categories),language:row.language,read:!!row.is_read,saved:!!row.is_saved,hidden:!!row.is_hidden,stateUpdatedAt:row.state_updated_at??null};
}
function sameOrigin(request){return request.headers.get('Origin')===new URL(request.url).origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site';}
function defer(ctx,promise){if(ctx?.waitUntil)ctx.waitUntil(promise.catch(()=>{}));else return promise;}
async function smallBody(request,max=2048){
  if(Number(request.headers.get('Content-Length'))>max)throw new Error('too_large');
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid_json');
  const decoder=new TextDecoder();let body='',size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('too_large');}body+=decoder.decode(value,{stream:true});}
  body+=decoder.decode();try{return JSON.parse(body);}catch{throw new Error('invalid_json');}
}
const JOIN='FROM news_articles a LEFT JOIN news_user_states s ON a.id=s.article_id AND s.user_id=?';
const KOREAN_ARTICLE = "a.language='ko' AND a.source_name NOT LIKE '% · 공식 영상' AND "+
  "a.url NOT LIKE 'https://%youtube.com/%' AND a.url NOT LIKE 'https://youtu.be/%' AND "+
  "(a.title GLOB '*[가-힣]*[가-힣]*[가-힣]*' OR a.description GLOB '*[가-힣]*[가-힣]*[가-힣]*')";
async function newsPreferences(db,userId){
  const row=await db.prepare('SELECT revision,topics FROM news_preferences WHERE user_id=?').bind(userId).first();
  return row?{revision:row.revision,topics:JSON.parse(row.topics)}:{revision:0,topics:starterNewsTopics};
}

async function updatePreferences(request,db,userId){
  if(!sameOrigin(request))return json({error:'origin_not_allowed'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'json_required'},415);
  let data;
  try{data=await smallBody(request,96*1024);}
  catch(error){return json({error:error.message},error.message==='too_large'?413:400);}
  const topics=validateNewsTopics(data?.topics);
  if(!topics||!Number.isSafeInteger(data?.revision)||data.revision<0)return json({error:'invalid_preferences'},400);
  const document=JSON.stringify(topics);
  const update=data.revision===0
    ? await db.prepare('INSERT INTO news_preferences (user_id,revision,topics) VALUES (?,1,?) ON CONFLICT DO NOTHING').bind(userId,document).run()
    : await db.prepare('UPDATE news_preferences SET revision=revision+1,topics=? WHERE user_id=? AND revision=?').bind(document,userId,data.revision).run();
  const result=await newsPreferences(db,userId);
  if(!update.meta.changes&&JSON.stringify(result.topics)!==document)return json({error:'preferences_changed',preferences:result},409);
  return json(result);
}

function readNewsCursor(cursor,interest){
  const tuple=JSON.parse(atob(cursor));
  if(!Array.isArray(tuple)||tuple.length!==(interest?3:2))throw new Error();
  const [published,id,rank]=tuple;
  if(typeof published!=='string'||!/^\d{4}-/.test(published)||!Number.isFinite(Date.parse(published))||
    typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||(interest&&!Number.isSafeInteger(rank)))throw new Error();
  return {published,id,rank};
}

export async function handleNews(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  const userId=request.headers.get('oai-authenticated-user-id');
  if(!userId||userId.length>200)return json({error:'authentication_required'},401);
  if(!env.DB)return json({error:'database_unavailable'},503);
  try{
    if(path==='/api/news/preferences'&&request.method==='PUT')return await updatePreferences(request,env.DB,userId);
    if(path==='/api/news/state'&&request.method==='PATCH'){
      if(!sameOrigin(request))return json({error:'origin_not_allowed'},403);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'json_required'},415);
      let body;try{body=await smallBody(request);}catch(e){return json({error:e.message},e.message==='too_large'?413:400);}
      const columns={read:'is_read',saved:'is_saved',hidden:'is_hidden'};
      if(!body||typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id)||!Object.hasOwn(columns,body.field)||typeof body.value!=='boolean')return json({error:'invalid_state'},400);
      if(!await env.DB.prepare('SELECT id FROM news_articles WHERE id=?').bind(body.id).first())return json({error:'article_not_found'},404);
      const column=columns[body.field],value=body.value?1:0,updatedAt=new Date().toISOString();
      await env.DB.prepare(`INSERT INTO news_user_states(user_id,article_id,is_read,is_saved,is_hidden,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,article_id) DO UPDATE SET ${column}=excluded.${column},updated_at=excluded.updated_at`)
        .bind(userId,body.id,body.field==='read'?value:0,body.field==='saved'?value:0,body.field==='hidden'?value:0,updatedAt).run();
      const state=await env.DB.prepare('SELECT is_read,is_saved,is_hidden,updated_at FROM news_user_states WHERE user_id=? AND article_id=?').bind(userId,body.id).first();
      return json({id:body.id,read:!!state.is_read,saved:!!state.is_saved,hidden:!!state.is_hidden,updatedAt:state.updated_at});
    }
    if(path==='/api/news/refresh'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'origin_not_allowed'},403);
      const lease=await claimNewsSync(env.DB,{force:true});
      if(lease)await defer(ctx,collectNews(env,lease));
      return json({accepted:!!lease,sync:syncInfo(await getSync(env.DB))},lease?202:200);
    }
    if(path==='/api/news/export'&&request.method==='GET'){
      const result=await env.DB.prepare(`SELECT a.*,s.is_read,s.is_saved,s.is_hidden,s.updated_at AS state_updated_at ${JOIN} WHERE s.is_saved=1 ORDER BY a.published_at DESC LIMIT 1000`).bind(userId).all();
      const total=await env.DB.prepare('SELECT COUNT(*) AS total FROM news_user_states WHERE user_id=? AND is_saved=1').bind(userId).first();
      return new Response(JSON.stringify({version:1,exportedAt:new Date().toISOString(),totalSaved:total.total,limit:1000,hasMore:total.total>result.results.length,articles:result.results.map(articleFrom)},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="woong-hub-saved-news.json"','X-Content-Type-Options':'nosniff'}});
    }
    if(path!=='/api/news'||request.method!=='GET')return json({error:'not_found'},404);
    const category=url.searchParams.get('category')??'all',view=url.searchParams.get('view')??'all',query=(url.searchParams.get('q')??'').trim(),date=url.searchParams.get('date')??'';
    const interest=view==='interest',unreadOnly=url.searchParams.get('unread')==='1';
    if(!['all',...newsCategories.map(c=>c.id)].includes(category)||!['interest','all','unread','saved','hidden'].includes(view)||query.length>120)return json({error:'invalid_filter'},400);
    let row=await getSync(env.DB),scheduled=false;
    const stale=!row?.finished_at||Date.now()-new Date(row.finished_at).getTime()>HOUR;
    if(stale&&(row?.lease_until??0)<Date.now()){
      const lease=await claimNewsSync(env.DB);if(lease){scheduled=true;await defer(ctx,collectNews(env,lease));row=await getSync(env.DB);}
    }
    const conditions=[view==='hidden'?'COALESCE(s.is_hidden,0)=1':'COALESCE(s.is_hidden,0)=0'];const params=[userId];
    if(view!=='saved'&&view!=='hidden')conditions.push(KOREAN_ARTICLE);
    if(category!=='all'){conditions.push('EXISTS(SELECT 1 FROM json_each(a.categories) WHERE value=?)');params.push(category);}
    if(view==='unread'||(unreadOnly&&(interest||view==='all')))conditions.push('COALESCE(s.is_read,0)=0');
    if(view==='saved')conditions.push('COALESCE(s.is_saved,0)=1');
    if(query){const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';conditions.push("(a.title LIKE ? ESCAPE '\\' OR a.source_name LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')");params.push(pattern,pattern,pattern);}
    if(date){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:'invalid_date'},400);
      const begin=new Date(`${date}T00:00:00+09:00`);
      if(!Number.isFinite(begin.getTime())||new Date(begin.getTime()+9*3600000).toISOString().slice(0,10)!==date)return json({error:'invalid_date'},400);
      conditions.push('a.published_at>=? AND a.published_at<?');params.push(begin.toISOString(),new Date(begin.getTime()+86400000).toISOString());
    }
    const cursor=url.searchParams.get('cursor');
    let after;
    if(cursor){
      try{if(cursor.length>300)throw new Error();after=readNewsCursor(cursor,interest);}
      catch{return json({error:'invalid_cursor'},400);}
      if(!interest){
        conditions.push('(a.published_at < ? OR (a.published_at = ? AND a.id > ?))');
        params.push(after.published,after.published,after.id);
      }
    }
    const limitValue=url.searchParams.get('limit')??'24';if(!/^\d+$/.test(limitValue))return json({error:'invalid_limit'},400);const limit=Math.max(1,Math.min(24,Number(limitValue)));
    const preferences=await newsPreferences(env.DB,userId);
    const activeCategories=[...new Set(preferences.topics.filter(topic=>!topic.muted).map(topic=>topic.category))];
    if(interest&&!date){
      conditions.push('a.published_at>=?');
      params.push(new Date(Date.now()-30*86_400_000).toISOString());
    }
    if(interest&&!activeCategories.includes('all')){
      conditions.push('EXISTS(SELECT 1 FROM json_each(a.categories) WHERE value IN (SELECT value FROM json_each(?)))');
      params.push(JSON.stringify(activeCategories));
    }
    let ordered=[];
    if(!interest||activeCategories.length){
      const result=await env.DB.prepare(`SELECT a.*,s.is_read,s.is_saved,s.is_hidden,s.updated_at AS state_updated_at ${JOIN} WHERE ${conditions.join(' AND ')} ORDER BY a.published_at DESC,a.id ASC LIMIT ?`).bind(...params,interest?2500:limit+1).all();
      ordered=result.results.map(articleFrom);
    }
    if(interest){
      ordered=rankNews(ordered,preferences.topics);
      if(after)ordered=ordered.filter(a=>a.rank<after.rank||(a.rank===after.rank&&(a.publishedAt<after.published||(a.publishedAt===after.published&&a.id>after.id))));
    }
    const page=ordered.slice(0,limit),last=page.at(-1);
    const nextCursor=ordered.length>limit&&last?btoa(JSON.stringify([last.publishedAt,last.id,...(interest?[last.rank]:[])])):null;
    const articles=page.map(({rank,...article})=>article);
    const counts=await env.DB.prepare(`SELECT SUM(CASE WHEN ${KOREAN_ARTICLE} THEN 1 ELSE 0 END) AS all_count,SUM(CASE WHEN COALESCE(s.is_read,0)=0 AND ${KOREAN_ARTICLE} THEN 1 ELSE 0 END) AS unread,SUM(CASE WHEN s.is_saved=1 THEN 1 ELSE 0 END) AS saved ${JOIN} WHERE COALESCE(s.is_hidden,0)=0`).bind(userId).first();
    const groups=await env.DB.prepare(`SELECT c.value AS category,COUNT(*) AS total ${JOIN} JOIN json_each(a.categories) c WHERE COALESCE(s.is_hidden,0)=0 AND ${KOREAN_ARTICLE} GROUP BY c.value`).bind(userId).all();
    return json({articles,preferences,counts:{all:counts.all_count??0,unread:counts.unread??0,saved:counts.saved??0},categoryCounts:Object.fromEntries(groups.results.map(g=>[g.category,g.total])),sync:syncInfo(row,Date.now(),scheduled&&!!row?.lease_until),nextCursor});
  }catch{return json({error:'news_unavailable'},503);}
}
