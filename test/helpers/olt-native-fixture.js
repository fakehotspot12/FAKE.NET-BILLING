'use strict';
const terminal=require('../../src/olt-terminal'),secrets=require('../../src/secure-secrets');
let count=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(options={}){
 const data={settings:{}},device={id:'native-fixture-'+(++count),name:'Unit',vendor:'zte',host:'192.0.2.90',cliPort:23,cliProtocol:'telnet',cliUsername:'unit',enabled:true,cliEnabled:true,updatedAt:'unit'};
 device.cliPasswordEnc=secrets.encryptSecret(data,'unit-private');const writes=[],executed=[],sizes=[],timers=new Set(),history=[...(options.history||[])];let line='',caret=0,stage='login',handlers,closed=false,sequence=0,prompt='OLT#';
 const emit=(text,delay=0)=>{const timer=setTimeout(()=>{timers.delete(timer);if(!closed)handlers.data(text);},delay);timers.add(timer);};
 const redraw=()=>emit('\r\x1b[2K'+prompt+line+(line.length>caret?'\x1b['+(line.length-caret)+'D':''));
 function write(value){writes.push(value);
  if(stage==='login'){stage='password';emit('Password:');return;}
  if(stage==='password'){stage='active';emit('OLT#');return;}
  if(stage==='enable-password'){if(/[\r\n]$/.test(value)){stage='active';emit(value+'\r\nOLT#');}return;}
  if(value==='\x03'||value==='\x1a'){line='';caret=0;stage='active';if(options.ctrlExitsConfig)prompt='OLT#';emit('\r\n'+prompt);return;}
  if(stage==='paging'){if([' ','\r','\r\n'].includes(value)){stage='active';emit('\r\nSecond page\r\nOLT#');}return;}
  if(value==='\x1b[A'||value==='\x1b[B'){line=value==='\x1b[A'?(history.at(-1)||''):'';caret=line.length;redraw();return;}
  if(value==='\t'){if(line==='show ver')line='show version-running ';caret=line.length;redraw();return;}
  if(value==='?'){emit('?\r\n');emit('  state       Show ONU state\r\n  version-running Read version\r\n'+prompt+line,options.helpDelay??30);return;}
  if(value==='\x7f'||value==='\b'){if(caret){line=line.slice(0,caret-1)+line.slice(caret);caret--;}redraw();return;}
  if(value==='\x1b[3~'){line=line.slice(0,caret)+line.slice(caret+1);redraw();return;}
  if(value==='\x1b[D'){caret=Math.max(0,caret-1);redraw();return;}
  if(value==='\x1b[C'){caret=Math.min(line.length,caret+1);redraw();return;}
  if(value==='\x15'){line='';caret=0;redraw();return;}
  if(value==='\x01'||value==='\x1b[H'){caret=0;redraw();return;}
  if(value==='\x05'||value==='\x1b[F'){caret=line.length;redraw();return;}
  if(value==='\x0b'){line=line.slice(0,caret);redraw();return;}
  if(value==='\x1b'){emit('\x07');return;}
  for(const char of value){
   if(char==='\r'||char==='\n'){
    const command=line;line='';caret=0;executed.push(command);if(command)history.push(command);emit('\r\n');
    if(command==='enable'){stage='enable-password';emit('Password:');}
    else if(command.startsWith('show ')&&options.emptyPasswordField){emit('Password:');emit('                \r\nUnit detail\r\n'+prompt,20);}
    else if(command==='show paging'){stage='paging';emit('First page\r\n--More--');}
    else {
     if(options.ctrlExitsConfig&&command==='configure terminal')prompt='OLT(config)#';
     const failed=command.startsWith('interface ')?options.navigationError:'';
     emit((failed?failed+'\r\n':command.startsWith('show ')?'Unit Version 1.0\r\n<script>window.hacked=true</script>\r\n':'')+prompt);
    }
   }else{line=line.slice(0,caret)+char+line.slice(caret);caret++;emit(char,options.echoDelay||0);}
  }
 }
 const manager=terminal.createManager({open:async(_,callbacks)=>{handlers=callbacks;handlers.ready(write,false,(cols,rows)=>sizes.push([cols,rows]),'\r');emit('Username:');return()=>{closed=true;for(const timer of timers)clearTimeout(timer);};}}),owner='unit-owner';
 const started=await manager.start(data,device,owner,{confirm:true,revision:device.updatedAt,mode:'native',cols:80,rows:24});
 const read=(since=0)=>manager.read(owner,device,started.id,since);
 async function wait(check){for(let i=0;i<150;i++){const value=read();if(value.state==='closed')throw Error(value.output);if(check(value))return value;await sleep(10);}throw Error('Fixture wait timeout');}
 await wait(value=>value.state==='ready'&&value.output.includes('OLT#'));
 const key=(value,seq=++sequence,access={permissions:['olt:pon:manage']})=>manager.input(owner,device,started.id,{kind:'keys',value,sequence:seq},access);
 return{data,device,manager,owner,id:started.id,writes,executed,sizes,read,wait,key,sleep,stop:()=>manager.shutdown()};
}
module.exports={fixture,sleep};
