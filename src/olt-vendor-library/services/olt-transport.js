import { spawn } from 'node:child_process';
import { current, request, remaining } from './context.js';
const busy=new Set();
export function assertReadCommands(commands=[]){
  if(!Array.isArray(commands)||!commands.length||commands.length>32)throw new Error('Vendor command budget exceeded');
  for(const command of commands){if(typeof command!=='string'||command.length>180||/[\r\n\x00-\x1f;`$&]/.test(command)||! /^(?:enable|exit|quit|terminal\s+(?:length|width)\s+\d+|(?:show|display)\s+[^\r\n]+|configure terminal|conf t|epon|interface epon 0\/\d+)$/i.test(command))throw new Error('Unverified vendor write commands are locked');}
}
export function shellSession({olt,password,commands,timeoutMs},open){
  const context=current();return new Promise(resolve=>{
    let channel,close=()=>{},timer,settled=false,stage='login',buffer='',output='',bytes=0,index=-1,passwordCount=0;const outputs=[];
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);context.controller.signal.removeEventListener('abort',abort);close();resolve({success:!error,live_mode:true,transport:olt.protocol,outputs,error:error||null});};
    const abort=()=>finish('Batas waktu pembacaan vendor terlampaui');
    const send=value=>channel.write(value+(olt.vendor==='hioso'?'\r':olt.vendor==='hsgq'?'\r\n':'\n'));
    const next=()=>{index++;buffer='';output='';passwordCount=0;if(index>=commands.length)return finish();stage='command';send(commands[index]);};
    const receive=chunk=>{
      if(settled)return;bytes+=Buffer.byteLength(chunk);if(bytes>524288)return finish('Respons vendor melebihi batas aman');
      const text=String(chunk).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');buffer+=text;if(stage==='command')output+=text;
      if(/incorrect|authentication fail|login fail|bad password|invalid password/i.test(buffer))return finish('Login CLI vendor ditolak');
      if(stage==='login'&&/(?:login|user\s*name|username)\s*:\s*$/i.test(buffer)){send(olt.username);stage='password';buffer='';return;}
      if(stage!=='command'&&/(?:access\s*)?password\s*:\s*$/i.test(buffer)){if(++passwordCount>2)return finish('Login CLI vendor ditolak');send(password);stage='prompt';buffer='';return;}
      if(stage==='command'&&/password\s*:\s*$/i.test(buffer)){if(commands[index]!=='enable'||passwordCount++)return finish('Prompt password vendor tidak sesuai');send(password);buffer='';return;}
      if(stage==='command'&&/--\s*More\s*--|More:\s*$|press ENTER to next line[^\r\n]*next page/i.test(buffer)){channel.write(' ');buffer=buffer.replace(/--\s*More\s*--|More:\s*$|\.{4}press ENTER[^\r\n]*\.{4}/ig,'');return;}
      if(/(?:are you sure|confirm|continue).*?(?:\[y\/n\]|\(y\/n\)|yes\/no)\s*:?\s*$/i.test(buffer))return finish('Konfirmasi tulis vendor ditolak');
      if(!/(?:^|\n)(?:[^\r\n<>]{1,100}[>#]|<[A-Za-z0-9_.:/()@ -]{1,100}>|\[[^\r\n]{1,100}\])\s*$/.test(buffer))return;
      if(stage==='command'){if(/(?:^|\n)\s*(?:%\s*)?(?:error|failure|failed|unknown command|unrecognized command|incomplete command|invalid command)\b/i.test(output))return finish('Perintah baca vendor belum didukung firmware');outputs.push({command:commands[index],stdout:output,stderr:''});}
      next();
    };
    context.controller.signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(abort,Math.max(1,Math.min(timeoutMs||12000,remaining())));
    try{open({receive,finish,dispose(callback){close=callback;if(settled)close();},ready(stream,dispose,authenticated=false){if(settled){dispose();return;}channel=stream;close=dispose;if(authenticated)stage='prompt';stream.on('data',receive);stream.on('error',()=>finish('Sesi CLI vendor terputus'));stream.on('close',()=>{if(!settled)finish('Sesi CLI vendor berakhir sebelum selesai');});}});}catch{finish('Transport vendor belum tersedia');}
  });
}
export async function executeOltCommands({olt,password,commands,timeoutMs}){
  const context=request();assertReadCommands(commands);
  if(olt.host!==context.device.host||olt.protocol!==(context.device.cliProtocol||'telnet')||Number(olt.port)!==Number(context.device.cliPort||23)||!['ssh','telnet'].includes(olt.protocol)||!Number.isInteger(Number(olt.port))||Number(olt.port)<1||Number(olt.port)>65535)throw new Error('Vendor CLI target rejected');
  if(busy.has(olt.id))throw new Error('Akses OLT sedang digunakan');
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
