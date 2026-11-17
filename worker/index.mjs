import { handleApi } from './api.mjs';

const contentTypes={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',txt:'text/plain; charset=utf-8',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',ico:'image/x-icon',png:'image/png',jpg:'image/jpeg',woff2:'font/woff2'};
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return handleApi(request,env);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    let path;
    try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad request',{status:400});}
    if(path.split('/').some(s=>s==='..'||s==='.')||path.includes('\\'))return new Response('Not found',{status:404});
    const key=path.endsWith('/')?`${path}index.html`:path;
    let asset=STATIC_ASSETS[key];let status=200;
    if(!asset && STATIC_ASSETS[`${path}/index.html`])return Response.redirect(`${url.origin}${path}/${url.search}`,308);
    if(!asset){asset=STATIC_ASSETS['/404.html'];status=404;}
    if(!asset)return new Response('Not found',{status:404});
    const extension=(status===404?'404.html':key).split('.').pop();
    const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(asset),c=>c.charCodeAt(0));
    return new Response(bytes,{status,headers:{'Content-Type':contentTypes[extension]??'application/octet-stream','Cache-Control':key.startsWith('/_next/static/')?'public, max-age=31536000, immutable':'private, no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
  }
};
