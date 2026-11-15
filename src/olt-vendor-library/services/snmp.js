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
async function read(olt,oids,walk,timeoutMs=3000,maxBuffer=524288){
  const context=request();if(olt.host!==context.device.host||Number(olt.snmp_port||161)!==Number(context.device.port||161)||!oids.length||oids.length>64||oids.some(oid=>!/^\.?\d+(?:\.\d+)+$/.test(oid)))throw new Error('Vendor SNMP request rejected');
  const target=olt.host.includes(':')?`udp6:[${olt.host}]:${olt.snmp_port||161}`:`${olt.host}:${olt.snmp_port||161}`;
  const timeout=Math.max(1,Math.min(timeoutMs,remaining(),5000)),args=['-v2c','-c',getSnmpReadCommunity(olt),'-On','-t',String(Math.max(1,Math.ceil(timeout/1000))),'-r','0',target,...oids];
  try{const{stdout}=await(context.transports.exec||execute)(walk?'snmpbulkwalk':'snmpget',args,{timeout,maxBuffer:Math.min(maxBuffer,524288),signal:context.controller.signal});return parseSnmpGetOutput(stdout);}catch(error){if(context.controller.signal.aborted)throw error;return null;}
}
export const snmpGet=({olt,oids=[],timeoutMs})=>read(olt,oids,false,timeoutMs);
export const snmpWalk=({olt,oid,timeoutMs,maxBuffer})=>read(olt,[oid],true,timeoutMs,maxBuffer);
