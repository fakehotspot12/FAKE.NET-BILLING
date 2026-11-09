const rows = declare("VirtualParameters.pppoeUsername", { path: 1, value: 1 });
commit();
const value = rows.size && rows.value && rows.value[0] ? rows.value[0] : "";

return { writable: false, value: [value, "xsd:string"] };
