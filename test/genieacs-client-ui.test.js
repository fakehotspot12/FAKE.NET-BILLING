'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const code = source.slice(source.indexOf('function genieClientRows('), source.indexOf('async function refreshVisibleGenieClientCounts('));
function fixture() {
  const buttons = ['a', 'b', 'a'].map(id => ({ dataset: { genieClientId: id }, textContent: '...', setAttribute() {}, removeAttribute() {} }));
  const context = vm.createContext({
    displayNumber: value => String(value),
    genieWifiNetworks: row => row.wifiNetworks || [],
    app: { querySelectorAll: selector => selector === '[data-genie-client-id]' ? buttons : [] }
  });
  vm.runInContext(code, context);
  return { context, buttons };
}
test('GenieACS updates the total on desktop/mobile without a per-band subtitle', () => {
  const { context, buttons } = fixture();
  context.applyGenieClientCount({ id: 'a', total: 10, wifi24: 4, wifi5: 3, lan: 3, hasWifi5: true });
  for (const index of [0, 2]) {
    assert.equal(buttons[index].textContent, '10');
  }
  assert.equal(buttons[1].textContent, '...');
  assert.equal(source.includes('data-genie-client-breakdown='), false);
});
test('single-band client details omit impossible 5G rows', () => {
  const { context } = fixture();
  const rows = context.genieClientRows({hasWifi5:false,connectedClients:[{type:'2.4G'},{type:'5G'},{type:'LAN'}]});
  assert.equal(rows.length,2);
  assert.equal(rows.some(row=>row.type==='5G'),false);
});
test('client detail uses the same categorized clients as the table split', () => {
  const { context } = fixture();
  const counts = context.genieClientCounts({ hasWifi5: true, clientCountAccurate: true, clientsTotal: 99, connectedClients: [{ type: '2.4G' }, { type: '5G' }, { type: 'LAN' }] });
  assert.equal(counts.total, 3);
  assert.equal(counts.count24 + counts.count5 + counts.countLan, counts.total);
  assert.match(source, /wifi24: counts\.count24, wifi5: counts\.count5, lan: counts\.countLan/);
  assert.match(source, /counts\.hasWifi5 \? `<span>5G/);
});
test('unknown client data is not displayed as zero', () => {
  const {context,buttons}=fixture();
  context.applyGenieClientCount({id:'a',total:null,known:false,pending:false});
  assert.equal(buttons[0].textContent,'-');
  context.applyGenieClientCount({id:'a',total:null,known:false,pending:true});
  assert.equal(buttons[0].textContent,'...');
  context.applyGenieClientCount({id:'a',total:0,known:true,pending:false});
  assert.equal(buttons[0].textContent,'0');
});
