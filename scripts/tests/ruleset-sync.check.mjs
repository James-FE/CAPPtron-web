import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildPlan, canonicalRuleset, reconcile, selectLocalRuleset, validateDesired} from '../ruleset-iac-core.mjs'

const desired = JSON.parse(readFileSync(new URL('../../.github/rulesets/main.json', import.meta.url), 'utf8'))
const copy = x => structuredClone(x)
function mock(initial=null) {
  let live = initial && copy(initial)
  const writes=[]
  return {writes,async list(){return live?[{id:1,name:live.name,source_type:'Repository'}]:[]},
    async get(){return {...copy(live), id:1,node_id:'metadata'}},
    async create(_,d){writes.push('POST');live=copy(d);return {id:1}},
    async update(_,id,d){writes.push('PUT');live=copy(d);return {id:1}},
    mutate(f){f(live)}}
}
const run=(api,mode,extras={})=>reconcile({api,mode,desired,repo:'James-FE/CAPPtron-web',approve:async()=>true,log:()=>{},...extras})
test('desired policy validates',()=>{assert.equal(validateDesired(desired),desired)})
test('ignores API metadata and order',()=>{const remote=copy(desired);remote.id=1;remote.rules.reverse();assert.deepEqual(canonicalRuleset(remote),canonicalRuleset(desired))})
test('detects enforcement and status-check drift',()=>{const remote=copy(desired);remote.enforcement='disabled';remote.rules.find(x=>x.type==='required_status_checks').parameters.required_status_checks=[];const plan=buildPlan(desired,remote);assert.equal(plan.action,'update');assert.ok(plan.changes.length>=2)})
test('plan never writes',async()=>{const api=mock();assert.equal((await run(api,'plan')).plan.action,'create');assert.deepEqual(api.writes,[])})
test('check detects drift and returns 2',async()=>{const api=mock({...desired,enforcement:'disabled'});assert.equal((await run(api,'check')).code,2);assert.deepEqual(api.writes,[])})
test('apply creates exactly once',async()=>{const api=mock();await run(api,'apply');await run(api,'apply');assert.deepEqual(api.writes,['POST'])})
test('apply updates and verifies',async()=>{const api=mock({...desired,enforcement:'disabled'});await run(api,'apply');assert.deepEqual(api.writes,['PUT'])})
test('cancelled approval never writes',async()=>{const api=mock();assert.equal((await run(api,'apply',{approve:async()=>false})).code,1);assert.deepEqual(api.writes,[])})
test('detects change after approval',async()=>{const api=mock({...desired,enforcement:'disabled'});await assert.rejects(()=>run(api,'apply',{approve:async()=>{api.mutate(x=>x.enforcement='evaluate');return true}}),/changed while applying/);assert.deepEqual(api.writes,[])})
test('rejects duplicate matches',()=>{assert.throws(()=>selectLocalRuleset([{id:1,name:desired.name,source_type:'Repository'},{id:2,name:desired.name,source_type:'Repository'}],desired.name),/Multiple/)})
