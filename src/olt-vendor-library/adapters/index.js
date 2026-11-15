import { BdcomAdapter } from './bdcom.adapter.js';
import { BaseOltAdapter } from './base.adapter.js';
import { BtponAdapter } from './btpon.adapter.js';
import { CdataAdapter } from './cdata.adapter.js';
import { FiberhomeAdapter } from './fiberhome.adapter.js';
import { HiosoAdapter } from './hioso.adapter.js';
import { HsgqAdapter } from './hsgq.adapter.js';
import { HuaweiAdapter } from './huawei.adapter.js';
import { TarmocAdapter } from './tarmoc.adapter.js';
import { VsolAdapter } from './vsol.adapter.js';
import { ZteAdapter } from './zte.adapter.js';
import { normalizeVendorKey } from './vendor-normalization.js';

const adapters = {
  tarmoc: TarmocAdapter,
  huawei: HuaweiAdapter,
  zte: ZteAdapter,
  fiberhome: FiberhomeAdapter,
  bdcom: BdcomAdapter,
  baudcom: BdcomAdapter,
  btpon: BtponAdapter,
  vsol: VsolAdapter,
  'v-sol': VsolAdapter,
  'c-data': CdataAdapter,
  cdata: CdataAdapter,
  hsgq: HsgqAdapter,
  hioso: HiosoAdapter,
};

export function createOltAdapter(olt) {
  const Adapter = adapters[normalizeVendorKey(olt.vendor)] || BaseOltAdapter;
  const adapter=new Adapter(olt);
  const locked=async()=>{const error=new Error('Aksi tulis library vendor belum terverifikasi dan tetap terkunci');error.status=501;throw error;};
  for(const method of ['registerOnu','applyProvisioningProfile','rebootOnu','deleteOnuFromOlt','updateOnuDescription','saveConfig','ensureTr069Wan','applyTr069Wan','loadOntConfigFromTftp','applyCdataIpHostWan','applyOnuStaticIp'])adapter[method]=locked;
  for(const method of ['supportsOnuReboot','supportsOnuDelete','supportsOnuDescriptionUpdate','supportsOntConfigLoad','supportsTr069Wan','supportsCdataIpHostWan','supportsOnuStaticIp'])adapter[method]=()=>false;
  return adapter;
}
