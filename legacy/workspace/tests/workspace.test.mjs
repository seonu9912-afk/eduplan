import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorkspace,parseWorkspace,parseBackup,makeBackup,BACKUP_FORMAT} from '../lib/workspace.js';
const fallback={events:[],tasks:[],docs:[],links:[],menus:[],forms:[],formEntries:[],academics:{},enabled:{calendar:true,forms:true}};
const db={schools:[{id:'alpha',name:'샘플학교'}],workspaces:{alpha:{events:[{id:'e1',date:'2027-05-10'}],tasks:[],docs:[],links:[],menus:[],academics:{'2027':{year:2027,dayRules:[]}},enabled:{calendar:false}}}};
test('old workspace loads and adds missing optional fields without losing calendar data',()=>{
  const result=parseWorkspace(JSON.stringify(db),fallback);
  assert.equal(result.workspaces.alpha.academics['2027'].year,2027);
  assert.equal(result.workspaces.alpha.events.length,1);
  assert.deepEqual(result.workspaces.alpha.forms,[]);
  assert.equal(result.workspaces.alpha.enabled.calendar,false);
  assert.equal(result.workspaces.alpha.enabled.forms,true);
});
test('corrupt data fails clearly, never silently returns new demo seed',()=>{
  assert.throws(()=>parseWorkspace('{not valid',fallback),/원본은 보존/);
  assert.throws(()=>parseWorkspace('{"schools":[],"workspaces":{}}',fallback),/작업공간/);
  assert.throws(()=>normalizeWorkspace({...db,workspaces:{alpha:{...db.workspaces.alpha,events:{bad:true}}}},fallback),/events/);
});
test('existing v02 backup can be restored with all academic records',()=>{
  const text=makeBackup(db);
  assert.equal(JSON.parse(text).format,BACKUP_FORMAT);
  const result=parseBackup(text,fallback);
  assert.deepEqual(result.workspaces.alpha.events,db.workspaces.alpha.events);
});
