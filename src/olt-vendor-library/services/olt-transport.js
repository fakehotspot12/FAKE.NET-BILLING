import { spawn } from 'node:child_process';
import { current, request, remaining } from './context.js';
const busy=new Set();
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
export function shellSession({olt,password,commands,timeoutMs},open){
  const context=current(),saving=olt.vendor==='hioso'&&context.hiosoActionAllowed&&context.hiosoGrant?.operation==='saveConfigCli'&&context.hiosoGrant.used&&commands.length===2&&commands[0]==='enable'&&commands[1]==='write',onuGrant=olt.vendor==='hioso'&&context.hiosoActionAllowed&&context.hiosoGrant?.operation==='onuCli'&&context.hiosoGrant.used?context.hiosoGrant:null;return new Promise(resolve=>{
    let channel,close=()=>{},timer,helpTimer,settled=false,stage='login',buffer='',output='',bytes=0,index=-1,passwordCount=0,confirmation=false;const outputs=[];
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(helpTimer);context.controller.signal.removeEventListener('abort',abort);close();resolve({success:!error,live_mode:true,transport:olt.protocol,outputs,error:error||null});};
    const abort=()=>finish('Batas waktu pembacaan vendor terlampaui');
    const send=value=>{if(olt.vendor==='hioso'&&stage==='command'&&index===commands.length-1&&value.endsWith('?')){channel.write(value);helpTimer=setTimeout(()=>{outputs.push({command:value,stdout:output,stderr:''});finish();},800);return;}channel.write(value+(olt.vendor==='hioso'?'\r':olt.vendor==='hsgq'?'\r\n':'\n'));};
    const next=()=>{index++;buffer='';output='';passwordCount=0;if(index>=commands.length)return finish();stage='command';send(commands[index]);};
    const receive=chunk=>{
      if(settled)return;bytes+=Buffer.byteLength(chunk);if(bytes>524288)return finish('Respons vendor melebihi batas aman');
      const text=String(chunk).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');buffer+=text;if(stage==='command')output+=text;
      if(/incorrect|authentication fail|login fail|bad password|invalid password/i.test(buffer))return finish('Login CLI vendor ditolak');
      if(stage==='login'&&/(?:login|user\s*name|username)\s*:\s*$/i.test(buffer)){send(olt.username);stage='password';buffer='';return;}
      if(stage!=='command'&&/(?:access\s*)?password\s*:\s*$/i.test(buffer)){if(++passwordCount>2)return finish('Login CLI vendor ditolak');send(password);stage='prompt';buffer='';return;}
      if(stage==='command'&&/password\s*:\s*$/i.test(buffer)){if(commands[index]!=='enable'||passwordCount++)return finish('Prompt password vendor tidak sesuai');send(password);buffer='';return;}
      if(stage==='command'&&/--\s*More\s*--|More:\s*$|press ENTER to next line[^\r\n]*next page/i.test(buffer)){channel.write(' ');buffer=buffer.replace(/--\s*More\s*--|More:\s*$|\.{4}press ENTER[^\r\n]*\.{4}/ig,'');return;}
      if(/(?:are you sure|confirm|continue).*?(?:\[y\/n\]|\(y\/n\)|yes\/no)\s*:?\s*$/i.test(buffer)){if((saving&&index===1||onuGrant&&index===6)&&stage==='command'&&!confirmation){confirmation=true;send('y');buffer='';return;}return finish('Konfirmasi tulis vendor ditolak');}
      if(!/(?:^|\n)(?:[^\r\n<>]{1,100}[>#]|<[A-Za-z0-9_.:/()@ -]{1,100}>|\[[^\r\n]{1,100}\])\s*$/.test(buffer))return;
      if(stage==='command'){if(/(?:^|\n)\s*(?:%\s*)?(?:\[[^\]\r\n]*\]\s*)?(?:error|failure|failed|unknown command|unrecognized command|no command matched|command incomplete|incomplete command|invalid command)\b/i.test(output))return finish('Perintah vendor belum didukung firmware');if(onuGrant&&index===5)try{assertHiosoCliTarget(output,onuGrant);}catch(error){return finish(error.message);}outputs.push({command:commands[index],stdout:output,stderr:''});}
      next();
    };
    context.controller.signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(abort,Math.max(1,Math.min(timeoutMs||12000,remaining())));
    try{open({receive,finish,dispose(callback){close=callback;if(settled)close();},ready(stream,dispose,authenticated=false){if(settled){dispose();return;}channel=stream;close=dispose;if(authenticated)stage='prompt';stream.on('data',receive);stream.on('error',()=>finish('Sesi CLI vendor terputus'));stream.on('close',()=>{if(!settled)finish('Sesi CLI vendor berakhir sebelum selesai');});}});}catch{finish('Transport vendor belum tersedia');}
  });
}
export async function executeOltCommands({olt,password,commands,timeoutMs}){
  const context=request(),hioso=context.device.vendor==='hioso',help=hioso&&Array.isArray(commands)&&(commands.length===2&&commands[0]==='enable'&&commands[1]==='?'||commands.length===5&&commands[0]==='enable'&&commands[1]==='configure terminal'&&commands[2]==='epon'&&/^interface epon 0\/(?:[1-9]|1[0-6])$/.test(commands[3])&&/^(?:onu (?:[1-9]\d?|1[01]\d|12[0-8]) \?|delete onu \?)$/.test(commands[4])),saving=hioso&&context.hiosoActionAllowed&&context.hiosoGrant?.operation==='saveConfigCli'&&!context.hiosoGrant.used&&Array.isArray(commands)&&commands.length===2&&commands[0]==='enable'&&commands[1]==='write',grant=context.hiosoGrant,expected=grant?.operation==='onuCli'?['enable','terminal length 0','configure terminal','epon',`interface epon 0/${grant.pon}`,'show onu info all',grant.action==='delete'?`delete onu ${grant.onuId}`:`onu ${grant.onuId} reboot`,...(grant.action==='delete'?['show onu info all']:[])]:null,onuWrite=hioso&&context.hiosoActionAllowed&&grant?.operation==='onuCli'&&!grant.used&&JSON.stringify(commands)===JSON.stringify(expected);if(!help&&!saving&&!onuWrite)assertReadCommands(commands);
  if(olt.host!==context.device.host||olt.protocol!==(context.device.cliProtocol||'telnet')||Number(olt.port)!==Number(context.device.cliPort||23)||!['ssh','telnet'].includes(olt.protocol)||!Number.isInteger(Number(olt.port))||Number(olt.port)<1||Number(olt.port)>65535)throw new Error('Vendor CLI target rejected');
  if(busy.has(olt.id))throw new Error('Akses OLT sedang digunakan');
  if(saving||onuWrite)context.hiosoGrant.used=true;
  if(context.transports.commands)return context.transports.commands({olt,password,commands,timeoutMs});
  busy.add(olt.id);
  try{
    if(olt.protocol==='ssh'){
      const{Client}=await import('ssh2');remaining();
      return await shellSession({olt,password,commands,timeoutMs},({finish,ready,dispose})=>{const connection=new Client(),cleanup=()=>connection.destroy();dispose(cleanup);connection.on('error',()=>finish('Koneksi SSH vendor gagal'));connection.on('close',()=>finish('Sesi SSH vendor berakhir'));connection.on('ready',()=>connection.shell({term:'vt100'},(error,stream)=>{if(error)return finish('Shell SSH vendor gagal');ready(stream,cleanup,true);stream.write('\n');}));connection.connect({host:olt.host,port:Number(olt.port),username:olt.username,password,readyTimeout:Math.min(5000,remaining())});});
    }
    return await shellSession({olt,password,commands,timeoutMs},({finish,ready})=>{const child=spawn('telnet',[olt.host,String(olt.port)],{stdio:'pipe'});child.on('error',()=>finish('Klien Telnet belum tersedia'));child.on('close',()=>finish('Sesi Telnet vendor berakhir'));child.stderr.on('data',()=>{});child.stdin.on('error',()=>finish('Sesi Telnet vendor terputus'));const stream=child.stdout;stream.write=value=>child.stdin.write(value);ready(stream,()=>child.kill());});
  }finally{busy.delete(olt.id);}
}
export const executeProbeCommands=executeOltCommands;
