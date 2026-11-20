import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request, remaining, decryptSecret } from './context.js';
const execute=promisify(execFile);
export function getSnmpReadCommunity(olt){return decryptSecret(olt.snmp_community_ro_encrypted);}
export function parseSnmpGetOutput(stdout=''){
  const values=new Map();for(const line of String(stdout).split('\n')){const match=line.match(/^(\S+)\s+=\s+([^:]+):\s*(.*?)\s*$/);if(match&&!/No Such|End of MIB/i.test(match[3]))values.set(match[1],{type:match[2].trim(),value:match[3].trim()});}return values;
}
export function parseSnmpInteger(entry){const match=String(entry?.value||'').match(/-?\d+/);return match?Number(match[0]):null;}
export function parseHexStringSerial(entry){const hex=String(entry?.value||'').replace(/\s/g,'');if(!/^[0-9a-f]{16}$/i.test(hex))return null;const bytes=Buffer.from(hex,'hex'),prefix=bytes.subarray(0,4).toString('ascii').toUpperCase();return /^[A-Z0-9]{4}$/.test(prefix)?prefix+bytes.subarray(4).toString('hex').toUpperCase():null;}
async function read(olt,oids,walk,timeoutMs=3000,maxBuffer=524288,maxRepetitions,udpTimeoutMs,maxAttempts=1){
  const context=request();if(olt.host!==context.device.host||Number(olt.snmp_port||161)!==Number(context.device.port||161)||!oids.length||oids.length>64||oids.some(oid=>!/^\.?\d+(?:\.\d+)+$/.test(oid)))throw new Error('Vendor SNMP request rejected');
  if(maxRepetitions!==undefined&&(!walk||!Number.isInteger(maxRepetitions)||maxRepetitions<1||maxRepetitions>50))throw new Error('Vendor SNMP bulk size rejected');
  if(udpTimeoutMs!==undefined&&(!Number.isInteger(udpTimeoutMs)||udpTimeoutMs<1000||udpTimeoutMs>5000)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw new Error('Vendor SNMP retry budget rejected');
  const target=olt.host.includes(':')?`udp6:[${olt.host}]:${olt.snmp_port||161}`:`${olt.host}:${olt.snmp_port||161}`;
  const timeout=Math.max(1,Math.min(timeoutMs,remaining(),5000)),args=['-v2c','-c',getSnmpReadCommunity(olt),'-On','-t',String(Math.max(1,Math.ceil(Math.min(udpTimeoutMs||timeout,timeout)/1000))),'-r','0',target,...oids];
  if(maxRepetitions!==undefined)args.unshift('-Cr'+maxRepetitions);
  // A fresh bounded process on retry also opens a fresh UDP socket. Keep the
  // packet timeout separate from the total walk budget on slow/public paths.
  for(let attempt=0;attempt<maxAttempts;attempt++){
    try{const{stdout}=await(context.transports.exec||execute)(walk?'snmpbulkwalk':'snmpget',args,{timeout:Math.min(timeout,remaining()),maxBuffer:Math.min(maxBuffer,524288),signal:context.controller.signal});return parseSnmpGetOutput(stdout);}
    catch(error){if(context.controller.signal.aborted)throw error;if(error.code!==1||! /Timeout: No Response/i.test(error.stderr||''))return null;}
  }
  return null;
}
export const snmpGet=({olt,oids=[],timeoutMs,udpTimeoutMs,maxAttempts})=>read(olt,oids,false,timeoutMs,undefined,undefined,udpTimeoutMs,maxAttempts);
export const snmpWalk=({olt,oid,timeoutMs,maxBuffer,maxRepetitions,udpTimeoutMs,maxAttempts})=>read(olt,[oid],true,timeoutMs,maxBuffer,maxRepetitions,udpTimeoutMs,maxAttempts);
