'use strict';

function create({load,tick,enabled,onError=()=>{},intervalMs=20000,minimumMs=2000,debounceMs=200,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}){
 const pending=new Set(),last=new Map(),blocked=new Map();let timer=null,periodic=null,running=false,stopped=true,bursts=new Map();
 function arm(delay=debounceMs){if(stopped||running||timer)return;timer=setTimer(()=>{timer=null;void run();},delay);timer.unref?.();}
 function wake(id){if(stopped||typeof id!=='string'||!id||id.length>100||pending.size>=64&&!pending.has(id))return false;pending.add(id);arm();return true;}
 async function run(){
  if(stopped||running)return;running=true;let again=false,delay=minimumMs;
  try{
   const data=await load();if(stopped)return;if(!enabled(data)){stop();return;}
   const id=[...pending].find(value=>now()-(last.get(value)||0)>=minimumMs);
   if(id){pending.delete(id);last.set(id,now());while(last.size>128)last.delete(last.keys().next().value);}
   else if(pending.size){again=true;return;}
   const result=await tick(data,id?{wakeDeviceId:id}:{});
   if(id&&result?.waiting){const attempts=(blocked.get(id)||0)+1;blocked.set(id,attempts);while(blocked.size>64)blocked.delete(blocked.keys().next().value);if(attempts<=4){pending.add(id);delay=Math.min(minimumMs*2**(attempts-1),8000);}}else if(id)blocked.delete(id);
   if(result?.processed&&result.deviceId&&result.more){
    const old=bursts.get(result.deviceId),count=old&&now()-old.at<120000?old.count+1:1;bursts.set(result.deviceId,{count,at:now()});while(bursts.size>64)bursts.delete(bursts.keys().next().value);
    if(count<8)pending.add(result.deviceId);else bursts.delete(result.deviceId);
   }
  }catch(error){onError(error);}finally{running=false;if(!stopped&&(again||pending.size))arm(delay);}
 }
 function repeat(){if(stopped)return;periodic=setTimer(()=>{periodic=null;arm(0);repeat();},intervalMs);periodic.unref?.();}
 function start(){if(!stopped)return;stopped=false;repeat();arm(0);}
 function stop(){stopped=true;if(timer)clearTimer(timer);if(periodic)clearTimer(periodic);timer=null;periodic=null;pending.clear();bursts.clear();last.clear();blocked.clear();}
 return{start,stop,wake,isRunning:()=>!stopped,status:()=>({active:!stopped,running,pending:pending.size})};
}
module.exports={create};
