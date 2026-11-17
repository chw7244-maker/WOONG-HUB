import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';

/** Development/test adapter executing the same parameterized SQL as D1. */
export function createLocalDatabase(filename=':memory:') {
  const sqlite=new DatabaseSync(filename);
  return {sqlite,prepare(sql){
    const statement=sqlite.prepare(sql);let parameters=[];
    const prepared={bind(...args){parameters=args;return prepared;},async first(){return statement.get(...parameters)??null;},async all(){return {success:true,results:statement.all(...parameters)};},async run(){const result=statement.run(...parameters);return {success:true,meta:{changes:Number(result.changes)}};}};
    return prepared;
  },async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
export async function applyLocalMigrations(db,directory='drizzle') {
  db.sqlite.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)');
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort()) {
    if(db.sqlite.prepare('SELECT name FROM __local_migrations WHERE name = ?').get(name))continue;
    const sql=await readFile(`${directory}/${name}`,'utf8');
    db.sqlite.exec('BEGIN');
    try{db.sqlite.exec(sql);db.sqlite.prepare('INSERT INTO __local_migrations (name) VALUES (?)').run(name);db.sqlite.exec('COMMIT');}
    catch(e){db.sqlite.exec('ROLLBACK');throw e;}
  }
}
