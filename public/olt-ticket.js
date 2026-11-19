// Compatibility for previously shared ticket assets.
(() => {
  const start=()=>{const script=document.createElement('script');script.src='/tkt.js?v=ticket-summary-20261119';document.head.append(script);};
  if(window.FakenetTicketContext){start();return;}
  const script=document.createElement('script');script.src='/ticket-context.js?v=ticket-summary-20261119';script.onload=start;
  script.onerror=()=>{const notice=document.getElementById('notice');if(notice)notice.textContent='Tampilan tiket belum dapat dimuat. Silakan muat ulang.';};document.head.append(script);
})();
