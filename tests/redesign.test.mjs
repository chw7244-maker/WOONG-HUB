import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarDays, dashboardDay, dashboardEvents, dashboardTasks, dashboardWeekStart, nextDashboardEvent, pinnedSetup, recentListening, recentListeningGear } from '../src/lib/home-dashboard.ts';
import { noteDraftKey, noteFields, noteNeedsCopy, parseNoteDraft } from '../src/lib/note-draft.ts';
import { initial, validateData } from '../src/lib/store.ts';
import { mergeData } from '../src/lib/merge.ts';
import { emptyMusic } from '../src/lib/music.ts';

const record = (id, kind, extra = {}) => ({ id, kind, title:id, detail:'', category:'', status:'', url:'', date:'', done:false, createdAt:'2026-11-17T14:00:00Z', ...extra });

test('The weekly dashboard observes KST day boundaries, hidden sources and month rollover', () => {
  const local = record('local', 'event', {date:'2026-12-31T09:00'});
  const external = (id, sourceId, start, end, allDay = false) => ({ id, sourceId, title:id, start, end, allDay, url:'' });
  const snapshot = {events: [
    external('hidden', 'google', '2026-12-31', '2027-01-01', true),
    external('leave', 'notion', '2026-12-31', '2027-01-01', true),
    external('utc', 'notion', '2026-12-31T01:00:00Z', '2026-12-31T02:00:00Z'),
    external('kst', 'notion', '2026-12-31T09:30:00+09:00', '2026-12-31T10:00:00+09:00'),
    external('new-year', 'notion', '2026-12-31T15:00:00Z', '2026-12-31T15:00:00Z'),
  ]};
  const entries = dashboardEvents([local], snapshot, ['google']);
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(dashboardDay(entries,'2026-12-31').map(event => event.id), ['leave','local','kst','utc']);
  assert.deepEqual(dashboardDay(entries,'2027-01-01').map(event => event.id), ['new-year']);
  assert.equal(dashboardEvents([local], snapshot, ['hub-local']).some(event => event.id === 'local'), false);
});

test('The home task card groups outstanding items by their KST due date', () => {
  const tasks = [
    record('later', 'todo', { date:'2027-01-01' }),
    record('undated', 'todo'),
    record('today-time', 'todo', { date:'2026-12-31T09:00' }),
    record('today-date', 'todo', { date:'2026-12-31' }),
    record('yesterday', 'todo', { date:'2026-12-30' }),
    record('done', 'todo', { date:'2026-12-31', done:true }),
    record('event', 'event', { date:'2026-12-31T09:00' }),
  ];
  const { dueToday, overdue, undated } = dashboardTasks(tasks, '2026-12-31');
  assert.deepEqual(dueToday.map(task => task.id), ['today-date','today-time']);
  assert.deepEqual(overdue.map(task => task.id), ['yesterday']);
  assert.deepEqual(undated.map(task => task.id), ['undated']);
  assert.deepEqual(dashboardTasks(tasks, '').dueToday, []);
});

test('Next schedule prioritizes active and remaining timed events and respects hidden sources and KST midnight', () => {
  const timed = (id, sourceId, start, end = start) => ({ id, sourceId, start, end, allDay:false, title:id, url:'' });
  const allDay = (id,start,end) => ({ id, sourceId:'notion', start, end, allDay:true, title:id, url:'' });
  const now = Date.parse('2026-12-31T14:00:00Z');
  const day = '2026-12-31';
  const events = dashboardEvents([], {events:[
    timed('finished','notion','2026-12-31T12:00:00Z'),
    timed('hidden','google','2026-12-31T14:05:00Z'),
    timed('later','notion','2026-12-31T14:10:00Z'),
    timed('after-midnight','notion','2026-12-31T15:05:00Z'),
    allDay('today','2026-12-31','2027-01-01'),
    allDay('tomorrow','2027-01-01','2027-01-02'),
  ]}, ['google']);
  assert.equal(nextDashboardEvent(events,now,day).event.id,'later');
  assert.equal(nextDashboardEvent(events,Date.parse('2026-12-31T14:20:00Z'),day).event.id,'today');
  assert.equal(nextDashboardEvent(events.filter(e=>e.id!=='today'),Date.parse('2026-12-31T14:20:00Z'),day).event.id,'tomorrow');
  const running = timed('running','notion','2026-12-31T13:55:00Z','2026-12-31T14:15:00Z');
  assert.deepEqual(nextDashboardEvent([...events,running],now,day),{event:running,live:true});
  assert.equal(nextDashboardEvent(events.filter(e=>e.id==='today'),Date.parse('2026-12-31T15:00:00Z'),'2027-01-01'),null);
  assert.equal(dashboardWeekStart('2027-01-02'),'2026-12-28');
  assert.equal(dashboardWeekStart('2026-12-27'),'2026-12-21');
  assert.equal(dashboardWeekStart('2027-01-08'),'2027-01-04');
});

test('Note drafts are scoped to account and record and recover concurrent changes as a copy', () => {
  const entry = record('memo','note',{category:'이전 분류',detail:'저장된 본문'});
  const base = noteFields(entry);
  const fields = {...base,detail:'다시 열어도 남아야 하는\n초안'};
  assert.deepEqual(parseNoteDraft(JSON.stringify({base,fields})),{base,fields});
  assert.notEqual(noteDraftKey('alice','memo'),noteDraftKey('bob','memo'));
  assert.notEqual(noteDraftKey('alice','memo'),noteDraftKey('alice'));
  assert.equal(parseNoteDraft(JSON.stringify({base,fields:base})),null);
  assert.equal(parseNoteDraft(JSON.stringify({base,fields:{...fields,detail:'a'.repeat(10001)}})),null);
  assert.equal(noteNeedsCopy('memo',base,entry),false);
  assert.equal(noteNeedsCopy('memo',base,{...entry,detail:'다른 기기에서 수정'}),true);
  assert.equal(noteNeedsCopy('memo',base),true);
  assert.equal(noteNeedsCopy(undefined,base),false);
});

test('The pinned audio setup survives backup and a separate preference edit', () => {
  const setup = record('desk','audio',{audio:{type:'setup',deviceIds:['dac']}});
  const base = {...initial,entries:[setup]};
  const local = {...base,preferences:{...base.preferences,pinnedAudioSetup:'desk'}};
  const remote = {...base,preferences:{...base.preferences,theme:'light'}};
  const merged = mergeData(base,local,remote).data;
  const restored = validateData(JSON.parse(JSON.stringify(merged)));
  assert.equal(restored.preferences.theme,'light');
  assert.equal(pinnedSetup(restored.entries,restored.preferences.pinnedAudioSetup)?.id,'desk');
  assert.equal(pinnedSetup([],restored.preferences.pinnedAudioSetup),undefined);
  assert.equal(mergeData(local,base,merged).data.preferences.pinnedAudioSetup,undefined);
});

test('Recent equipment uses unambiguous listening records and never infers use from registration alone', () => {
  const dac = record('dac','audio',{title:'Desk DAC'});
  const setup = record('desk','audio',{title:'책상 청음 조합',audio:{type:'setup',deviceIds:['dac']}});
  const duplicate = record('other','audio',{title:'Ｄｅｓｋ ＤＡＣ'});
  const listens = [
    {date:'2026-11-15',equipment:'책상 청음 조합'},
    {date:'2026-11-17',equipment:'책상 청음 조합'},
    {date:'2026-11-18',equipment:'desk dac'},
  ];
  const album = record('album','music',{music:{...emptyMusic(),listens}});
  const previous = record('previous','music',{music:{...emptyMusic(),listenedAt:'2026-11-16'}});
  assert.deepEqual(recentListeningGear([dac,setup,duplicate],[album]),[{entry:setup,date:'2026-11-17'}]);
  assert.deepEqual(recentListening([previous,album]).map(entry => entry.id),['album','previous']);
});
