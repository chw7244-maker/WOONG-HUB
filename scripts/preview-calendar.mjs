// Isolated preview import. Never packages source data into a build.
import {mkdir} from 'node:fs/promises';
import {validateCalendar} from '../src/lib/calendar.ts';
import {createLocalDatabase,applyLocalMigrations} from './local-db.mjs';
let input='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.resume();console.log('Ready for preview calendar JSON on stdin (input is hidden).');
await new Promise((resolve,reject)=>{const handle=chunk=>{input+=chunk.toString();if(input.includes('\u0003'))reject(new Error('Cancelled'));if(input.includes('\n')||input.includes('\r')){process.stdin.off('data',handle);resolve();}};process.stdin.on('data',handle);});
if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();const data=validateCalendar(JSON.parse(input.trim()));input='';
await mkdir('.sites-runtime',{recursive:true});const DB=createLocalDatabase('.sites-runtime/local.sqlite');await applyLocalMigrations(DB);
await DB.prepare('INSERT INTO notion_calendar_snapshots(key,revision,data,mutation_id,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(key) DO UPDATE SET revision=notion_calendar_snapshots.revision+1,data=excluded.data,mutation_id=excluded.mutation_id,updated_at=excluded.updated_at').bind('notion-calendar-v1',JSON.stringify(data),'preview-import',new Date().toISOString()).run();DB.sqlite.close();console.log(JSON.stringify({previewOnly:true,sources:data.sources.length,events:data.events.length}));
