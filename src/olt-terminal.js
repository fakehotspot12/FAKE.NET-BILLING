'use strict';
const crypto=require('node:crypto'),net=require('node:net'),{spawn}=require('node:child_process'),secrets=require('./secure-secrets');
const policy=require('./olt-terminal-policy');
const IDLE_MS=300000,LIFE_MS=1800000,BUFFER_LIMIT=131072,OUTPUT_LIMIT=1048576,MAX_SESSIONS=2;
const signature=device=>JSON.stringify([device.id,device.updatedAt,device.host,device.cliProtocol,device.cliPort,device.cliUsername,device.cliPasswordEnc,device.enabled,device.cliEnabled]);
const clean=value=>String(value).replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').replace(/\r\n?/g,'\n');
function fail(message,status=400){const error=Error(message);error.status=status;throw error;}
async function openTransport(device,handlers){
 if((device.cliProtocol||'telnet')==='ssh'){
  const{Client}=require('ssh2'),connection=new Client();connection.on('error',()=>handlers.end('Koneksi SSH OLT gagal'));connection.on('close',()=>handlers.end());connection.on('ready',()=>connection.shell({term:'xterm',cols:handlers.cols||100,rows:handlers.rows||30},(error,stream)=>{if(error){handlers.end('Shell SSH OLT tidak tersedia');return;}handlers.ready(value=>stream.write(value),true,(cols,rows)=>stream.setWindow(rows,cols,0,0));stream.on('data',handlers.data);stream.on('error',()=>handlers.end('Sesi SSH OLT terputus'));stream.on('close',()=>handlers.end());stream.write('\n');}));connection.connect({host:device.host,port:device.cliPort||22,username:device.cliUsername,password:handlers.password,readyTimeout:10000,keepaliveInterval:15000,keepaliveCountMax:2});return()=>connection.destroy();
 }
 if(handlers.native){
  const child=require('node-pty').spawn('telnet',['-E',device.host,String(device.cliPort||23)],{name:'xterm',cols:handlers.cols,rows:handlers.rows,cwd:'/tmp',env:{PATH:process.env.PATH||'/usr/bin:/bin',TERM:'xterm'}});
  handlers.ready(value=>child.write(value),false,(cols,rows)=>child.resize(cols,rows),'\r');const output=child.onData(handlers.data),ended=child.onExit(()=>handlers.end());return()=>{output.dispose();ended.dispose();child.kill();};
 }
 const child=spawn('telnet',['-E',device.host,String(device.cliPort||23)],{stdio:'pipe'});handlers.ready(value=>child.stdin.write(value),false);child.stdout.on('data',handlers.data);child.stderr.on('data',()=>{});child.stdin.on('error',()=>handlers.end('Sesi Telnet OLT terputus'));child.on('error',()=>handlers.end('Klien Telnet belum tersedia'));child.on('close',()=>handlers.end());return()=>child.kill();
}
function createManager({open=openTransport,now=Date.now}={}){
 const sessions=new Map(),attempts=new Map();let sweeper;
 function write(session,value){try{session.write(value);}catch{close(session,'Sesi OLT terputus');fail('Sesi OLT terputus',409);}}
 function wake(session){session.revision=(session.revision||0)+1;if(session.waiter&&!session.wakeTimer){session.wakeTimer=setTimeout(()=>{session.wakeTimer=null;session.waiter?.();},20);session.wakeTimer.unref?.();}}
 function append(session,value){const text=session.nativeMode?String(value):clean(value);session.offset+=text.length;session.buffer=(session.buffer+text).slice(-BUFFER_LIMIT);session.base=session.offset-session.buffer.length;wake(session);}
 function close(session,message='Sesi ditutup'){
  if(session.state==='closed')return;session.state='closed';session.closedAt=now();clearTimeout(session.loginTimer);clearTimeout(session.completionTimer);clearTimeout(session.resyncTimer);session.engine?.dispose();try{session.dispose?.();}catch{}finally{session.release?.();session.dispose=null;session.release=null;session.write=null;session.authBuffer='';}append(session,'\r\n'+message+'\r\n');session.waiter?.();
 }
 function sweep(){for(const[id,session]of sessions){if(session.state!=='closed'&&(now()-session.lastInput>=IDLE_MS||now()-session.createdAt>=LIFE_MS))close(session,'Sesi berakhir karena batas waktu');if(session.state==='closed'&&(now()-session.closedAt>60000||sessions.size>64))sessions.delete(id);}if(!sessions.size&&sweeper){clearInterval(sweeper);sweeper=null;}}
 function isOpen(id){sweep();return[...sessions.values()].some(session=>session.deviceId===id&&session.state!=='closed');}
 function find(owner,device,id){sweep();const session=sessions.get(id);if(!session||session.owner!==owner||session.deviceId!==device.id)fail('Sesi terminal tidak ditemukan',404);if(session.signature!==signature(device)){close(session,'Konfigurasi koneksi OLT berubah');fail('Koneksi OLT berubah. Hubungkan ulang terminal.',409);}return session;}
 async function start(data,device,owner,input={},options={}){
  sweep();if(!owner||input.confirm!==true||input.revision!==(device.updatedAt||''))fail('Konfirmasi akses dan revisi OLT wajib sesuai',409);
  if(!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc)fail('Aktifkan dan isi akun CLI OLT terlebih dahulu');
  const host=net.isIP(device.host)===6?new URL('http://['+device.host+']/').hostname.slice(1,-1):device.host;
  if(!net.isIP(host)||/^(?:0\.|127\.|169\.254\.|22[4-9]\.|23\d\.|255\.|::|ff[0-9a-f]{2}:|fe80:)/i.test(host)||!['telnet','ssh'].includes(device.cliProtocol||'telnet')||!Number.isInteger(Number(device.cliPort))||Number(device.cliPort)<1||Number(device.cliPort)>65535)fail('Target CLI OLT tidak valid');
  if(process.env.MIGRATION_MODE==='1'&&(!options.explicitDevAccess||/^demo-olt-/.test(device.id)))fail('Terminal perangkat simulasi tidak tersedia');
  if(isOpen(device.id)||require('./olt-cli').isBusy(device.id)||require('./olt-zte-bridge').isBusy(device.id)||[...sessions.values()].some(session=>session.owner===owner&&session.state!=='closed'))fail('Sesi terminal OLT atau akun ini masih terbuka',409);
  if([...sessions.values()].filter(session=>session.state!=='closed').length>=MAX_SESSIONS)fail('Terminal sedang penuh. Coba kembali.',429);
  const attempt=attempts.get(owner)||{at:now(),count:0};if(now()-attempt.at>=60000){attempt.at=now();attempt.count=0;}if(++attempt.count>5)fail('Terlalu banyak percobaan terminal. Tunggu satu menit.',429);attempts.set(owner,attempt);while(attempts.size>64)attempts.delete(attempts.keys().next().value);
  const nativeMode=input.mode==='native';if(input.mode!==undefined&&!['native','legacy'].includes(input.mode))fail('Mode terminal tidak valid');const size=nativeMode?require('./olt-terminal-native').dimensions(input.cols,input.rows):{cols:100,rows:30};
  const[, ,transport]=await require('./olt-vendors').loadLibrary();
  if(isOpen(device.id)||require('./olt-cli').isBusy(device.id)||require('./olt-zte-bridge').isBusy(device.id)||[...sessions.values()].some(session=>session.owner===owner&&session.state!=='closed'))fail('Sesi terminal OLT atau akun ini masih terbuka',409);
  if([...sessions.values()].filter(session=>session.state!=='closed').length>=MAX_SESSIONS)fail('Terminal sedang penuh. Coba kembali.',429);
  // Acquire before decrypt/connect; automated commands share this device lock.
  if(!transport.claimOlt(device.id))fail('Akses OLT sedang digunakan. Coba kembali.',409);
  let session;try{
   const password=secrets.decryptSecret(data,device.cliPasswordEnc);session={id:crypto.randomUUID(),owner,deviceId:device.id,signature:signature(device),nativeMode,state:'connecting',createdAt:now(),lastInput:now(),lastSend:0,sequence:0,revision:0,buffer:'',offset:0,base:0,bytes:0,authBuffer:'',stage:'login',passwordCount:0,release:()=>transport.releaseOlt(device.id)};sessions.set(session.id,session);
   const wire=value=>{try{session.write(value);}catch{close(session,'Sesi OLT terputus');}};
   const readyPrompt=text=>/(?:^|\n)(?:[^\r\n<>]{1,100}[>#]|<[A-Za-z0-9_.:/()@ -]{1,100}>|\[[^\r\n]{1,100}\])\s*$/.test(text);
   const handlers={password,native:nativeMode,...size,ready(write,authenticated,resize,eol){session.write=write;session.resize=resize;session.eol=eol||'\r\n';session.stage=authenticated?'prompt':'login';},end(message){close(session,message||'Koneksi OLT ditutup');},data(chunk){
    if(session.state==='closed')return;session.bytes+=Buffer.byteLength(chunk);if(session.bytes>OUTPUT_LIMIT){close(session,'Batas output terminal tercapai');return;}
    const text=clean(chunk);
    if(session.state==='ready'){
     if(nativeMode){void session.engine.feed(String(chunk));return;}
     if(session.resync){session.resyncTail=((session.resyncTail||'')+text).slice(-8192);append(session,text);if(readyPrompt(session.resyncTail)&&session.resyncTail.trimEnd().split('\n').at(-1)===session.promptText){const queued=session.resync;session.resync=null;session.remoteDraft=false;clearTimeout(session.resyncTimer);session.promptTail='';if(queued.completion){session.completionPending=true;queued.completion();}else if(queued.control){session.location=null;session.pendingCommand=null;if(queued.control!=='\x03')wire(queued.control);}else{session.pendingCommand=queued.command;wire(queued.value+'\r\n');}}return;}
     if(session.completionPending){session.completionTail=(session.completionTail+text).slice(-8192);append(session,text);clearTimeout(session.completionTimer);session.completionTimer=setTimeout(()=>{if(session.state!=='ready')return;const tail=session.completionTail.slice(session.completionTail.lastIndexOf(session.promptText)+session.promptText.length),candidate=tail.replace(/\x07/g,'');if(candidate===session.completionPrefix&&!session.completionHelp){session.completionHelp=true;session.completionTimer=setTimeout(()=>close(session,'Bantuan CLI belum merespons. Hubungkan ulang.'),5000);session.completionTimer.unref?.();wire('?');return;}session.completionPending=false;session.completion={sequence:(session.completion?.sequence||0)+1,line:/^[\x20-\x7e]{0,1024}$/.test(candidate)&&!candidate.includes('\n')?candidate:session.completionPrefix};},350);session.completionTimer.unref?.();return;}
     if(session.passwordInput){session.authBuffer=(session.authBuffer+text).slice(-8192);if(readyPrompt(session.authBuffer)){session.passwordInput=false;session.secretReplyExpected=false;session.pendingCommand=null;session.location=null;session.promptText=session.authBuffer.trimEnd().split('\n').at(-1).slice(-100);append(session,session.promptText);session.authBuffer='';}return;}
     session.promptTail=((session.promptTail||'')+text).slice(-16384);
     if(session.pendingCommand?.line.toLowerCase()==='enable'&&/(?:^|\n)\s*(?:access\s*)?password\s*:\s*$/i.test(session.promptTail)){session.passwordInput=true;session.secretReplyExpected=true;session.authBuffer='';}
     session.confirmReplyExpected=/(?:are you sure|confirm|continue).*?(?:\[y\/n\]|\(y\/n\)|yes\/no)\s*:?\s*$/i.test(session.promptTail);
     if(readyPrompt(session.promptTail)){
      if(session.pendingCommand?.navigation){const failed=/(?:^|\n)\s*(?:%\s*)?(?:error|failure|failed|unknown command|unrecognized command|command incomplete|invalid command|syntax error|expected|%?Code\s+\d+)/i.test(session.promptTail);session.location=failed?null:session.pendingCommand.location||null;}
      session.promptText=session.promptTail.trimEnd().split('\n').at(-1).slice(-100);session.pendingCommand=null;session.confirmReplyExpected=false;session.promptTail='';
     }
     append(session,text.replaceAll(password,'[disembunyikan]'));return;
    }
    session.authBuffer+=text;if(session.authBuffer.length>16384){close(session,'Respons login OLT terlalu panjang');return;}
    if(transport.loginDenied(session.authBuffer)){close(session,'Login CLI OLT ditolak');return;}
    if(session.stage==='login'&&/(?:login|user\s*name|username)\s*:\s*$/i.test(session.authBuffer)){wire(device.cliUsername+session.eol);session.stage='password';session.authBuffer='';return;}
    if(/password\s*:\s*$/i.test(session.authBuffer)){if(++session.passwordCount>2){close(session,'Login CLI OLT ditolak');return;}wire(password+session.eol);session.stage='prompt';session.authBuffer='';return;}
    if(session.stage==='prompt'&&readyPrompt(session.authBuffer)){session.state='ready';clearTimeout(session.loginTimer);session.promptText=session.authBuffer.trimEnd().split('\n').at(-1).replaceAll(password,'[disembunyikan]').slice(-100);if(nativeMode)session.engine=require('./olt-terminal-native').create({device,prompt:session.promptText,...size,write:value=>write(session,value),resize:session.resize,eol:session.eol,append:value=>append(session,value),changed:()=>wake(session),terminate:message=>close(session,message)});else append(session,session.promptText);session.authBuffer='';}
   }};
   session.loginTimer=setTimeout(()=>close(session,'Batas waktu login OLT tercapai'),12000);session.loginTimer.unref?.();
   const dispose=await open(device,handlers);session.dispose=dispose;if(session.state==='closed')dispose?.();
   if(!sweeper){sweeper=setInterval(sweep,10000);sweeper.unref?.();}
   return{id:session.id,state:session.state,mode:nativeMode?'native':'legacy',idleSeconds:IDLE_MS/1000};
  }catch(error){if(session)close(session,'Koneksi terminal gagal');else transport.releaseOlt(device.id);throw error;}
 }
 function read(owner,device,id,since=0){const session=find(owner,device,id);if(!Number.isSafeInteger(since)||since<0||since>session.offset)fail('Posisi output terminal tidak valid');return{state:session.state,revision:session.revision,sequence:session.sequence,output:session.buffer.slice(Math.max(0,since-session.base)),offset:session.offset,reset:since<session.base,passwordInput:Boolean(session.passwordInput),confirmationInput:Boolean(session.confirmReplyExpected),commandPending:Boolean(session.pendingCommand||session.completionPending||session.resync),...(session.completion?{completion:session.completion}:{}),prompt:session.passwordInput?'Password:':session.confirmReplyExpected?(session.promptTail||'').trimEnd().split('\n').at(-1).slice(-100):session.promptText||'',...(session.nativeMode?session.engine?.status()||{mode:'native'}:{}),idleUntil:session.lastInput+IDLE_MS};}
 async function waitRead(owner,device,id,since,revision,signal){
  const session=find(owner,device,id);read(owner,device,id,since);if(session.state==='closed'||session.offset!==since||session.revision!==revision)return read(owner,device,id,since);if(session.waiter)fail('Pembacaan terminal masih berjalan',409);
  await new Promise(resolve=>{const timer=setTimeout(done,2500);function done(){clearTimeout(timer);clearTimeout(session.wakeTimer);session.wakeTimer=null;session.waiter=null;signal?.removeEventListener('abort',done);resolve();}session.waiter=done;if(signal?.aborted)done();else signal?.addEventListener('abort',done,{once:true});});return read(owner,device,id,since);
 }
 async function nativeInput(session,payload,access){
  if(!['keys','resize'].includes(payload.kind))fail('Gunakan tombol terminal interaktif; hubungkan ulang jika halaman lama masih terbuka.',409);
  if(session.inputBusy)fail('Input terminal sebelumnya masih berjalan',409);
  if(!Number.isSafeInteger(payload.sequence)||payload.sequence<1)fail('Urutan input terminal tidak valid',400);
  const hash=crypto.createHash('sha256').update(JSON.stringify([payload.kind,payload.value,payload.cols,payload.rows])).digest('hex');
  if(payload.sequence===session.sequence&&hash===session.lastNativeHash){if(session.lastNativeError)throw Object.assign(Error(session.lastNativeError.message),session.lastNativeError);return session.lastNativeReply;}
  if(payload.sequence!==session.sequence+1)fail('Urutan input terminal berubah. Hubungkan ulang.',409);
  const at=now();if(!session.rate||at-session.rate.at>=1000)session.rate={at,count:0};if(++session.rate.count>60)fail('Tombol terminal terlalu cepat',429);
  session.inputBusy=true;session.lastInput=at;
  try{const result=payload.kind==='resize'?session.engine.resize(payload.cols,payload.rows):await session.engine.input(payload.value,access.permissions||[]);session.lastNativeReply={...result,...session.engine.status(),sequence:payload.sequence};session.lastNativeError=null;return session.lastNativeReply;}
  catch(error){session.lastNativeError={message:error.message,status:error.status||400,sequence:payload.sequence};throw Object.assign(error,{sequence:payload.sequence});}
  finally{session.sequence=payload.sequence;session.lastNativeHash=hash;session.inputBusy=false;wake(session);}
 }
 function input(owner,device,id,payload={},access={}){
  const session=find(owner,device,id);if(session.state!=='ready')fail('Terminal belum terhubung atau sudah ditutup',409);if(session.nativeMode)return nativeInput(session,payload,access);if(now()-session.lastSend<120)fail('Perintah terlalu cepat. Tunggu sebentar.',429);
  if(session.completionPending||session.resync)fail('Bantuan atau sinkronisasi prompt masih berjalan',409);
  const controls={interrupt:'\x03',more:' ',enter:'\r\n',suspend:'\x1a',escape:'\x1b'};let value;
  if(payload.kind==='completion'){
   if(session.pendingCommand||session.passwordInput||session.confirmReplyExpected)fail('Tunggu prompt sebelum melengkapi perintah',409);
   if(typeof payload.value!=='string'||payload.value.length>1024||/[^\x20-\x7e]|[;|&`$<>\\]/.test(payload.value))fail('Awalan bantuan CLI tidak valid');
   const repeat=session.remoteDraft&&payload.value===session.completion?.line;
   session.completionPrefix=payload.value;session.completionTail=session.promptText+(repeat?payload.value:'');session.completionHelp=false;session.completionPending=true;session.lastSend=now();session.lastInput=now();
   const query=()=>{session.remoteDraft=true;session.completionTimer=setTimeout(()=>close(session,'Bantuan CLI belum merespons. Hubungkan ulang.'),5000);session.completionTimer.unref?.();write(session,(repeat?'':payload.value)+'\t');};
   if(session.remoteDraft&&!repeat){session.completionPending=false;session.resync={completion:query};session.resyncTail='';session.resyncTimer=setTimeout(()=>close(session,'Prompt belum terverifikasi setelah bantuan CLI'),3000);session.resyncTimer.unref?.();write(session,'\x03');}else query();return{ok:true};
  }
  if(payload.kind==='line'){
   if(typeof payload.value!=='string'||Buffer.byteLength(payload.value)>1024||/[\x00-\x1f\x7f]/.test(payload.value))fail('Masukkan satu baris perintah, maksimal 1.024 byte');
   if(session.passwordInput&&session.secretReplyExpected)session.secretReplyExpected=false;
   else if(session.confirmReplyExpected&&/^(?:y|yes|n|no)$/i.test(payload.value.trim()))session.confirmReplyExpected=false;
   else{if(session.pendingCommand)fail('Perintah sebelumnya belum selesai. Gunakan More, Enter atau Ctrl+C pada prompt perangkat.',409);const command=policy.classify(device,session.location,payload.value);if(command.permission&&!access.permissions?.includes(command.permission))fail('Tidak memiliki izin mengatur PON. Hanya Admin, Sekretaris dan Kepala Teknisi.',403);if(command.kind==='delete-onu')return{ok:true,action:'preview-delete-onu',target:command.target};session.pendingCommand=command;}
   if(session.remoteDraft){const command=session.pendingCommand;session.pendingCommand=null;session.resync={value:payload.value,command};session.resyncTail='';session.resyncTimer=setTimeout(()=>close(session,'Prompt belum terverifikasi setelah bantuan CLI'),3000);session.resyncTimer.unref?.();session.lastSend=now();session.lastInput=now();write(session,'\x03');return{ok:true};}
   value=payload.value+'\r\n';
  }
  else{if(!Object.hasOwn(controls,payload.kind))fail('Input terminal tidak valid');if(session.remoteDraft){if(['enter','more'].includes(payload.kind))fail('Kirim perintah lengkap melalui Enter pada prompt; draft bantuan tidak dijalankan langsung',409);session.resync={control:controls[payload.kind]};session.resyncTail='';session.resyncTimer=setTimeout(()=>close(session,'Prompt belum terverifikasi setelah bantuan CLI'),3000);session.resyncTimer.unref?.();session.lastSend=now();session.lastInput=now();write(session,'\x03');return{ok:true};}value=controls[payload.kind];}
  session.lastSend=now();session.lastInput=now();session.promptTail='';if(['interrupt','suspend'].includes(payload.kind)){session.pendingCommand=null;session.location=null;session.passwordInput=false;session.secretReplyExpected=false;session.confirmReplyExpected=false;}if(payload.kind==='escape')session.location=null;try{session.write(value);}catch{close(session,'Sesi OLT terputus');fail('Sesi OLT terputus',409);}return{ok:true};
 }
 function stop(owner,device,id){close(find(owner,device,id));return{ok:true};}
 function closeOwner(owner){for(const session of sessions.values())if(session.owner===owner)close(session,'Sesi aplikasi ditutup');}
 function shutdown(){for(const session of sessions.values())close(session);sessions.clear();clearInterval(sweeper);sweeper=null;}
 return{start,read,waitRead,input,stop,isOpen,closeOwner,shutdown};
}
async function deletionTarget(data,device,target,options={}){
 const olt=require('./olt-monitor'),snapshot=await(options.snapshot||olt.snapshotFor)(device),checked=Date.parse(snapshot?.checkedAt||'');
 if(!snapshot||snapshot.status!=='online'||snapshot.stale||snapshot.inventoryAvailable===false||!Number.isFinite(checked)||Date.now()-checked>olt.CACHE_MS*2)fail('Daftar ONU belum mutakhir. Tutup terminal lalu segarkan OLT sebelum menghapus.',409);
 const matches=(snapshot.onus||[]).filter(row=>row.ponKey===target.ponKey&&Number(row.onuId)===target.onuId);
 if(matches.length!==1||matches[0].identityAmbiguous||!olt.normalizeSerial(matches[0].serialNumber))fail('Target/SN ONU belum pasti. Periksa daftar ONU sebelum menghapus.',409);
 const row=matches[0];return{id:String(row.id),serialNumber:row.serialNumber,ponKey:row.ponKey,onuId:row.onuId,name:row.name||'',oltId:device.id,oltName:device.name};
}
module.exports={...createManager(),createManager,deletionTarget,IDLE_MS,LIFE_MS,BUFFER_LIMIT,MAX_SESSIONS};
