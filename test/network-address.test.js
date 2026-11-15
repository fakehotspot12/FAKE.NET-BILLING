'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{addressFromTags}=require('../src/network-address');
const data={radiusNas:[{id:'nas',name:'Jalan NAS',address:'192.0.2.1'}],monitoringTargets:[]};
test('address tags need no Alamat prefix and never duplicate the template prefix',()=>{
 for(const value of ['Jl. Unit No 10','Alamat: Jl. Unit No 10','Alamat: Alamat: Jl. Unit No 10'])assert.equal(addressFromTags(data,{tags:[value]}),'Jl. Unit No 10');
});
test('NAS, account, model, unsafe tags and ambiguous addresses are not interpreted as a customer address',()=>{
 for(const modem of [{tags:['Jalan NAS','nas','192.0.2.1']},{tags:['Online','User Alpha']},{tags:['Jl. One','Jl. Two']},{tags:['<script>Jl. One</script>']},{tags:['Jl. Device'],productClass:'Jl. Device'},{tags:'Jl. Broken'},{}])assert.equal(addressFromTags(data,modem),'');
 assert.equal(addressFromTags(data,{tags:['Jl. One','Jl. Two']},'Jl. Two'),'Jl. Two');
});
