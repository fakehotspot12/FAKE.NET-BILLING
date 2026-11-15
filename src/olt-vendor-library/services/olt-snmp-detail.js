import { snmpGet, parseSnmpInteger } from './snmp.js';
export async function getOltSnmpDetail(olt){
  const prefix='.1.3.6.1.2.1.1',values=await snmpGet({olt,oids:[prefix+'.1.0',prefix+'.2.0',prefix+'.3.0',prefix+'.5.0']});
  const value=key=>values?.get(prefix+key)?.value?.replace(/^"|"$/g,'')||null;
  return {status:values?'ok':'unavailable',source:'snmp',sys_descr:value('.1.0'),sys_object_id:value('.2.0'),sys_name:value('.5.0'),uptime:{ticks:parseSnmpInteger(values?.get(prefix+'.3.0'))},updated_at:new Date().toISOString()};
}
