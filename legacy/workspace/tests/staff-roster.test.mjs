import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorkspace,makeBackup,parseBackup} from '../lib/workspace.js';
const defaults={events:[],tasks:[],docs:[],links:[],forms:[],formEntries:[],menus:[],enabled:{calendar:true},staffMembers:[],staffQuotas:{}};

test('existing older workspace loads without forcing a teacher roster',()=>{
  const old={schools:[{id:'x',name:'데모'}],workspaces:{x:{events:[],enabled:{calendar:true}}}};
  const parsed=normalizeWorkspace(old,defaults);
  assert.deepEqual(parsed.workspaces.x.staffMembers,[]);
  assert.deepEqual(parsed.workspaces.x.staffQuotas,{});
});
test('teacher roster and fixed quotas survive full backup round trip',()=>{
  const data={schools:[{id:'x',name:'데모'}],workspaces:{x:{...defaults,staffMembers:[{id:'teacher1',name:'교사 A',subject:'국어',employment:'정규교원',status:'재직'}],staffQuotas:{국어:2}}}};
  const parsed=parseBackup(makeBackup(data),defaults);
  assert.equal(parsed.workspaces.x.staffMembers[0].id,'teacher1');
  assert.equal(parsed.workspaces.x.staffQuotas.국어,2);
});
test('corrupt teacher roster cannot silently override saved data',()=>{
  const data={schools:[{id:'x',name:'데모'}],workspaces:{x:{...defaults,staffMembers:{bad:'invalid'}}}};
  assert.throws(()=>normalizeWorkspace(data,defaults),/staffMembers/);
});
