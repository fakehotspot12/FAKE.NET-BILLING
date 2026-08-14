const rows = declare("VirtualParameters.pppoeUsername", {});
const value = rows.size && rows.value && rows.value[0] ? rows.value[0] : "";

return { writable: false, value: [value, "xsd:string"] };
