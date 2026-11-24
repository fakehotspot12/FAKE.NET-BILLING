'use strict';
const { Terminal } = require('@xterm/headless');
const policy = require('./olt-terminal-policy');

const EDITS = new Set(['\x7f','\b','\x1b[A','\x1b[B','\x1b[C','\x1b[D','\x1b[H','\x1b[F','\x1b[3~','\x01','\x05','\x0b','\x15','\x17']);
const CONTROLS = new Set(['\x03','\x1a','\x1b']);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function fail(message, status = 409) { throw Object.assign(Error(message), { status }); }
function dimensions(cols, rows) {
  if (!Number.isInteger(cols) || cols < 20 || cols > 400 || !Number.isInteger(rows) || rows < 4 || rows > 160) fail('Ukuran terminal tidak valid', 400);
  return { cols, rows };
}
const plain = value => String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\r\x00-\x08\x0b-\x1f\x7f]/g,'');
const promptFrom = value => /^(?:[^<>#\r\n]{1,100}[>#]|<[A-Za-z0-9_.:/()@ -]{1,100}>|\[[^\]\r\n]{1,100}\])$/.test(value) ? value : '';
function createOutputFilter(){
  let mode='',escaped=false;
  return value=>{let output='';for(const char of String(value)){
    if(mode==='escape'){if(']P_^X'.includes(char)){mode=char===']'?'osc':'string';escaped=false;}else{output+='\x1b'+char;mode='';}continue;}
    if(mode){if(char==='\x9c'||mode==='osc'&&char==='\x07'||escaped&&char==='\\'){mode='';escaped=false;}else escaped=char==='\x1b';continue;}
    if(char==='\x1b')mode='escape';else if(char==='\x9d')mode='osc';else if(['\x90','\x98','\x9e','\x9f'].includes(char))mode='string';else output+=char;
  }return output;};
}

function create({ device, prompt, cols = 100, rows = 30, write, append, terminate, resize, changed = () => {}, settleMs = 100, eol = '\r' }) {
  const size = dimensions(cols, rows), screen = new Terminal({ ...size, scrollback: 64, allowProposedApi: true });
  // Keep native cursor/colors, but do not forward clipboard/title/control strings from an OLT.
  const filterOutput=createOutputFilter();
  let parsed = Promise.resolve(), closed = false, lastOutput = 0, lastWrite = 0, outputSequence = 0;
  let currentPrompt = prompt, draft = '', caret = 0, location = null, pending = null;
  let secretExpected = false, secretSent = false, secret = '', confirmation = false, pager = false;
  let suppress = false, skipEcho = null, resync = null, assisting = false;
  const wire = value => { if (closed) fail('Sesi terminal sudah ditutup'); lastWrite = Date.now(); write(value); };
  function logicalLine() {
    const buffer = screen.buffer.active;
    let first = buffer.baseY + buffer.cursorY, last = first;
    while (first > 0 && buffer.getLine(first)?.isWrapped && last - first < 64) first--;
    while (last + 1 < buffer.length && buffer.getLine(last + 1)?.isWrapped && last - first < 64) last++;
    let text = '', position = 0;
    for (let row = first; row <= last; row++) {
      if (row === buffer.baseY + buffer.cursorY) position = text.length + buffer.cursorX;
      text += buffer.getLine(row)?.translateToString(row === last) || '';
      if (text.length > 2048) return null;
    }
    text = text.trimEnd();
    if(position>text.length&&position<=2048)text=text.padEnd(position,' ');
    return { text, position };
  }
  function visibleDraft() {
    const row = logicalLine();
    return row?.text.startsWith(currentPrompt) ? { value: row.text.slice(currentPrompt.length), caret: Math.max(0, row.position - currentPrompt.length) } : null;
  }
  function output(raw) {
    if (suppress) return;
    if (!skipEcho) { append(raw); return; }
    skipEcho.raw += raw;
    const at = skipEcho.raw.indexOf('\n');
    if (at < 0 && skipEcho.raw.length < 4096) return;
    const text = skipEcho.raw, line = at < 0 ? text : text.slice(0, at);
    const echoed = plain(line).trimEnd() === skipEcho.command.trimEnd();
    skipEcho = null;
    append(echoed ? text.slice(at + 1) : text);
  }
  function feed(raw) {
    if (closed) return parsed;
    raw=filterOutput(raw);if(!raw)return parsed;
    lastOutput = Date.now(); outputSequence++;
    parsed = parsed.then(() => new Promise(resolve => {
      if (closed) return resolve();
      screen.write(raw, () => {
        if (closed) return resolve();
        const text = logicalLine()?.text || '', candidate = promptFrom(text.trimEnd());
        if (resync && text === currentPrompt) { const done = resync; resync = null; done(); }
        if (secretExpected || secretSent) {
          if (candidate && secretSent) {
            currentPrompt = candidate; pending = null; secretExpected = false; secretSent = false; secret = ''; location = null;
            append('\r\n' + currentPrompt);
          }
          changed(); return resolve();
        }
        if (pending?.line.toLowerCase() === 'enable' && /^\s*(?:access\s*)?password\s*:\s*$/i.test(text)) secretExpected = true;
        confirmation = Boolean(pending && /(?:are you sure|confirm|continue).*?(?:\[y\/n\]|\(y\/n\)|yes\/no)\s*:?\s*$/i.test(text));
        pager = Boolean(pending && /--\s*More\s*--|More:\s*$|press ENTER to next line/i.test(text));
        if (pending) pending.output = ((pending.output || '') + plain(raw)).slice(-16384);
        if (pending && candidate && !suppress) {
          if (pending.navigation) location = /(?:^|\n)\s*(?:%\s*)?(?:error|failed|failure|unknown command|unrecognized command|command incomplete|invalid command|syntax error|expected|Code\s+\d+)/im.test(pending.output || '') ? null : pending.location || null;
          currentPrompt = candidate; pending = null; confirmation = false; pager = false; draft = ''; caret = 0;
        }
        output(raw); changed(); resolve();
      });
    })).catch(() => { if (!closed) terminate('Layar terminal belum dapat dibaca dengan aman.'); });
    return parsed;
  }
  const initial = feed(prompt);
  async function settle(after = 0, complete = () => true) {
    const deadline = Date.now() + 2500;
    do {
      await parsed;
      if (closed) fail('Sesi terminal sudah ditutup');
      if (complete() && Date.now() - Math.max(lastOutput,lastWrite) >= settleMs && (outputSequence > after || Date.now() + 300 >= deadline)) return;
      await pause(20);
    } while (Date.now() < deadline);
    fail('Respons terminal belum selesai. Coba kembali.');
  }
  async function cancelDraft() {
    suppress = true;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { resync = null; reject(Error('Prompt OLT belum terverifikasi')); }, 2500);
        resync = () => { clearTimeout(timer); resolve(); };
        wire('\x05'); wire('\x15');
      });
      await parsed;
    } catch {
      terminate('Prompt OLT belum terverifikasi; sesi ditutup sebelum menjalankan perintah.');
      fail('Prompt OLT belum terverifikasi. Hubungkan ulang.');
    } finally { suppress = false; }
  }
  function status() {
    return { mode: 'native', prompt: secretExpected ? 'Password:' : currentPrompt, commandPending: Boolean(pending || assisting || suppress), passwordInput: secretExpected, confirmationInput: confirmation, pagerInput: pager };
  }
  async function input(value,permissions=[]) {
    if (typeof value !== 'string' || value.length > 1024 || !value || (!/^[\x20-\x7e]+$/.test(value) && !EDITS.has(value) && !CONTROLS.has(value) && !['\r','\n','\t'].includes(value))) fail('Tombol atau tempelan terminal tidak valid', 400);
    await initial; if (closed) fail('Sesi terminal sudah ditutup');
    if (CONTROLS.has(value)) {
      const before = outputSequence; pending = null; secret = ''; secretExpected = false; secretSent = false; confirmation = false; pager = false; draft = ''; caret = 0; location = null;
      wire(value); await settle(before);
      const candidate = promptFrom(logicalLine()?.text.trimEnd() || ''); if (candidate) currentPrompt = candidate;
      changed(); return { ok: true };
    }
    if (secretExpected) {
      if (value === '\r' || value === '\n') { secretExpected = false; secretSent = true; const password = secret; secret = ''; wire(password + eol); changed(); return { ok: true }; }
      if (value === '\x7f' || value === '\b') secret = secret.slice(0, -1);
      else if (value === '\x15') secret = '';
      else if (/^[\x20-\x7e]+$/.test(value) && secret.length + value.length <= 1024) secret += value;
      else fail('Tombol password tidak didukung', 400);
      return { ok: true };
    }
    if (pending) {
      if (confirmation && /^(?:y|n|yes|no)$/i.test(value)) { wire(value); return { ok: true }; }
      if ((pager || confirmation) && [' ', '\r', '\n'].includes(value)) { pager=false;confirmation=false;wire(value === ' ' ? value : eol); return { ok: true }; }
      fail('Tunggu prompt atau gunakan Ctrl+C.', 409);
    }
    if (value === '\r' || value === '\n') {
      await settle(0, () => Boolean(visibleDraft()));
      const command = policy.classify(device, location, draft);
      policy.checkAccess(command,permissions);
      if (command.kind === 'delete-onu') return { ok: true, action: 'preview-delete-onu', target: command.target };
      const typed = draft, visible = visibleDraft();
      const nativeEnter = visible && visible.value.trimEnd() === typed.trimEnd();
      // A verified native line needs only Enter. Ctrl+C can exit configuration
      // mode; a clipped line is cleared with Ctrl+U without changing context.
      if (!nativeEnter) await cancelDraft();
      if (closed) fail('Sesi terminal sudah ditutup');
      if (!nativeEnter) append('\r\n');
      pending = { ...command, output: '' }; draft = ''; caret = 0;
      skipEcho = nativeEnter ? null : { command: typed, raw: '' };
      wire(nativeEnter ? eol : typed + eol); changed(); return { ok: true };
    }
    if (value === '\t' || value === '?' || value === '\x1b[A' || value === '\x1b[B' || value === '\x15' || value === '\x17') {
      const before = outputSequence; assisting = true; changed();
      try { wire(value); await settle(before,()=>Boolean(visibleDraft())); const visible = visibleDraft(); if (!visible || visible.value.length > 1024) fail('Baris CLI belum terbaca lengkap. Gunakan Ctrl+C untuk mengulang.'); draft = visible.value; caret = Math.min(draft.length, visible.caret); }
      finally { assisting = false; changed(); }
      return { ok: true };
    }
    if (EDITS.has(value)) {
      if (value === '\x7f' || value === '\b') { if (caret) { draft = draft.slice(0, caret - 1) + draft.slice(caret); caret--; } }
      else if (value === '\x1b[3~') draft = draft.slice(0, caret) + draft.slice(caret + 1);
      else if (value === '\x1b[D') caret = Math.max(0, caret - 1);
      else if (value === '\x1b[C') caret = Math.min(draft.length, caret + 1);
      else if (value === '\x01' || value === '\x1b[H') caret = 0;
      else if (value === '\x05' || value === '\x1b[F') caret = draft.length;
      else if (value === '\x0b') draft = draft.slice(0, caret);
      wire(value); return { ok: true };
    }
    const pieces = value.split('?');
    for (let index = 0; index < pieces.length; index++) {
      if (pieces[index]) { if (draft.length + pieces[index].length > 1024) fail('Perintah maksimal 1.024 karakter', 400); draft = draft.slice(0, caret) + pieces[index] + draft.slice(caret); caret += pieces[index].length; wire(pieces[index]); }
      if (index < pieces.length - 1) await input('?');
    }
    return { ok: true };
  }
  function setSize(cols, rows) { const next = dimensions(cols, rows); screen.resize(next.cols, next.rows); resize?.(next.cols, next.rows); changed(); return { ok: true }; }
  function reportError(error){
    if(closed)return;
    const message=String(error.message||'Perintah ditolak').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,500),visible=visibleDraft(),line=visible?.value??draft,position=visible?.caret??caret;
    append('\r\n\x1b[31m% Billing: '+message+'\x1b[0m\r\n'+currentPrompt+line+(position<line.length?'\x1b['+(line.length-position)+'D':''));changed();
  }
  function dispose() { if (closed) return; closed = true; secret = ''; draft = ''; pending = null; resync?.(); resync = null; screen.dispose(); }
  return { feed, input, status, resize: setSize, dispose,reportError };
}
module.exports = { create, dimensions,createOutputFilter };
