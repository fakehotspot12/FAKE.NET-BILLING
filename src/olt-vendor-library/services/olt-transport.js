import { spawn } from 'node:child_process';
import { current, request, remaining } from './context.js';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const busy=new Set(),waiting=new Map();
export function claimOlt(id){if(busy.has(id))return false;busy.add(id);return true;}
export function releaseOlt(id){
  const queue=waiting.get(id);
  while(queue?.length){const next=queue.shift();if(!queue.length)waiting.delete(id);if(next.signal.aborted){next.cancel();continue;}next.grant();return;}
  busy.delete(id);
}
export function waitForOlt(id,{signal,timeoutMs=8000,priority=false}={}){
  if(signal?.aborted)return Promise.reject(Object.assign(Error('Permintaan terminal dibatalkan'),{status:409}));
  if(claimOlt(id))return Promise.resolve();
  const queue=waiting.get(id)||[];
  if(queue.length>=4||[...waiting.values()].reduce((n,rows)=>n+rows.length,0)>=32)return Promise.reject(Object.assign(Error('Antrean konfigurasi OLT penuh. Coba kembali setelah proses selesai.'),{status:429}));
  return new Promise((resolve,reject)=>{
    let timer,settled=false;
    const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);const at=queue.indexOf(entry);if(at>=0)queue.splice(at,1);if(!queue.length)waiting.delete(id);};
    const cancel=()=>{if(settled)return;settled=true;clean();reject(Object.assign(Error('Batas waktu antrean OLT tercapai. Tutup terminal manual jika masih terbuka, lalu periksa kembali.'),{status:429}));};
    const entry={signal:signal||{aborted:false},cancel,grant:()=>{if(settled)return;settled=true;clean();resolve();}};
    if(priority)queue.unshift(entry);else queue.push(entry);waiting.set(id,queue);signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(cancel,Math.max(1,Math.min(priority?20000:8000,timeoutMs)));
  });
}
function acquireQueuedOlt(id){const context=current();return waitForOlt(id,{signal:context.controller.signal,timeoutMs:remaining(),priority:context.cliPriority===true});}
export function isRebootProbe(commands,vendor){return Array.isArray(commands)&&['?','reboot ?','reload ?','system reboot ?'].includes(commands.at(-1))&&['["enable"]','["enable","config"]','["enable","configure terminal"]','["enable","system-view"]',...(vendor==='hsgq'?['["enable","configure"]']:[])].includes(JSON.stringify(commands.slice(0,-1)));}
export function loginDenied(output=''){
  // Login-history counters are not denials; wait for a complete line so a split
  // "authentication failures" banner cannot be mistaken for "authentication fail".
  return String(output).split(/\r\n|\r|\n/).slice(0,-1).some(line=>{
    const message=line.replace(/\b\d+[ \t]+(?:authentication|login)[ \t]+failures?\b/gi,'').replace(/\b(?:authentication|login)[ \t]+failures?[ \t]*[:=][ \t]*\d+\b/gi,'');
    return /\b(?:incorrect|authentication fail(?:ed|ure)?|login fail(?:ed|ure)?|bad password|invalid password|access denied|account (?:is )?(?:locked|blocked))\b/i.test(message);
  });
}
export function hiosoCliRows(output=''){
  if(!/OnuId\s+MacAddress\s+Status/i.test(output))return null;
  const rows=[];for(const line of String(output).split(/\r?\n/)){const value=line.trim();if(!/^0\/\d+:\d+\b/.test(value))continue;const match=value.match(/^(0\/\d+:\d+)\s+((?:[0-9a-f]{2}:){5}[0-9a-f]{2})\s+(\S+)/i);if(!match)return null;rows.push({address:match[1],serialNumber:match[2].replace(/:/g,'').toUpperCase(),status:/^up$/i.test(match[3])?'online':/^down$/i.test(match[3])?'offline':'unknown'});}return rows;
}
export function assertHiosoCliTarget(output,grant){
  const rows=hiosoCliRows(output),matches=rows?.filter(row=>row.address===grant.address);
  if(!matches||matches.length!==1||matches[0].serialNumber!==grant.serialNumber||rows.filter(row=>row.serialNumber===grant.serialNumber).length!==1||matches[0].status!==(grant.action==='delete'?'offline':'online'))throw new Error('MAC, posisi atau status ONU HIOSO berubah; aksi ditahan');
}
export function assertReadCommands(commands=[]){
  if(!Array.isArray(commands)||!commands.length||commands.length>32)throw new Error('Vendor command budget exceeded');
  for(const command of commands){if(typeof command!=='string'||command.length>180||/[\r\n\x00-\x1f;`$&]/.test(command)||! /^(?:enable|exit|quit|terminal\s+(?:length|width)\s+\d+|(?:show|display)\s+[^\r\n]+|configure terminal|conf t|epon|interface epon 0\/\d+)$/i.test(command))throw new Error('Unverified vendor write commands are locked');}
}
export function shellSession({olt,password,commands,timeoutMs,loginTimeoutMs},open){
  const context=current(),saving=olt.vendor==='hioso'&&context.hiosoActionAllowed&&context.hiosoGrant?.operation==='saveConfigCli'&&context.hiosoGrant.used&&commands.length===2&&commands[0]==='enable'&&commands[1]==='write',onuGrant=olt.vendor==='hioso'&&context.hiosoActionAllowed&&context.hiosoGrant?.operation==='onuCli'&&context.hiosoGrant.used?context.hiosoGrant:null;return new Promise(resolve=>{
    let channel,close=()=>{},timer,loginTimer,helpTimer,settled=false,stage='login',buffer='',output='',bytes=0,index=-1,passwordCount=0,confirmation=false;const outputs=[];
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(loginTimer);clearTimeout(helpTimer);context.controller.signal.removeEventListener('abort',abort);close();const action=context.ponGrant||context.pnpGrant||context.bandwidthGrant||context.registrationGrant||context.bridgeGrant||context.hsgqGrant||context.zteOnuGrant;resolve({success:!error,live_mode:true,transport:olt.protocol,outputs,error:error||null,...(context.oltRebootGrant?{submitted:context.oltRebootGrant.submitted,acknowledged:context.oltRebootGrant.acknowledged}:{}),...(action?{submitted:action.submitted,verified:action.verified,completedCommands:outputs.length,failedCommandIndex:error?index:null,cliStage:stage,receivedBytes:bytes}:{})});};
    const abort=()=>finish('Batas waktu pembacaan vendor terlampaui');
    const write=value=>{try{channel.write(value);return true;}catch{finish('Sesi CLI vendor terputus saat mengirim perintah');return false;}};
    const send=value=>{if((olt.vendor==='hioso'||olt.vendor==='hsgq'&&require('../../olt-hsgq').isProbeCommands(commands)||context.rebootProbe)&&stage==='command'&&index===commands.length-1&&value.endsWith('?')){if(write(value))helpTimer=setTimeout(()=>{outputs.push({command:value,stdout:output,stderr:''});finish();},800);return;}if(context.oltRebootGrant&&stage==='command'&&index===commands.length-1&&value===commands.at(-1))context.oltRebootGrant.submitted=true;if(context.ponGrant&&stage==='command'&&index===(context.ponGrant.vendor==='cdata'?7:10))context.ponGrant.submitted=true;write(value+(olt.vendor==='hioso'?'\r':olt.vendor==='hsgq'?'\r\n':'\n'));};
    const next=()=>{if(index===-1)clearTimeout(loginTimer);index++;buffer='';output='';passwordCount=0;if(index>=commands.length)return finish();stage='command';if(context.zteOnuGrant&&index===context.zteOnuGrant.mutationIndex)context.zteOnuGrant.submitted=true;if(context.hsgqGrant&&index===context.hsgqGrant.mutationIndex)context.hsgqGrant.submitted=true;if(context.pnpGrant&&index>=context.pnpGrant.mutationStart&&index<context.pnpGrant.commands.length-3)context.pnpGrant.submitted=true;if(context.bandwidthGrant&&index>=context.bandwidthGrant.mutationStart&&index<context.bandwidthGrant.mutationEnd)context.bandwidthGrant.submitted=true;if(context.registrationGrant&&index>=context.registrationGrant.mutationStart&&index<context.registrationGrant.mutationEnd)context.registrationGrant.submitted=true;if(context.bridgeGrant&&index>=context.bridgeGrant.mutationStart&&index<context.bridgeGrant.mutationEnd)context.bridgeGrant.submitted=true;send(commands[index]);};
    const receive=chunk=>{
      if(settled)return;bytes+=Buffer.byteLength(chunk);if(bytes>524288)return finish('Respons vendor melebihi batas aman');
      const text=String(chunk).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');buffer+=text;if(stage==='command')output+=text;
      if(loginDenied(buffer))return finish('Login CLI vendor ditolak');
      if(stage==='login'&&/(?:login|user\s*name|username)\s*:\s*$/i.test(buffer)){send(olt.username);stage='password';buffer='';return;}
      if(stage!=='command'&&/(?:access\s*)?password\s*:\s*$/i.test(buffer)){if(++passwordCount>2)return finish('Login CLI vendor ditolak');send(password);stage='prompt';buffer='';return;}
      // A show response may arrive in chunks ending at an empty Password field.
      // Only enable may request a credential; other commands never receive it.
      if(stage==='command'&&commands[index]==='enable'&&/(?:^|\n)\s*(?:access\s*)?password\s*:\s*$/i.test(buffer)){if(passwordCount++)return finish('Prompt password vendor tidak sesuai');send(password);buffer='';return;}
      if(stage==='command'&&/--\s*More\s*--|More:\s*$|press ENTER to next line[^\r\n]*next page/i.test(buffer)){write(' ');buffer=buffer.replace(/--\s*More\s*--|More:\s*$|\.{4}press ENTER[^\r\n]*\.{4}/ig,'');return;}
      if(context.oltRebootGrant&&stage==='command'&&index===commands.length-1&&/(?:reboot|reload|restart)/i.test(buffer)&&!/(?:save|factory|default|erase)/i.test(buffer.trim().split('\n').at(-1))&&/(?:confirm|sure|continue).*(?:\[y\/n\]|\(y\/n\)|\[yes\/no\]|yes\/no|\[y\/n\]\[n\]|\(yes\/no\))\s*(?:\[n\])?\s*[:?]?\s*$/i.test(buffer)){
        if(confirmation)return finish('Konfirmasi reboot berulang ditahan');confirmation=true;context.oltRebootGrant.acknowledged=true;send(/yes\/no/i.test(buffer)?'yes':'y');buffer='';return;
      }
      if(/(?:are you sure|confirm|continue).*?(?:\[y\/n\]|\(y\/n\)|\[yes\/no\]|\(yes\/no\)|yes\/no)\s*[:?]?\s*$/i.test(buffer)){if((saving&&index===1||onuGrant&&index===6||context.hsgqGrant&&index===context.hsgqGrant.mutationIndex&&!/factory|erase|default|restore/i.test(buffer)||context.zteOnuGrant&&index===context.zteOnuGrant.mutationIndex&&!/factory|erase|default|restore/i.test(buffer))&&stage==='command'&&!confirmation){confirmation=true;send(context.zteOnuGrant&&/yes\/no/i.test(buffer)?'yes':'y');buffer='';return;}return finish('Konfirmasi tulis vendor ditolak');}
      if(!/(?:^|\n)(?:[^\r\n<>]{1,100}[>#]|<[A-Za-z0-9_.:/()@ -]{1,100}>|\[[^\r\n]{1,100}\])\s*$/.test(buffer))return;
      if(stage==='command'){const errorOutput=olt.vendor==='hsgq'&&require('../../olt-hsgq').missingDetailResponse(commands[index],output)?output.replace(/^\s*Error, GET ont-auth table fail, reason: ONU is not exist\.\s*$/m,''):output;if(/(?:^|\n)\s*(?:%\s*)?(?:\[[^\]\r\n]*\]\s*)?(?:error|failure|failed|unknown command|unrecognized command|no command matched|command incomplete|incomplete command|invalid command)\b/i.test(errorOutput)||olt.vendor==='hsgq'&&/(?:^|\n)\s*vty%[^\r\n]*(?:command incomplete|unknown command|invalid command|no matched command|\berror\b)/i.test(errorOutput))return finish('Perintah vendor belum didukung firmware');if(onuGrant&&index===5)try{assertHiosoCliTarget(output,onuGrant);}catch(error){return finish(error.message);}outputs.push({command:commands[index],stdout:output,stderr:''});}
      if(context.ponGrant&&stage==='command'){
        try{
          require('../../olt-pon').verifyStep(outputs,context.ponGrant,index,buffer);
        }catch{return finish('Target atau status PON belum terverifikasi');}
      }
      if(context.pnpGrant&&stage==='command'){
        try{require('../../olt-zte-pnp').verifyStep(outputs,context.pnpGrant,index,buffer);}catch{return finish('Target, preset atau hasil ONU-PnP belum terverifikasi');}
      }
      if(context.bandwidthGrant&&stage==='command'){
        try{require('../../olt-zte-bandwidth').verifyStep(outputs,context.bandwidthGrant,index,buffer);}catch{return finish('Target, profil atau hasil bandwidth belum terverifikasi');}
      }
      if(context.registrationGrant&&stage==='command'){
        try{require('../../olt-zte-registration').verifyStep(outputs,context.registrationGrant,index,buffer);}catch(error){return finish(error.message||'Target registrasi belum terverifikasi');}
      }
      if(context.bridgeGrant&&stage==='command'){
        try{require('../../olt-zte-bridge').verifyStep(outputs,context.bridgeGrant,index,buffer);}catch(error){return finish(error.message||'Binding LAN belum terverifikasi');}
      }
      if(context.hsgqGrant&&stage==='command')try{require('../../olt-hsgq').verifyStep(outputs,context.hsgqGrant,index,buffer);}catch(error){return finish(error.message||'Target HSGQ belum terverifikasi');}
      if(context.zteOnuGrant&&stage==='command')try{require('../../olt-zte-onu').verifyStep(outputs,context.zteOnuGrant,index,buffer);}catch(error){return finish(error.message||'Target ONU ZTE belum terverifikasi');}
      next();
    };
    context.controller.signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(abort,Math.max(1,Math.min(timeoutMs||12000,remaining())));
    if(context.ponGrant||context.pnpGrant||context.bandwidthGrant||context.registrationGrant||context.bridgeGrant||context.zteOnuGrant||context.hsgqGrant)loginTimer=setTimeout(()=>finish('Batas waktu login CLI vendor terlampaui'),Math.max(10,Math.min(loginTimeoutMs||6000,6000,remaining())));
    try{open({receive,finish,dispose(callback){close=callback;if(settled)close();},ready(stream,dispose,authenticated=false){if(settled){dispose();return;}channel=stream;close=dispose;if(authenticated)stage='prompt';stream.on('data',receive);stream.on('error',()=>finish('Sesi CLI vendor terputus'));stream.on('close',()=>{if(!settled)finish('Sesi CLI vendor berakhir sebelum selesai');});}});}catch{finish('Transport vendor belum tersedia');}
  });
}
export async function executeOltCommands({olt,password,commands,timeoutMs}){
  const rebootContext=current(),reboot=rebootContext.oltRebootGrant&&!rebootContext.oltRebootGrant.used&&JSON.stringify(commands)===JSON.stringify(rebootContext.oltRebootGrant.commands),probe=rebootContext.rebootProbe&&isRebootProbe(commands,rebootContext.device.vendor),ponRead=rebootContext.device.vendor==='cdata'&&require('../../olt-cdata-pon').isReadCommands(commands),ponWrite=rebootContext.ponGrant&&!rebootContext.ponGrant.used&&rebootContext.ponGrant.vendor===rebootContext.device.vendor&&JSON.stringify(commands)===JSON.stringify(rebootContext.ponGrant.commands);
  const pnpWrite=rebootContext.device.vendor==='zte'&&rebootContext.pnpGrant&&!rebootContext.pnpGrant.used&&JSON.stringify(commands)===JSON.stringify(rebootContext.pnpGrant.commands);
  const bandwidthWrite=rebootContext.device.vendor==='zte'&&rebootContext.bandwidthGrant&&!rebootContext.bandwidthGrant.used&&JSON.stringify(commands)===JSON.stringify(rebootContext.bandwidthGrant.commands);
  const registrationWrite=rebootContext.device.vendor==='zte'&&rebootContext.registrationGrant&&!rebootContext.registrationGrant.used&&JSON.stringify(commands)===JSON.stringify(rebootContext.registrationGrant.commands);
  const bridgeWrite=rebootContext.device.vendor==='zte'&&rebootContext.bridgeGrant&&!rebootContext.bridgeGrant.used&&JSON.stringify(commands)===JSON.stringify(rebootContext.bridgeGrant.commands);
  if(bridgeWrite)rebootContext.bridgeGrant.used=true;
  if(registrationWrite)rebootContext.registrationGrant.used=true;
  if(bandwidthWrite)rebootContext.bandwidthGrant.used=true;
  if(reboot)rebootContext.oltRebootGrant.used=true;if(ponWrite)rebootContext.ponGrant.used=true;if(pnpWrite)rebootContext.pnpGrant.used=true;
  const context=request(),hioso=context.device.vendor==='hioso',help=hioso&&Array.isArray(commands)&&(commands.length===2&&commands[0]==='enable'&&commands[1]==='?'||commands.length===5&&commands[0]==='enable'&&commands[1]==='configure terminal'&&commands[2]==='epon'&&/^interface epon 0\/(?:[1-9]|1[0-6])$/.test(commands[3])&&/^(?:onu (?:[1-9]\d?|1[01]\d|12[0-8]) \?|delete onu \?)$/.test(commands[4])),saving=hioso&&context.hiosoActionAllowed&&context.hiosoGrant?.operation==='saveConfigCli'&&!context.hiosoGrant.used&&Array.isArray(commands)&&commands.length===2&&commands[0]==='enable'&&commands[1]==='write',grant=context.hiosoGrant,expected=grant?.operation==='onuCli'?['enable','terminal length 0','configure terminal','epon',`interface epon 0/${grant.pon}`,'show onu info all',grant.action==='delete'?`delete onu ${grant.onuId}`:`onu ${grant.onuId} reboot`,...(grant.action==='delete'?['show onu info all']:[])]:null,onuWrite=hioso&&context.hiosoActionAllowed&&grant?.operation==='onuCli'&&!grant.used&&JSON.stringify(commands)===JSON.stringify(expected);
  const hsgqRead=context.device.vendor==='hsgq'&&(require('../../olt-hsgq').isReadCommands(commands)||require('../../olt-hsgq').isProbeCommands(commands));
  const hsgqWrite=context.device.vendor==='hsgq'&&context.hsgqActionAllowed&&context.hsgqGrant&&!context.hsgqGrant.used&&JSON.stringify(commands)===JSON.stringify(context.hsgqGrant.commands);
  const zteOnuWrite=context.device.vendor==='zte'&&context.zteOnuActionAllowed&&context.zteOnuGrant&&!context.zteOnuGrant.used&&JSON.stringify(commands)===JSON.stringify(context.zteOnuGrant.commands);
  if(zteOnuWrite)context.zteOnuGrant.used=true;
  if(hsgqWrite)context.hsgqGrant.used=true;
  if(!help&&!saving&&!onuWrite&&!probe&&!reboot&&!ponWrite&&!ponRead&&!pnpWrite&&!bandwidthWrite&&!registrationWrite&&!bridgeWrite&&!hsgqRead&&!hsgqWrite&&!zteOnuWrite)assertReadCommands(commands);
  if(olt.id!==context.device.id||olt.host!==context.device.host||olt.protocol!==(context.device.cliProtocol||'telnet')||Number(olt.port)!==Number(context.device.cliPort||23)||!['ssh','telnet'].includes(olt.protocol)||!Number.isInteger(Number(olt.port))||Number(olt.port)<1||Number(olt.port)>65535)throw new Error('Vendor CLI target rejected');
  if(context.cliQueue){
    try{await acquireQueuedOlt(olt.id);}catch(error){if(ponWrite||pnpWrite||bandwidthWrite||registrationWrite||bridgeWrite)return{success:false,submitted:false,verified:false,error:error.message,outputs:[],completedCommands:0,failedCommandIndex:-1,cliStage:'queue'};throw error;}
  }else if(!claimOlt(olt.id)){if(ponWrite||pnpWrite||bandwidthWrite||registrationWrite||bridgeWrite)return{success:false,submitted:false,verified:false,error:'Akses OLT sedang digunakan',outputs:[]};throw new Error('Akses OLT sedang digunakan');}
  if(saving||onuWrite)context.hiosoGrant.used=true;
  try{
    remaining();
    if(context.transports.commands)return await context.transports.commands({olt,password,commands,timeoutMs:Math.min(timeoutMs||12000,remaining())});
    if(olt.protocol==='ssh'){
      const{Client}=await import('ssh2');remaining();
      return await shellSession({olt,password,commands,timeoutMs},({finish,ready,dispose})=>{const connection=new Client(),cleanup=()=>connection.destroy();dispose(cleanup);connection.on('error',()=>finish('Koneksi SSH vendor gagal'));connection.on('close',()=>finish('Sesi SSH vendor berakhir'));connection.on('ready',()=>connection.shell({term:'vt100'},(error,stream)=>{if(error)return finish('Shell SSH vendor gagal');ready(stream,cleanup,true);stream.write('\n');}));connection.connect({host:olt.host,port:Number(olt.port),username:olt.username,password,readyTimeout:Math.min(5000,remaining())});});
    }
    return await shellSession({olt,password,commands,timeoutMs},({finish,ready})=>{const child=spawn('telnet',[olt.host,String(olt.port)],{stdio:'pipe'});child.on('error',()=>finish('Klien Telnet belum tersedia'));child.on('close',()=>finish('Sesi Telnet vendor berakhir'));child.stderr.on('data',()=>{});child.stdin.on('error',()=>finish('Sesi Telnet vendor terputus'));const stream=child.stdout;stream.write=value=>child.stdin.write(value);ready(stream,()=>child.kill());});
  }finally{releaseOlt(olt.id);}
}
export const executeProbeCommands=executeOltCommands;
export const isBusy=id=>busy.has(id);
