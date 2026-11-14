'use strict';

const { spawn } = require('node:child_process');
const secrets = require('./secure-secrets');
const busy = new Set();
function description(value){if(typeof value!=='string'||!value.trim()||value.length>64||!/^[A-Za-z0-9 ._@()+,:\/-]+$/.test(value))throw new Error('Nama ONU harus 1-64 karakter huruf, angka, spasi atau . _ @ ( ) + , : / -');return value.trim();}
function readDescription(output=''){return String(output).match(/(?:^|\n)[ \t]*Description[ \t]*:[ \t]*([^\r\n]*)/i)?.[1]?.trim()??null;}
function readRunState(output=''){const value=String(output).match(/(?:^|\n)[ \t]*(?:Run[ \t]+state|Run[ \t]+status|Operational[ \t]+state)[ \t]*:[ \t]*(online|offline|up|down)\b/i)?.[1]?.toLowerCase();return value==='online'||value==='up'?'online':value==='offline'||value==='down'?'offline':'unknown';}
function onuDescription(value='',target={}){
  const name=String(value||'').trim(),match=name.match(/^gpon[ \t]+(\d+\/\d+\/\d+)[ \t]+onu[ \t]+(\d+)(?:[ \t]+(.*))?$/i);
  const ponKey=target.ponKey||`0/${target.slot}/${target.pon}`;
  // CDATA SNMP names prepend the physical address; CLI Description does not.
  const sameOnu=match&&Number(match[2])===Number(target.onuId),truncated=match&&!match[3]&&Number.isSafeInteger(target.onuId)&&String(target.onuId).startsWith(match[2]);
  return match&&match[1]===ponKey&&(sameOnu||truncated)?(match[3]||'').trim():name;
}
function onuAbsent(output=''){
  return /(?:^|\n)[ \t]*(?:%[ \t]*)?(?:(?:error|failure|failed)[ \t]*:[ \t]*)?(?:(?:the[ \t]+)?(?:ont|onu)[ \t]+(?:does[ \t]+not[ \t]+exist|not[ \t]+(?:exist|found)|is[ \t]+not[ \t]+(?:configured|registered|found))\b|there[ \t]+is[ \t]+no[ \t]+(?:ont|onu)[ \t]+available[.!]?[ \t]*(?:\r?$))/im.test(output);
}

function run(data, device, target = null, spawnProcess = spawn, options = {}) {
  if (!device.cliEnabled || !device.cliUsername || !device.cliPasswordEnc) return Promise.reject(new Error('Akses CLI OLT belum dikonfigurasi'));
  if (busy.has(device.id)) return Promise.reject(new Error('Akses OLT sedang digunakan, coba kembali'));
  if (target && (![target.slot,target.pon,target.onuId].every(Number.isSafeInteger) || target.slot < 0 || target.slot > 31 || target.pon < 1 || target.pon > 16 || target.onuId < 1 || target.onuId > 1024 || !/^[A-Z0-9]{12}$/.test(target.serialNumber) || !['delete','reboot','describe','inspect'].includes(target.action||'delete'))) return Promise.reject(new Error('Alamat ONU tidak valid'));
  const rename=target?.action==='describe',deleting=Boolean(target&&(target.action||'delete')==='delete');if(rename){try{description(target.description);}catch(error){return Promise.reject(error);}}
  const password = secrets.decryptSecret(data,device.cliPasswordEnc);
  const commands = options.connectionTest===true ? ['enable','show version'] : target ? ['enable','config',`interface gpon 0/${target.slot}`,`show ont info ${target.pon} ${target.onuId}`,...(target.action==='inspect'?[]:[rename?`ont description ${target.pon} ${target.onuId} ${description(target.description)}`:`ont ${target.action||'delete'} ${target.pon} ${target.onuId}`,...(target.action==='reboot'?[]:[`show ont info ${target.pon} ${target.onuId}`])])] : ['enable','show ont status-count'];
  busy.add(device.id);
  return new Promise((resolve,reject) => {
    let process,deadline,inactivity,settled=false,stage='login',buffer='',output='',bytes=0,index=-1,enablePassword=false,confirmation=false,alreadyAbsent=false;
    const outputs=[];
    const finish = error => {
      if (settled) return; settled=true; clearTimeout(deadline);clearTimeout(inactivity);busy.delete(device.id);
      process?.kill(); if (error) reject(error); else resolve({outputs,descriptionConfirmed:rename&&readDescription(outputs.at(-1)?.stdout)===description(target.description),deleteConfirmed:deleting&&(alreadyAbsent||onuAbsent(outputs.at(-1)?.stdout)),alreadyAbsent});
    };
    const send = value => process.stdin.write(value+'\n');
    const next = () => {
      index++;buffer='';output='';enablePassword=false;confirmation=false;
      if (target && index === 4) {
        const sn=outputs.at(-1)?.stdout.match(/\bSN\s*:\s*([A-Za-z0-9]{12}|[A-Fa-f0-9]{16})\b/i)?.[1];
        let normalized=String(sn || '').toUpperCase();if (/^[A-F0-9]{16}$/.test(normalized)) {const raw=Buffer.from(normalized,'hex');normalized=raw.subarray(0,4).toString('ascii')+raw.subarray(4).toString('hex').toUpperCase();}
        if (normalized !== target.serialNumber) return finish(new Error('Serial ONU di OLT berubah atau tidak cocok. Aksi dibatalkan.'));
        if(deleting&&target.requireOffline===true&&readRunState(outputs.at(-1)?.stdout)!=='offline')return finish(new Error('ONU masih online atau status belum terverifikasi. Penghapusan ditahan.'));
        if(rename&&readDescription(outputs.at(-1)?.stdout)!==target.previousDescription)return finish(new Error('Description ONU berubah atau belum terbaca. Buka ulang sebelum menyimpan.'));
      }
      if (index >= commands.length) return finish();
      stage='command';send(commands[index]);
    };
    const receive = chunk => {
      if (settled) return;
      bytes+=chunk.length;if (bytes>262144) return finish(new Error('Respons CLI melebihi batas aman'));
      clearTimeout(inactivity);inactivity=setTimeout(()=>finish(new Error('CLI OLT tidak merespons')),5000);
      const clean=String(chunk).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');buffer+=clean;if(stage==='command')output+=clean;
      if (/incorrect|authentication fail(?:ed)?|login fail(?:ed)?|bad password|invalid password/i.test(buffer)) return finish(new Error('Akun CLI OLT ditolak'));
      if (stage==='login' && /(?:login|user\s*name|username)\s*:\s*$/i.test(buffer)) {send(device.cliUsername);stage='password';buffer='';return;}
      if (stage==='password' && /password\s*:\s*$/i.test(buffer)) {send(password);stage='prompt';buffer='';return;}
      if (stage==='prompt' && /(?:login|user\s*name|username)\s*:\s*$/i.test(buffer)) return finish(new Error('Akun CLI OLT ditolak'));
      if (stage==='command' && /--\s*More\s*--|More:\s*$/i.test(buffer)) {process.stdin.write(' ');buffer=buffer.replace(/--\s*More\s*--|More:\s*$/ig,'');return;}
      if (stage==='command' && /password\s*:\s*$/i.test(buffer)) {if (commands[index]!=='enable'||enablePassword)return finish(new Error('Verifikasi CLI OLT tidak sesuai'));enablePassword=true;send(password);buffer='';return;}
      if (stage==='command' && /(?:sure|confirm|continue).*?(?:\[y\/n\]|\(y\/n\)|yes\/no)\s*:?\s*$/i.test(buffer)) {if (!target||index!==4||confirmation) return finish(new Error('Konfirmasi CLI tidak sesuai operasi'));confirmation=true;send('y');buffer='';return;}
      if (!/(?:^|\n)[^\r\n<>]{1,100}[>#]\s*$/.test(buffer)) return;
      if (stage==='prompt') return next();
      if (stage==='command') {
        const absent=onuAbsent(output);
        if(target&&index===3&&absent){outputs.push({command:commands[index],stdout:output});if(deleting){alreadyAbsent=true;return finish();}const error=new Error('ONU sudah tidak terdaftar pada posisi ini');error.code='ONU_NOT_FOUND';return finish(error);}
        const checked=target&&index===3?output.replace(/^[ \t]*Error[ \t]*:[ \t]*Ranging info get failed[.!]?[ \t]*\r?$/gim,''):output;
        if (/(?:^|\n)[ \t]*(?:%[ \t]*)?(?:error|failure|failed|unknown command|incomplete command|invalid command|command (?:incomplete|invalid|unknown))\b/im.test(checked) && !(deleting&&index===5&&absent)) return finish(new Error('Perintah CLI OLT belum berhasil'));
        outputs.push({command:commands[index],stdout:output});next();
      }
    };
    try {
      process=spawnProcess('telnet',[device.host,String(device.cliPort||23)],{stdio:'pipe'});
      process.stdout.on('data',receive);process.stderr.on('data',()=>{});
      process.stdin.on('error',()=>finish(new Error('Sesi CLI OLT terputus')));
      process.on('error',()=>finish(new Error('Klien Telnet belum tersedia')));
      process.on('close',()=>finish(new Error('Sesi CLI OLT berakhir sebelum selesai')));
      deadline=setTimeout(()=>finish(new Error('Batas waktu CLI OLT terlampaui')),target?20000:10000);
    } catch {finish(new Error('Akses CLI OLT gagal'));}
  });
}
async function readCauses(data,device) {const result=await run(data,device);return result.outputs.find(row=>row.command==='show ont status-count')?.stdout || '';}
async function deleteOnu(data,device,target) {return run(data,device,target);}
async function rebootOnu(data,device,target) {return run(data,device,{...target,action:'reboot'});}
async function renameOnu(data,device,target) {return run(data,device,{...target,action:'describe'});}
async function inspectOnu(data,device,target) {return run(data,device,{...target,action:'inspect'});}
async function testConnection(data,device) {return run(data,device,null,spawn,{connectionTest:true});}
module.exports={readCauses,deleteOnu,rebootOnu,renameOnu,inspectOnu,testConnection,description,readDescription,readRunState,onuDescription,onuAbsent,run};
