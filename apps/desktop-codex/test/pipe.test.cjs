const test=require('node:test');
const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {PipeClient,bestPageStatus,writeReport}=require('../src/codex-rtl-live.cjs');
test('the relocated adapter and shared engine assemble as an injectable script',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=path.resolve(__dirname,'..');
 const core=fs.readFileSync(path.resolve(app,'../../packages/core/src/direction.js'),'utf8');
 const dom=fs.readFileSync(path.resolve(app,'../../packages/dom/src/engine.js'),'utf8');
 const adapter=fs.readFileSync(path.join(app,'src/codex-rtl-adapter.js'),'utf8');
 assert.doesNotThrow(()=>new Function('(()=>{\n'+core+'\n'+dom+'\n'+adapter+'\n})()'));
});
function setup(){const input=new PassThrough(),output=new PassThrough();return{input,output,client:new PipeClient(output,input)}}
test('CDP response survives split UTF-8 and combined null-terminated frames',async()=>{
 const {input,client}=setup();const one=client.request('first'),two=client.request('second');
 const data=Buffer.from(JSON.stringify({id:1,result:{value:'اردو'}})+'\0'+JSON.stringify({id:2,result:{value:2}})+'\0');
 for(const byte of data)input.write(Buffer.from([byte]));
 assert.deepEqual(await one,{value:'اردو'});assert.deepEqual(await two,{value:2});
});
test('protocol error rejects the matching request, without losing the next response',async()=>{
 const {input,client}=setup();const one=client.request('unavailable');const rejected=assert.rejects(one,/unsupported/);const two=client.request('available');
 input.write(JSON.stringify({id:1,error:{message:'unsupported'}})+'\0'+JSON.stringify({id:2,result:{ok:true}})+'\0');
 await rejected;assert.deepEqual(await two,{ok:true});
});
test('a closed pipe settles waiting calls instead of hanging the launcher',async()=>{
 const {client}=setup();const pending=client.request('pending');const rejected=assert.rejects(pending,/app gone/);client.close(Error('app gone'));await rejected;assert.equal(client.pending.size,0);
});
test('an empty shell does not overwrite the real chat status',()=>{
 const chat={adapter:{found:{composer:true,answerRoots:1},engine:{answerBlocks:20}}};
 const empty={adapter:{found:{composer:false,answerRoots:0},engine:{answerBlocks:0}}};
 assert.equal(bestPageStatus([chat,empty]),chat);assert.equal(bestPageStatus([empty,chat]),chat);assert.equal(bestPageStatus([]),null);
});
test('a Windows rename lock falls back to writing the report without killing the helper',()=>{
 const writes=[];
 const io={writeFileSync:(file,data)=>writes.push({file,data}),renameSync(){const e=Error('locked');e.code='EPERM';throw e}};
 assert.equal(writeReport('report.json',{state:'running'},io),true);
 assert.equal(writes[1].file,'report.json');assert.equal(JSON.parse(writes[1].data).state,'running');
});
test('an unavailable report directory does not throw through the live adapter',()=>{
 assert.equal(writeReport('report.json',{}, {writeFileSync(){throw Error('temporarily denied')},renameSync(){}}),false);
});
