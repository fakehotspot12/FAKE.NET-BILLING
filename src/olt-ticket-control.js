'use strict';

function enabled(data) {
  const value=data.settings?.oltTicketing||{};
  if(Object.hasOwn(value,'enabled'))return value.enabled===true&&value.whatsappEnabled!==false&&value.automaticTicketsEnabled!==false;
  // Updating an installation must not turn a former WA-only setting into LOS tickets.
  return value.automaticTicketsEnabled===true&&value.whatsappEnabled===true;
}
module.exports={enabled};
