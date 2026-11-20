'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const work=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'fakenet-acs-integration-'));
const dist=path.join(work,'runtime/node_modules/genieacs');
const name='fakenet-installer-acs-test-'+process.pid,children=[],logs=[],requests=[];
const run=(cmd,args,timeout=30000)=>cp.execFileSync(cmd,args,{encoding:'utf8',timeout,maxBuffer:2000000}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
let started=false;
async function port(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
async function ready(url){for(let i=0;i<100;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}await sleep(300);}throw Error('Test service not ready: '+url);}
function spawn(service,env){const child=cp.spawn(process.execPath,[path.join(dist,'bin/genieacs-'+service)],{env,detached:true,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',value=>{logs.push(value.toString());if(logs.length>100)logs.shift();});child.stderr.on('data',value=>{logs.push(value.toString());if(logs.length>100)logs.shift();});return child;}
(async()=>{
 try{
  run('npm',['install','--prefix',path.join(work,'runtime'),'--omit=dev','--no-audit','--no-fund','--fetch-retries=2','--fetch-timeout=60000','genieacs@1.2.16'],300000);
  run('docker',['run','-d','--rm','--name',name,'--memory=512m','--cpus=1','-p','127.0.0.1::27017','mongo:7','--bind_ip_all','--wiredTigerCacheSizeGB','0.25','--quiet','--setParameter','diagnosticDataCollectionEnabled=false']);started=true;
  const mongoPort=Number(run('docker',['port',name,'27017/tcp']).split(':').at(-1)),ui=await port(),nbi=await port();
  const env={PATH:process.env.PATH,HOME:'/tmp',TZ:'UTC',GENIEACS_MONGODB_CONNECTION_URL:'mongodb://127.0.0.1:'+mongoPort+'/installer_check',GENIEACS_UI_PORT:String(ui),GENIEACS_NBI_PORT:String(nbi),GENIEACS_UI_INTERFACE:'127.0.0.1',GENIEACS_NBI_INTERFACE:'127.0.0.1',GENIEACS_UI_WORKER_PROCESSES:'1',GENIEACS_NBI_WORKER_PROCESSES:'1',GENIEACS_UI_JWT_SECRET:crypto.randomBytes(32).toString('hex')};
  spawn('nbi',env);spawn('ui',env);
  await ready('http://127.0.0.1:'+nbi+'/devices/?limit=1');await ready('http://127.0.0.1:'+ui+'/status');
  const bootEnv={...env,APP_ADMIN_USERNAME:'admin',APP_ADMIN_PASSWORD:crypto.randomBytes(16).toString('hex'),GENIEACS_BOOTSTRAP_REQUEST_TIMEOUT_MS:'10000'};
  const bootPath=path.join(root,'deploy/genieacs/bootstrap.js'),requireSource=require('node:module').createRequire(bootPath);
  // Mongo/UI bundle patch helpers are disabled to prevent touching host services.
  const sandbox={module:{exports:{}},__dirname:path.dirname(bootPath),console,AbortController,setTimeout,clearTimeout,
   require:key=>key==='fs'?{...fs,existsSync:()=>false}:key==='child_process'?{spawnSync:()=>({status:1})}:requireSource(key),
   process:{env:bootEnv,stdout:{write:value=>logs.push(value)},stderr:{write:value=>logs.push(value)}},
   fetch:async(url,options={})=>{const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert([String(ui),String(nbi)].includes(parsed.port));requests.push({method:options.method||'GET',path:parsed.pathname});return fetch(url,options);}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(bootPath,'utf8'),sandbox);
  await sandbox.module.exports.main();
  const auth=await fetch('http://127.0.0.1:'+ui+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:bootEnv.APP_ADMIN_PASSWORD})});
  assert.equal(auth.status,200,'Configured ACS login failed');const token=(await auth.text()).replace(/^"|"$/g,'');
  async function config(){const r=await fetch('http://127.0.0.1:'+ui+'/api/config',{headers:{Cookie:'genieacs-ui-jwt='+encodeURIComponent(token)}});assert.equal(r.status,200);return(await r.json()).sort((a,b)=>a._id.localeCompare(b._id));}
  const configBefore=await config(),parameters=await(await fetch('http://127.0.0.1:'+nbi+'/virtualParameters')).json();
  const files=fs.readdirSync(path.join(root,'deploy/genieacs/virtual-parameters')).filter(file=>file.endsWith('.js'));assert.equal(files.length,26);
  for(const file of files){const row=parameters.find(row=>row._id===file.slice(0,-3));assert(row,file);assert.equal(row.script,fs.readFileSync(path.join(root,'deploy/genieacs/virtual-parameters',file),'utf8'));}
  assert(configBefore.some(row=>row._id.startsWith('ui.device.')&&row.value==='"Semua Parameter"'));
  await sandbox.module.exports.main();assert.equal(hash(JSON.stringify(await config())),hash(JSON.stringify(configBefore)),'Second bootstrap changed existing ACS UI');
  assert(!requests.some(row=>row.path.includes('/tasks')||row.path.includes('/devices/')&&row.method!=='GET'),'Unexpected CPE operation');
  console.log(JSON.stringify({root,genieacs:'1.2.16',actualMongo:true,configuredLoginVerified:true,virtualParameters:parameters.length,uiConfigEntries:configBefore.length,secondBootstrapPreservedUi:true,deviceWrites:0,hostMongoUiHelpersDisabled:true}));
 }catch(error){console.error(error.message);console.error(JSON.stringify({recentRequests:requests.slice(-12)}));console.error(logs.slice(-12).join('').slice(-6500));process.exitCode=1;}
 finally{for(const child of children){try{process.kill(-child.pid,'SIGTERM');}catch{}}
  await sleep(500);for(const child of children){try{process.kill(-child.pid,'SIGKILL');}catch{}}
  if(started){try{run('docker',['stop','-t','3',name]);}catch(error){console.error('Test container cleanup failed');process.exitCode=1;}}
  fs.rmSync(work,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
