// Runs the original installed app with a private CDP pipe. No executable copies or patches.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {EventEmitter}=require('node:events');
const {StringDecoder}=require('node:string_decoder');

class PipeClient extends EventEmitter {
  constructor(write,read){super();this.write=write;this.next=0;this.pending=new Map();this.buffer='';this.decoder=new StringDecoder('utf8');
    read.on('data',b=>this.feed(b));read.on('error',e=>this.close(e));
    read.on('end',()=>this.close(Error('Pipe closed')));write.on('error',e=>this.close(e));}
  feed(b){this.buffer+=this.decoder.write(b);let at;
    while((at=this.buffer.indexOf('\0'))>=0){const raw=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);if(!raw)continue;
      let m;try{m=JSON.parse(raw)}catch{continue}
      if(m.id){const p=this.pending.get(m.id);if(!p)continue;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}
      else this.emit('event',m);
    }
  }
  request(method,params={},sessionId){return new Promise((resolve,reject)=>{
    const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Timed out: '+method))},10000);
    this.pending.set(id,{resolve,reject,timer});
    this.write.write(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}})+'\0',e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e)}});
  })}
  close(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e)}this.pending.clear();this.emit('closed',e.message)}
}

function bestPageStatus(pages){return pages.filter(p=>p.adapter).sort((a,b)=>{
 const score=p=>Number(!!p.adapter.found?.composer)*100000+(p.adapter.engine?.answerBlocks??0)*10+(p.adapter.engine?.sentMessages??0)*10+(p.adapter.found?.answerRoots??0);
 return score(b)-score(a);
})[0]??null}

function writeReport(file,value,io=fs){
  const content=JSON.stringify(value,null,2),temp=file+'.tmp';
  try{io.writeFileSync(temp,content);io.renameSync(temp,file);return true}
  catch(e){
    // Windows may temporarily lock the destination. Reporting must not kill the adapter.
    try{io.writeFileSync(file,content);return true}catch{return false}
  }
}

async function main(){
  const [exe,runId,family,launchMode,runtimeArgument]=process.argv.slice(2);if(!exe||!fs.existsSync(exe))throw Error('Installed executable not found');
  const appRoot=path.resolve(__dirname,'..');
  const runtimeDir=runtimeArgument||path.join(appRoot,'.runtime');
  fs.mkdirSync(runtimeDir,{recursive:true});
  const reportPath=path.join(runtimeDir,'codex-rtl-live-report.json');
  const report={runId,helperPid:process.pid,helperVersion:5,launchMode:launchMode||'direct',at:new Date().toISOString(),exe,expectedPackageFamily:family,mode:'preview',installedFilesChanged:false,tcpPortOpened:false,state:'starting',updaterEvidence:[]};
  function save(){report.at=new Date().toISOString();writeReport(reportPath,report)}
  process.on('uncaughtExceptionMonitor',e=>{report.state='helper-error';report.error=e.message;save()});
  process.on('exit',code=>{if(!['app-exited','app-not-attached','launch-error'].includes(report.state)){report.state='helper-exited';report.helperExitCode=code;save()}});
  const core=fs.readFileSync(path.resolve(appRoot,'../../packages/core/src/direction.js'),'utf8');
  const dom=fs.readFileSync(path.resolve(appRoot,'../../packages/dom/src/engine.js'),'utf8');
  const crypto=require('node:crypto');
  if(crypto.createHash('sha256').update(core.replace(/\r\n/g,'\n')).digest('hex')!=='8b72c365e1d7ec8609e7207fd48b3760b1834ee276892a45515cb2faaed34998')throw Error('Frozen formula checksum differs');
  let payload='';let payloadVersion='';
  function refreshPayload(){const fresh=fs.readFileSync(path.join(__dirname,'codex-rtl-adapter.js'),'utf8');
    const fingerprint=crypto.createHash('sha256').update(fresh).digest('hex');
    if(fingerprint!==payloadVersion){payloadVersion=fingerprint;
      payload='(()=>{if(location.protocol!=="app:"||location.hostname!=="-")return;if(window.__smartRtlCodexPayload==='+JSON.stringify(fingerprint)+')return;window.__smartRtlCodex?.stop();delete window.__smartRtlCodex;window.__smartRtlCodexPayload='+JSON.stringify(fingerprint)+';\n'+core+'\n'+dom+'\n'+fresh+'\n})()';
    }}
  refreshPayload();
  const env={...process.env};delete env.CODEX_ELECTRON_USER_DATA_PATH;
  const child=spawn(exe,['--remote-debugging-pipe'],{env,stdio:['ignore','pipe','pipe','pipe','pipe'],windowsHide:true});
  report.pid=child.pid;save();
  let ended=false,tick,busy=false;
  const heartbeatPath=path.join(runtimeDir,'codex-rtl-heartbeat.json');
  const heartbeat=()=>writeReport(heartbeatPath,{runId,at:new Date().toISOString(),helperPid:process.pid,appPid:child.pid,state:report.state});
  heartbeat();const heartbeatTimer=setInterval(heartbeat,5000);
  const sessions=new Map();
  const client=new PipeClient(child.stdio[3],child.stdio[4]);
  function logs(stream){let buf='';stream.on('data',chunk=>{buf+=chunk.toString();let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);
    if(/no package identity|no-package-identity|missing Windows package identity/i.test(line)){report.packageIdentityUnavailable=true;save()}
    // Retain only updater metadata, never chat text or raw app logs.
    if(/\[sparkle\]|\[windows-updater\]|Launching app /.test(line)){report.updaterEvidence.push(line.slice(0,600));report.updaterEvidence=report.updaterEvidence.slice(-24);save()}
  }if(buf.length>100000)buf='';})}
  logs(child.stdout);logs(child.stderr);
  child.on('error',e=>{ended=true;clearInterval(tick);clearInterval(heartbeatTimer);report.state='launch-error';report.error=e.message;save();client.close(e)});
  child.on('exit',(code,signal)=>{ended=true;clearInterval(tick);clearInterval(heartbeatTimer);report.state=sessions.size?'app-exited':'app-not-attached';report.exitCode=code;report.signal=signal;
    if(!sessions.size)report.nextAction='Fully Quit the existing app, then run Start-Codex-SmartRTL.ps1 again.';save();client.close(Error('App exited'))});
  client.on('closed',message=>{if(!ended){report.state='pipe-disconnected';report.error=message;save()}});
  client.on('event',m=>{
    if(m.method==='Target.detachedFromTarget')for(const [id,v] of sessions)if(v.sessionId===m.params.sessionId)sessions.delete(id);
    for(const v of sessions.values())if(v.sessionId===m.sessionId){
      if(m.method==='Runtime.executionContextCreated'){const c=m.params.context;if(c.auxData?.isDefault&&c.origin==='app://-')v.contexts.set(c.id,{id:c.id,frameId:c.auxData?.frameId})}
      if(m.method==='Runtime.executionContextDestroyed')v.contexts.delete(m.params.executionContextId);
      if(m.method==='Runtime.executionContextsCleared')v.contexts.clear();
    }
  });
  async function update(){if(ended||busy)return;busy=true;try{
    refreshPayload();
    const {targetInfos}=await client.request('Target.getTargets');
    report.targets=targetInfos.map(t=>({type:t.type,url:t.url.split('?')[0].split('#')[0]}));
    const targets=targetInfos.filter(t=>['page','iframe','webview'].includes(t.type)&&/^app:\/\/-\//.test(t.url));
    const pages=[];
    for(const target of targets){try{
      let s=sessions.get(target.targetId);
      if(!s){const attached=await client.request('Target.attachToTarget',{targetId:target.targetId,flatten:true});s={sessionId:attached.sessionId,contexts:new Map()};sessions.set(target.targetId,s);
        await client.request('Runtime.enable',{},s.sessionId);
        await client.request('Page.addScriptToEvaluateOnNewDocument',{source:payload},s.sessionId);
      }
      const sid=s.sessionId;
      for(const context of s.contexts.size?[...s.contexts.values()]:[{}]){try{
        const scope=context.id?{contextId:context.id}:{};
        const ready=await client.request('Runtime.evaluate',{expression:'location.protocol==="app:"&&!!document.documentElement',returnByValue:true,...scope},sid);
        if(!ready.result?.value)continue;
        await client.request('Runtime.evaluate',{expression:payload,...scope},sid);
        const status=await client.request('Runtime.evaluate',{expression:'({href:location.href,adapter:window.__smartRtlCodex?.status()??null})',returnByValue:true,...scope},sid);
        if(status.exceptionDetails)throw Error('Adapter status evaluation failed');
        if(status.result?.value)pages.push({targetId:target.targetId,contextId:context.id,...status.result.value});
      }catch(e){report.lastContextError=e.message}}
    }catch(e){report.lastAttachmentError=e.message;save()}}
    report.pages=pages;const best=bestPageStatus(pages);
    if(best){report.adapter=best.adapter;report.state=best.adapter.error?'adapter-error':best.adapter.found?.composer||best.adapter.engine?.answerBlocks>0?'running':'waiting-for-chat';report.error=null}
    else{report.adapter=null;report.state='waiting-for-chat'}
    save();
  }catch(e){if(!ended){report.lastAttachmentError=e.message;save()}}finally{busy=false}}
  tick=setInterval(update,3000);await update();
  // Do not terminate a user's normal app on an adapter error. The app keeps running;
  // this helper keeps its private pipe alive until the app exits normally.
}
module.exports={PipeClient,bestPageStatus,writeReport};
if(require.main===module)main().catch(e=>{console.error('SmartRTL launcher: '+e.message);process.exitCode=1});
