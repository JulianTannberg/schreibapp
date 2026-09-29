(() => {
  'use strict';

  const DB_NAME = 'nessa_writer_db';
  const DB_VERSION = 1;
  const PROJECT_KEY = 'current';
  const MAX_SNAPSHOTS = 20;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    empty: $('#emptyState'), chapterView: $('#chapterView'), chapterTitle: $('#chapterTitle'), chapterBody: $('#chapterBody'),
    bookTitle: $('#bookTitle'), saveState: $('#saveState'), chapterCounter: $('#chapterCounter'),
    menuBtn: $('#menuBtn'), drawerBtn: $('#drawerBtn'), closeDrawerBtn: $('#closeDrawerBtn'), drawer: $('#drawer'), backdrop: $('#drawerBackdrop'),
    editBtn: $('#editBtn'), modeBtn: $('#modeBtn'), prevBtn: $('#prevBtn'), nextBtn: $('#nextBtn'),
    chapterList: $('#chapterList'), chapterSearch: $('#chapterSearch'), followupList: $('#followupList'), snapshotList: $('#snapshotList'),
    fontSize: $('#fontSize'), showChanges: $('#showChanges'), filePicker: $('#filePicker'), toast: $('#toast'),
    masterStatusIcon: $('#masterStatusIcon'), masterStatusText: $('#masterStatusText'),
    libraryStatusIcon: $('#libraryStatusIcon'), libraryStatusText: $('#libraryStatusText'),
    revisionsStatusIcon: $('#revisionsStatusIcon'), revisionsStatusText: $('#revisionsStatusText'),
    docEditor: $('#docEditor'), docEditorTitle: $('#docEditorTitle'), docEditorState: $('#docEditorState'), docEditorText: $('#docEditorText'),
    closeDocEditorBtn: $('#closeDocEditorBtn'), doneDocEditorBtn: $('#doneDocEditorBtn'),
    noteDialog: $('#noteDialog'), noteForm: $('#noteForm'), noteDialogTitle: $('#noteDialogTitle'), noteContext: $('#noteContext'), noteText: $('#noteText'), saveNoteBtn: $('#saveNoteBtn'),
    confirmDialog: $('#confirmDialog'), confirmTitle: $('#confirmTitle'), confirmText: $('#confirmText'), confirmOk: $('#confirmOk')
  };

  let db;
  let state = null;
  let currentChapterIndex = 0;
  let editMode = false;
  let activeBlockId = null;
  let pendingPickerMode = null;
  let pendingNoteType = null;
  let dirtySinceSnapshot = false;
  let saveTimer = null;
  let installPrompt = null;
  let currentDocType = null;
  let docDirty = false;
  let pendingEditSelection = null;

  function uid(prefix='id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  }

  function nowIso() { return new Date().toISOString(); }
  function humanTime(iso) {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('de-DE', {dateStyle:'short', timeStyle:'short'}).format(d);
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains('state')) database.createObjectStore('state');
        if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', {keyPath:'id'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbGet(store, key) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(store, value, key) {
    return new Promise((resolve, reject) => {
      const st = db.transaction(store, 'readwrite').objectStore(store);
      const req = key === undefined ? st.put(value) : st.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function dbDelete(store, key) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function dbAll(store) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function baseState() {
    return {
      appVersion: 1,
      projectName: 'Nessa – Schreibfassung',
      book: null,
      library: {name:'', text:'', baselineText:'', modifiedAt:null},
      revisions: {name:'', text:'', baselineText:'', modifiedAt:null},
      notes: [],
      settings: {fontSize:23, showChanges:true},
      metadata: {createdAt: nowIso(), lastSavedAt: nowIso(), baselineAt: null, baselineLabel: 'Importstand'}
    };
  }

  function ensureStateShape() {
    if (!state) state = baseState();
    state.library ||= {name:'', text:'', baselineText:'', modifiedAt:null};
    state.revisions ||= {name:'', text:'', baselineText:'', modifiedAt:null};
    if (state.library.text && state.library.baselineText === undefined) state.library.baselineText = state.library.text;
    if (state.revisions.text && state.revisions.baselineText === undefined) state.revisions.baselineText = state.revisions.text;
    state.library.baselineText ??= '';
    state.revisions.baselineText ??= '';
    state.notes ||= [];
    state.settings ||= {fontSize:23, showChanges:true};
  }

  function diffTokens(oldText='', newText='') {
    const a = oldText.match(/\s+|[^\s]+/gu) || [];
    const b = newText.match(/\s+|[^\s]+/gu) || [];
    const n=a.length, m=b.length;
    const pushMerged=(out,text,type)=>{
      if(!text) return;
      const last=out[out.length-1];
      if(last && last.type===type) last.text+=text;
      else out.push({text,type});
    };

    // Bei sehr langen Absätzen: schneller Präfix-/Suffix-Vergleich.
    if (n*m > 120000) {
      let pre=0;
      while(pre<n && pre<m && a[pre]===b[pre]) pre++;
      let ai=n-1, bi=m-1;
      while(ai>=pre && bi>=pre && a[ai]===b[bi]) { ai--; bi--; }
      const out=[];
      if(pre) pushMerged(out,b.slice(0,pre).join(''),'same');
      if(ai>=pre) pushMerged(out,a.slice(pre,ai+1).join(''),'del');
      if(bi>=pre) pushMerged(out,b.slice(pre,bi+1).join(''),'add');
      if(bi+1<m) pushMerged(out,b.slice(bi+1).join(''),'same');
      return out.filter(x=>x.text);
    }

    const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=n-1;i>=0;i--) {
      for(let j=m-1;j>=0;j--) {
        dp[i][j]=a[i]===b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
      }
    }

    let i=0,j=0; const out=[];
    while(i<n && j<m){
      if(a[i]===b[j]) {
        pushMerged(out,b[j],'same'); i++; j++;
      } else if(dp[i+1][j] >= dp[i][j+1]) {
        pushMerged(out,a[i],'del'); i++;
      } else {
        pushMerged(out,b[j],'add'); j++;
      }
    }
    while(i<n){ pushMerged(out,a[i],'del'); i++; }
    while(j<m){ pushMerged(out,b[j],'add'); j++; }
    return out;
  }

  function renderDiffInto(el, baselineText, currentText) {
    el.textContent='';
    const parts = diffTokens(baselineText || '', currentText || '');

    // Kleine unveränderte Zwischenstücke innerhalb einer Überarbeitung
    // gehören optisch noch zu derselben Änderung. So gibt es für einen
    // zusammenhängenden gelöschten/ersetzten Abschnitt nur EIN Minus.
    const isTinySame = (part) => {
      if (!part || part.type !== 'same') return false;
      const words = (part.text.match(/[^\\s]+/gu) || []).length;
      return words <= 1;
    };

    const groups = [];
    let i = 0;

    while (i < parts.length) {
      if (parts[i].type === 'same') {
        groups.push({type:'same', parts:[parts[i]]});
        i++;
        continue;
      }

      const editParts = [];
      let j = i;

      while (j < parts.length) {
        const p = parts[j];

        if (p.type !== 'same') {
          editParts.push(p);
          j++;
          continue;
        }

        if (isTinySame(p) && j + 1 < parts.length && parts[j + 1].type !== 'same') {
          editParts.push(p);
          j++;
          continue;
        }

        break;
      }

      groups.push({type:'edit', parts:editParts});
      i = j;
    }

    for (const group of groups) {
      if (group.type === 'same') {
        el.appendChild(document.createTextNode(group.parts[0].text));
        continue;
      }

      const deletedText = group.parts
        .filter(p => p.type === 'del')
        .map(p => p.text)
        .join('')
        .replace(/\\s+/g,' ')
        .trim();

      if (deletedText) {
        const wrap=document.createElement('span');
        wrap.className='deletion-wrap';

        const marker=document.createElement('button');
        marker.type='button';
        marker.className='deletion-marker';
        marker.textContent='−';
        marker.title='Gelöschten Text anzeigen';
        marker.setAttribute('aria-label','Gelöschten Text anzeigen');

        const deleted=document.createElement('span');
        deleted.className='deleted-inline';
        deleted.textContent=deletedText;

        marker.addEventListener('click',e=>{
          e.preventDefault();
          e.stopPropagation();
          wrap.classList.toggle('open');
          marker.setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false');
        });

        wrap.append(marker,deleted);
        el.appendChild(wrap);
      }

      for (const p of group.parts) {
        if (p.type === 'del') continue;

        if (p.type === 'add') {
          const span=document.createElement('span');
          span.className='inline-change';
          span.textContent=p.text;
          el.appendChild(span);
        } else {
          el.appendChild(document.createTextNode(p.text));
        }
      }
    }
  }

  function parseMaster(text, sourceName='Arbeitsmaster.md') {
    const normalized = text.replace(/\r\n?/g, '\n');
    const re = /^##\s+Kapitel\s+(\d+)\s*[–—-]\s*(.+?)\s*$/gm;
    const matches = [...normalized.matchAll(re)];
    if (!matches.length) throw new Error('Keine Kapitelüberschriften im Format „## Kapitel 1 – Titel“ gefunden.');
    const preamble = normalized.slice(0, matches[0].index).trimEnd();
    const chapters = matches.map((m, idx) => {
      const start = m.index + m[0].length;
      const end = idx + 1 < matches.length ? matches[idx+1].index : normalized.length;
      const body = normalized.slice(start, end).replace(/^\s*\n/, '').trimEnd();
      const rawBlocks = body ? body.split(/\n\s*\n+/) : [];
      const chapterId = `chapter_${m[1]}`;
      const blocks = rawBlocks.map((raw, bi) => {
        const text = raw.trimEnd();
        const sep = /^---+$/.test(text.trim());
        return {id:`${chapterId}_b${bi+1}`, type:sep?'sep':'p', text:sep?'---':text, baselineText:sep?'---':text, changed:false, createdAt:nowIso(), modifiedAt:null};
      });
      return {id:chapterId, number:Number(m[1]), title:m[2].trim(), heading:m[0], blocks};
    });
    return {sourceName, preamble, chapters, importedAt:nowIso()};
  }

  function buildMaster(book) {
    if (!book) return '';
    const parts = [];
    if (book.preamble) parts.push(book.preamble.trimEnd());
    for (const chapter of book.chapters) {
      const heading = `## Kapitel ${chapter.number} – ${chapter.title}`;
      const body = chapter.blocks.map(b => b.type === 'sep' ? '---' : b.text).join('\n\n');
      parts.push(`${heading}\n\n${body}`.trimEnd());
    }
    return parts.join('\n\n\n') + '\n';
  }

  function changedBlocks() {
    if (!state?.book) return [];
    const out = [];
    for (const ch of state.book.chapters) {
      for (const b of ch.blocks) {
        if (b.type !== 'p') continue;
        const changed = b.baselineText === null || b.baselineText === undefined ? true : b.text !== b.baselineText;
        if (changed) out.push({chapter:ch, block:b});
      }
    }
    return out;
  }

  async function persist(show=true) {
    if (!state) return;
    state.metadata.lastSavedAt = nowIso();
    els.saveState.textContent = 'speichert …';
    await dbPut('state', state, PROJECT_KEY);
    els.saveState.textContent = 'lokal gespeichert';
    if (show) toast('Lokal gespeichert');
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    els.saveState.textContent = 'ungespeichert …';
    saveTimer = setTimeout(() => persist(false), 650);
  }

  async function createSnapshot(label='Automatische Sicherung') {
    if (!state?.book) return;
    const snap = {id:uid('snap'), createdAt:nowIso(), label, state:clone(state)};
    await dbPut('snapshots', snap);
    const all = (await dbAll('snapshots')).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    for (const old of all.slice(MAX_SNAPSHOTS)) await dbDelete('snapshots', old.id);
    dirtySinceSnapshot = false;
    await renderSnapshots();
  }

  async function maybeSnapshot(label='Vor größerer Änderung') {
    if (dirtySinceSnapshot && state?.book) await createSnapshot(label);
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.add('hidden'), 2200);
  }

  function currentChapter() { return state?.book?.chapters?.[currentChapterIndex] || null; }
  function currentBlock() {
    const ch = currentChapter();
    return ch?.blocks.find(b => b.id === activeBlockId) || null;
  }

  function blockExcerpt(block, max=150) {
    if (!block) return 'Kapitelbezogene Notiz';
    return block.text.replace(/\s+/g,' ').trim().slice(0,max) + (block.text.length > max ? ' …' : '');
  }

  function render() {
    if (!state?.book?.chapters?.length) {
      els.empty.classList.remove('hidden');
      els.chapterView.classList.add('hidden');
      els.chapterCounter.textContent = '–';
      els.prevBtn.disabled = true; els.nextBtn.disabled = true;
      renderChapterList(); renderFollowups(); renderProjectStatus();
      return;
    }
    els.empty.classList.add('hidden');
    els.chapterView.classList.remove('hidden');
    const ch = currentChapter();
    els.chapterTitle.textContent = `Kapitel ${ch.number} – ${ch.title}`;
    els.chapterCounter.textContent = `${currentChapterIndex+1} von ${state.book.chapters.length}`;
    els.prevBtn.disabled = currentChapterIndex === 0;
    els.nextBtn.disabled = currentChapterIndex === state.book.chapters.length - 1;
    els.chapterBody.innerHTML = '';
    for (const block of ch.blocks) {
      const div = document.createElement('div');
      div.dataset.blockId = block.id;
      div.className = `book-block ${block.type === 'sep' ? 'separator' : ''}`;
      const changed = block.type === 'p' && block.text !== block.baselineText;
      if (changed) div.classList.add('changed');
      if (state.settings.showChanges) div.classList.add('show-change');
      if (block.id === activeBlockId) div.classList.add('selected');
      if (block.type === 'sep') {
        div.textContent = '• • •';
      } else {
        if (state.settings.showChanges && changed && !editMode) renderDiffInto(div, block.baselineText || '', block.text);
        else div.textContent = block.text;
        if (editMode) {
          div.contentEditable = 'true';
          div.spellcheck = true;
          div.addEventListener('input', onBlockInput);
          div.addEventListener('keydown', onBlockKeydown);
        } else {
          div.addEventListener('pointerdown', e => rememberEditPoint(e, div));
        }
        div.addEventListener('click', () => selectBlock(block.id));
      }
      els.chapterBody.appendChild(div);
    }
    els.modeBtn.textContent = editMode ? '✓' : '✎';
    els.editBtn.textContent = editMode ? '✓' : '✎';
    renderChapterList(els.chapterSearch.value);
    renderFollowups();
    renderProjectStatus();
  }

  function selectBlock(id) {
    activeBlockId = id;
    $$('.book-block.selected').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add('selected');
  }

  function blockForNode(node) {
    if(!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el?.closest?.('.book-block') || null;
  }

  function currentTextOffsetAtDomPoint(blockEl, node, offset) {
    if(!blockEl || !node) return 0;
    try {
      const range=document.createRange();
      range.setStart(blockEl,0);
      range.setEnd(node,offset);
      const frag=range.cloneContents();
      frag.querySelectorAll?.('.deletion-wrap').forEach(n=>n.remove());
      return (frag.textContent || '').length;
    } catch(_) {
      return 0;
    }
  }

  function rememberEditPoint(e, blockEl) {
    if(editMode || !blockEl || blockEl.classList.contains('separator')) return;
    let node=null, offset=0;
    if(document.caretPositionFromPoint) {
      const pos=document.caretPositionFromPoint(e.clientX,e.clientY);
      node=pos?.offsetNode || null; offset=pos?.offset || 0;
    } else if(document.caretRangeFromPoint) {
      const range=document.caretRangeFromPoint(e.clientX,e.clientY);
      node=range?.startContainer || null; offset=range?.startOffset || 0;
    }
    if(!node || !blockEl.contains(node)) return;
    const pos=currentTextOffsetAtDomPoint(blockEl,node,offset);
    pendingEditSelection={
      chapterId:currentChapter()?.id || null,
      blockId:blockEl.dataset.blockId,
      start:pos,
      end:pos
    };
    activeBlockId=blockEl.dataset.blockId;
  }

  function captureReadSelection() {
    if(editMode) return;
    const sel=window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range=sel.getRangeAt(0);
    const startBlock=blockForNode(range.startContainer);
    const endBlock=blockForNode(range.endContainer);
    if(!startBlock || startBlock!==endBlock || !els.chapterBody.contains(startBlock)) return;
    let start=currentTextOffsetAtDomPoint(startBlock,range.startContainer,range.startOffset);
    let end=currentTextOffsetAtDomPoint(startBlock,range.endContainer,range.endOffset);
    if(start>end) [start,end]=[end,start];
    pendingEditSelection={
      chapterId:currentChapter()?.id || null,
      blockId:startBlock.dataset.blockId,
      start,
      end
    };
    activeBlockId=startBlock.dataset.blockId;
  }

  function restoreEditSelection() {
    if(!editMode || !pendingEditSelection) return;
    const ch=currentChapter();
    if(!ch || pendingEditSelection.chapterId!==ch.id) return;
    const el=document.querySelector(`[data-block-id="${CSS.escape(pendingEditSelection.blockId)}"]`);
    if(!el || el.contentEditable!=='true') return;
    activeBlockId=pendingEditSelection.blockId;
    selectBlock(activeBlockId);
    try { el.focus({preventScroll:true}); } catch(_) { el.focus(); }
    let node=el.firstChild;
    if(!node || node.nodeType!==Node.TEXT_NODE) {
      el.textContent=el.innerText;
      node=el.firstChild || el.appendChild(document.createTextNode(''));
    }
    const len=node.textContent.length;
    const start=Math.max(0,Math.min(pendingEditSelection.start ?? 0,len));
    const end=Math.max(start,Math.min(pendingEditSelection.end ?? start,len));
    const range=document.createRange();
    range.setStart(node,start);
    range.setEnd(node,end);
    const sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function onBlockInput(e) {
    const id = e.currentTarget.dataset.blockId;
    const block = currentChapter().blocks.find(b => b.id === id);
    if (!block) return;
    block.text = e.currentTarget.innerText.replace(/\u00a0/g,' ');
    block.modifiedAt = nowIso();
    block.changed = block.text !== block.baselineText;
    e.currentTarget.classList.toggle('changed', block.changed);
    e.currentTarget.classList.toggle('show-change', state.settings.showChanges);
    dirtySinceSnapshot = true;
    schedulePersist();
    renderChapterList(els.chapterSearch.value);
  }

  function caretOffsetWithin(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString().length;
  }

  function placeCaret(el, offset=0) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    const node = el.firstChild || el.appendChild(document.createTextNode(''));
    const safe = Math.min(offset, node.textContent.length);
    range.setStart(node, safe); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  }

  function onBlockKeydown(e) {
    const id = e.currentTarget.dataset.blockId;
    const ch = currentChapter();
    const idx = ch.blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const pos = caretOffsetWithin(e.currentTarget);
      const old = ch.blocks[idx];
      const text = e.currentTarget.innerText.replace(/\u00a0/g,' ');
      old.text = text.slice(0,pos);
      old.changed = old.text !== old.baselineText;
      old.modifiedAt = nowIso();
      const neu = {id:uid(`${ch.id}_b`), type:'p', text:text.slice(pos), baselineText:'', changed:true, createdAt:nowIso(), modifiedAt:nowIso()};
      ch.blocks.splice(idx+1, 0, neu);
      activeBlockId = neu.id;
      dirtySinceSnapshot = true;
      schedulePersist();
      render();
      setTimeout(() => {
        const el = document.querySelector(`[data-block-id="${CSS.escape(neu.id)}"]`);
        if (el) placeCaret(el,0);
      },0);
      return;
    }
    if (e.key === 'Backspace' && caretOffsetWithin(e.currentTarget) === 0 && idx > 0) {
      const prev = ch.blocks[idx-1];
      const cur = ch.blocks[idx];
      if (prev.type === 'p') {
        e.preventDefault();
        const joinAt = prev.text.length;
        prev.text = prev.text + (prev.text && cur.text ? ' ' : '') + cur.text;
        prev.changed = prev.text !== prev.baselineText;
        prev.modifiedAt = nowIso();
        ch.blocks.splice(idx,1);
        state.notes.forEach(n => { if (n.chapterId === ch.id && n.blockId === cur.id) n.blockId = prev.id; });
        activeBlockId = prev.id;
        dirtySinceSnapshot = true;
        schedulePersist(); render();
        setTimeout(() => { const el=document.querySelector(`[data-block-id="${CSS.escape(prev.id)}"]`); if(el) placeCaret(el,joinAt); },0);
      }
    }
  }

  async function setEditMode(on) {
    if (!editMode && on) captureReadSelection();
    if (editMode && !on) await maybeSnapshot('Bearbeitung beendet');
    editMode = on;
    render();
    if (on) {
      requestAnimationFrame(() => restoreEditSelection());
      toast('Bearbeiten aktiv – Cursor/Markierung wurde übernommen');
    }
  }

  async function goChapter(index) {
    if (!state?.book) return;
    if (editMode) await maybeSnapshot(`Vor Kapitelwechsel von Kapitel ${currentChapter()?.number || ''}`);
    currentChapterIndex = Math.max(0, Math.min(index, state.book.chapters.length-1));
    activeBlockId = null;
    pendingEditSelection = null;
    render();
    closeDrawer();
    window.scrollTo({top:0, behavior:'instant'});
  }

  function renderChapterList(query='') {
    els.chapterList.innerHTML = '';
    if (!state?.book?.chapters) return;
    const q = query.trim().toLocaleLowerCase('de');
    state.book.chapters.forEach((ch, idx) => {
      const hay = `${ch.number} ${ch.title} ${ch.blocks.map(b=>b.text).join(' ')}`.toLocaleLowerCase('de');
      if (q && !hay.includes(q)) return;
      const row = document.createElement('div');
      row.className = `chapter-item ${idx===currentChapterIndex?'active':''}`;
      const label = document.createElement('span');
      label.textContent = `${ch.number}. ${ch.title}`;
      row.appendChild(label);
      if (ch.blocks.some(b => b.type==='p' && b.text !== b.baselineText)) {
        const dot=document.createElement('span'); dot.className='dot'; dot.title='Geändert'; row.appendChild(dot);
      }
      row.addEventListener('click', () => goChapter(idx));
      els.chapterList.appendChild(row);
    });
  }

  function renderProjectStatus() {
    const setStatus = (iconEl, textEl, loaded, label) => {
      if (!iconEl || !textEl) return;
      iconEl.textContent = loaded ? '✓' : '○';
      textEl.textContent = loaded ? (label || 'geladen') : 'nicht geladen';
    };
    setStatus(
      els.masterStatusIcon,
      els.masterStatusText,
      !!state?.book?.chapters?.length,
      state?.book?.sourceName || (state?.book?.chapters?.length ? `${state.book.chapters.length} Kapitel` : '')
    );
    const libraryChanged=!!state?.library?.text && state.library.text !== (state.library.baselineText ?? state.library.text);
    const revisionsChanged=!!state?.revisions?.text && state.revisions.text !== (state.revisions.baselineText ?? state.revisions.text);
    setStatus(
      els.libraryStatusIcon,
      els.libraryStatusText,
      !!state?.library?.text,
      (state?.library?.name || 'geladen') + (libraryChanged ? ' • geändert' : '')
    );
    setStatus(
      els.revisionsStatusIcon,
      els.revisionsStatusText,
      !!state?.revisions?.text,
      (state?.revisions?.name || 'geladen') + (revisionsChanged ? ' • geändert' : '')
    );
  }

  function renderFollowups() {
    els.followupList.innerHTML = '';
    if (!state) return;
    const open = state.notes.filter(n => n.type==='followup' && !n.resolved);
    if (!open.length) { els.followupList.textContent = 'Keine offenen Folgeprüfungen.'; return; }
    for (const note of open) {
      const ch = state.book?.chapters.find(c => c.id===note.chapterId);
      const block = ch?.blocks.find(b => b.id===note.blockId);
      const card=document.createElement('div'); card.className='followup-card';
      card.innerHTML = `<strong>Kapitel ${ch?.number ?? '?'}</strong><div></div><small></small>`;
      card.querySelector('div').textContent = note.text;
      card.querySelector('small').textContent = blockExcerpt(block,90);
      const go=document.createElement('button'); go.textContent='Zur Stelle'; go.addEventListener('click',()=>{
        const idx=state.book.chapters.findIndex(c=>c.id===note.chapterId); if(idx>=0){ currentChapterIndex=idx; activeBlockId=note.blockId; render(); closeDrawer(); setTimeout(()=>document.querySelector(`[data-block-id="${CSS.escape(note.blockId)}"]`)?.scrollIntoView({block:'center'}),50); }
      });
      const done=document.createElement('button'); done.textContent='Erledigt'; done.addEventListener('click',async()=>{ note.resolved=true; note.resolvedAt=nowIso(); await persist(false); renderFollowups(); });
      card.append(go, done); els.followupList.appendChild(card);
    }
  }

  function openProjectDoc(type) {
    ensureStateShape();
    const doc = type === 'library' ? state.library : state.revisions;
    const label = type === 'library' ? 'Storybibliothek' : 'Revisionsstand';
    if (!doc?.text) return toast(`${label} ist noch nicht importiert`);
    currentDocType = type;
    docDirty = false;
    els.docEditorTitle.textContent = label;
    els.docEditorState.textContent = 'lokal gespeichert';
    els.docEditorText.value = doc.text;
    closeDrawer();
    els.docEditor.classList.remove('hidden');
    setTimeout(()=>els.docEditorText.focus(),50);
  }

  function onProjectDocInput() {
    if (!currentDocType || !state) return;
    const doc = currentDocType === 'library' ? state.library : state.revisions;
    doc.text = els.docEditorText.value;
    doc.modifiedAt = nowIso();
    docDirty = true;
    els.docEditorState.textContent = 'speichert …';
    schedulePersist();
    clearTimeout(onProjectDocInput._t);
    onProjectDocInput._t=setTimeout(()=>{ els.docEditorState.textContent='lokal gespeichert'; renderProjectStatus(); },750);
  }

  async function closeProjectDoc() {
    if (docDirty) {
      await persist(false);
      await createSnapshot(currentDocType === 'library' ? 'Storybibliothek bearbeitet' : 'Revisionsstand bearbeitet');
    }
    docDirty=false; currentDocType=null;
    els.docEditor.classList.add('hidden');
    renderProjectStatus();
  }

  async function renderSnapshots() {
    els.snapshotList.innerHTML='';
    if (!db) return;
    const snaps=(await dbAll('snapshots')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,8);
    if (!snaps.length){ els.snapshotList.textContent='Noch keine lokalen Versionen.'; return; }
    for(const snap of snaps){
      const card=document.createElement('div'); card.className='snapshot-card';
      const t=document.createElement('div'); t.innerHTML=`<strong>${escapeHtml(snap.label)}</strong><br><small>${humanTime(snap.createdAt)}</small>`; card.appendChild(t);
      const btn=document.createElement('button'); btn.textContent='Wiederherstellen'; btn.addEventListener('click',()=>restoreSnapshot(snap)); card.appendChild(btn);
      els.snapshotList.appendChild(card);
    }
  }

  function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

  async function restoreSnapshot(snap) {
    const ok = await confirmBox('Version wiederherstellen', `Stand vom ${humanTime(snap.createdAt)} wiederherstellen? Der aktuelle Stand wird vorher zusätzlich gesichert.`);
    if (!ok) return;
    await createSnapshot('Vor Wiederherstellung');
    state=clone(snap.state); await persist(false); currentChapterIndex=0; activeBlockId=null; editMode=false; render(); closeDrawer(); toast('Version wiederhergestellt');
  }

  function openDrawer(){ els.drawer.classList.add('open'); els.backdrop.classList.remove('hidden'); renderFollowups(); renderSnapshots(); }
  function closeDrawer(){ els.drawer.classList.remove('open'); els.backdrop.classList.add('hidden'); }

  function openPicker(mode) {
    pendingPickerMode=mode;
    els.filePicker.value='';
    if (mode==='private') els.filePicker.accept='.json,application/json';
    else if (mode==='chatgpt-return') els.filePicker.accept='.zip,application/zip,application/x-zip-compressed';
    else els.filePicker.accept='.md,.txt,text/plain,text/markdown';
    els.filePicker.click();
  }

  async function unzipTextFiles(file) {
    const buf=await file.arrayBuffer();
    const bytes=new Uint8Array(buf);
    const dv=new DataView(buf);
    const dec=new TextDecoder('utf-8');
    const out={};
    let p=0;

    const inflateRaw=async(data)=>{
      if(typeof DecompressionStream==='undefined') throw new Error('Dieses ZIP verwendet Komprimierung, die dieser Browser nicht lesen kann.');
      const ds=new DecompressionStream('deflate-raw');
      const stream=new Blob([data]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    };

    while(p+4<=bytes.length) {
      const sig=dv.getUint32(p,true);
      if(sig===0x04034b50) {
        if(p+30>bytes.length) throw new Error('ZIP-Datei ist beschädigt.');
        const flags=dv.getUint16(p+6,true);
        const method=dv.getUint16(p+8,true);
        const compSize=dv.getUint32(p+18,true);
        const nameLen=dv.getUint16(p+26,true);
        const extraLen=dv.getUint16(p+28,true);
        if(flags & 0x0008) throw new Error('ZIP mit Daten-Deskriptor wird noch nicht unterstützt.');
        const nameStart=p+30;
        const dataStart=nameStart+nameLen+extraLen;
        const dataEnd=dataStart+compSize;
        if(dataEnd>bytes.length) throw new Error('ZIP-Datei ist unvollständig.');
        const name=dec.decode(bytes.slice(nameStart,nameStart+nameLen));
        const packed=bytes.slice(dataStart,dataEnd);
        let raw;
        if(method===0) raw=packed;
        else if(method===8) raw=await inflateRaw(packed);
        else throw new Error(`ZIP-Komprimierung ${method} wird nicht unterstützt.`);
        out[name]=dec.decode(raw);
        p=dataEnd;
        continue;
      }
      if(sig===0x02014b50 || sig===0x06054b50) break;
      p++;
    }
    return out;
  }

  function findZipFile(files, pattern) {
    const key=Object.keys(files).find(name=>pattern.test(name.split('/').pop()));
    return key ? files[key] : null;
  }

  async function importChatGPTReturn(file) {
    const files=await unzipTextFiles(file);
    const master=findZipFile(files,/^01_.*ARBEITSMASTER.*\.md$/i);
    const library=findZipFile(files,/^02_.*STORYBIBLIOTHEK.*\.md$/i);
    const revisions=findZipFile(files,/^03_.*REVISIONSSTAND.*\.md$/i);
    if(!master || !library || !revisions) {
      throw new Error('In der Rückgabe-ZIP fehlen Arbeitsmaster, Storybibliothek oder Revisionsstand.');
    }

    let manifest=null;
    const manifestText=findZipFile(files,/^00_CHATGPT_RUECKGABE\.json$/i);
    if(manifestText) {
      try { manifest=JSON.parse(manifestText); }
      catch { throw new Error('Die ChatGPT-Rückgabe enthält eine ungültige Rückgabe-Info.'); }
    }

    await createSnapshot('Vor ChatGPT-Rückgabe');
    const oldNotes=clone(state?.notes || []);
    const oldSettings=clone(state?.settings || {fontSize:23,showChanges:true});
    const oldCreatedAt=state?.metadata?.createdAt || nowIso();
    const oldIndex=currentChapterIndex;

    const next=baseState();
    next.settings=oldSettings;
    next.metadata.createdAt=oldCreatedAt;
    next.book=parseMaster(master,'01_NESSA_SNAPE_ARBEITSMASTER_AKTUELL.md');
    next.library={name:'02_NESSA_SNAPE_STORYBIBLIOTHEK_AKTUELL.md',text:library,baselineText:library,modifiedAt:null};
    next.revisions={name:'03_NESSA_SNAPE_REVISIONSSTAND_AKTUELL.md',text:revisions,baselineText:revisions,modifiedAt:null};

    const processedIds=new Set([
      ...(manifest?.processedNoteIds || []),
      ...(manifest?.processedFollowupIds || [])
    ]);
    const processedTexts=new Set([
      ...(manifest?.processedNoteTexts || []),
      ...(manifest?.processedFollowupTexts || [])
    ]);

    next.notes=oldNotes.map(n=>{
      if(processedIds.has(n.id) || processedTexts.has(n.text)) {
        return {...n,resolved:true,resolvedAt:nowIso()};
      }
      return n;
    });

    next.metadata.baselineAt=nowIso();
    next.metadata.baselineLabel=manifest?.label || `ChatGPT-Rückgabe ${file.name}`;
    state=next;
    currentChapterIndex=Math.min(oldIndex, Math.max(0,(state.book?.chapters?.length||1)-1));
    activeBlockId=null;
    pendingEditSelection=null;
    editMode=false;
    dirtySinceSnapshot=false;

    await persist(false);
    render();
    renderProjectStatus();
    renderFollowups();
    await createSnapshot('ChatGPT-Stand importiert');

    const resolved=next.notes.filter(n=>n.resolved && (processedIds.has(n.id)||processedTexts.has(n.text))).length;
    toast(`Überarbeiteter Stand übernommen${resolved ? ` · ${resolved} Hinweis${resolved===1?'':'e'} abgearbeitet` : ''}`);
  }

  async function handleFile(file) {
    if (!file) return;
    if (pendingPickerMode==='chatgpt-return') {
      await importChatGPTReturn(file);
      return;
    }
    const text=await file.text();
    if (pendingPickerMode==='private') {
      let obj;
      try { obj=JSON.parse(text); } catch { throw new Error('Die Sicherungsdatei ist kein gültiges JSON.'); }
      await importPrivateObject(obj, file.name); return;
    }
    if (!state) state=baseState();
    if (pendingPickerMode==='master') {
      await maybeSnapshot('Vor neuem Arbeitsmaster');
      state.book=parseMaster(text,file.name); currentChapterIndex=0; activeBlockId=null;
      state.metadata.baselineAt=nowIso(); state.metadata.baselineLabel=`Import ${file.name}`;
      dirtySinceSnapshot=false; await persist(false); render(); await createSnapshot('Arbeitsmaster importiert'); toast(`${state.book.chapters.length} Kapitel lokal importiert`);
    } else if (pendingPickerMode==='library') {
      state.library={name:file.name,text,baselineText:text,modifiedAt:null}; await persist(false); renderProjectStatus(); toast('Storybibliothek lokal gespeichert');
    } else if (pendingPickerMode==='revisions') {
      state.revisions={name:file.name,text,baselineText:text,modifiedAt:null}; await persist(false); renderProjectStatus(); toast('Revisionsstand lokal gespeichert');
    }
  }

  async function importPrivateObject(obj, fileName='Sicherung.json') {
    await maybeSnapshot('Vor Import');
    if (obj.nessaBackupVersion && obj.state) {
      state=obj.state;
    } else if (obj.nessaPrivateBundleVersion && obj.files?.master) {
      state=baseState();
      state.book=parseMaster(obj.files.master.text,obj.files.master.name || 'Arbeitsmaster.md');
      state.library={name:obj.files.library?.name||'',text:obj.files.library?.text||'',baselineText:obj.files.library?.text||'',modifiedAt:null};
      state.revisions={name:obj.files.revisions?.name||'',text:obj.files.revisions?.text||'',baselineText:obj.files.revisions?.text||'',modifiedAt:null};
      state.metadata.baselineAt=nowIso(); state.metadata.baselineLabel=obj.label || `Privater Import ${fileName}`;
    } else {
      throw new Error('Diese Datei ist keine Nessa-Sicherung bzw. kein privates Importpaket.');
    }
    ensureStateShape();
    currentChapterIndex=0; activeBlockId=null; editMode=false; dirtySinceSnapshot=false;
    await persist(false); applySettings(); render(); await createSnapshot('Privater Projektstand importiert'); toast('Privater Projektstand lokal geladen');
  }

  function downloadBlob(name, blob) {
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function download(name, content, mime='text/plain;charset=utf-8') {
    downloadBlob(name, new Blob([content],{type:mime}));
  }

  let crcTable=null;
  function crc32(bytes) {
    if(!crcTable){
      crcTable=new Uint32Array(256);
      for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); crcTable[n]=c>>>0; }
    }
    let c=0xFFFFFFFF;
    for(const b of bytes) c=crcTable[(c^b)&0xFF]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0;
  }

  function zipDateTime(d=new Date()) {
    const year=Math.max(1980,d.getFullYear());
    const time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
    const date=((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
    return {time,date};
  }

  function makeZip(entries) {
    const enc=new TextEncoder();
    const localParts=[]; const centralParts=[]; let offset=0;
    const {time,date}=zipDateTime();
    const u16=(v)=>{const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,v,true);return b;};
    const u32=(v)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,v>>>0,true);return b;};
    const concat=(parts)=>{const len=parts.reduce((s,p)=>s+p.length,0);const out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;};
    for(const entry of entries){
      const name=enc.encode(entry.name); const data=enc.encode(entry.text ?? ''); const crc=crc32(data); const size=data.length;
      const local=concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(time),u16(date),u32(crc),u32(size),u32(size),u16(name.length),u16(0),name,data]);
      localParts.push(local);
      const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(time),u16(date),u32(crc),u32(size),u32(size),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
      centralParts.push(central); offset+=local.length;
    }
    const locals=concat(localParts); const centrals=concat(centralParts);
    const end=concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centrals.length),u32(locals.length),u16(0)]);
    return new Blob([locals,centrals,end],{type:'application/zip'});
  }

  function exportBackup() {
    if (!state) return toast('Noch kein Projekt geladen');
    const payload={nessaBackupVersion:1, exportedAt:nowIso(), state};
    download(`Nessa_PRIVATE_Sicherung_${dateStamp()}.json`, JSON.stringify(payload,null,2),'application/json');
  }

  function exportMaster() {
    if (!state?.book) return toast('Noch kein Arbeitsmaster geladen');
    download(`01_NESSA_SNAPE_ARBEITSMASTER_${dateStamp()}.md`, buildMaster(state.book),'text/markdown;charset=utf-8');
  }

  function buildChatGPTHints() {
    const open=state.notes.filter(n=>n.type==='followup'&&!n.resolved);
    const ownNotes=state.notes.filter(n=>n.type==='note'&&!n.resolved);
    const changes=changedBlocks();
    const lines=[];
    lines.push('# NESSA-SNAPE – HINWEISE FÜR CHATGPT','',`Export: ${new Date().toLocaleString('de-DE')}`,'',
      'Diese ZIP stammt aus der lokalen Nessa-Schreib-PWA. Sie enthält immer vier Dateien: diese Änderungs-/Folgeprüfungsdatei, den aktuellen Arbeitsmaster, die aktuelle Storybibliothek und den aktuellen Revisionsstand. Bitte prüfe offene Folgeprüfungen im gesamten Arbeitsmaster und – soweit relevant – in Storybibliothek und Revisionsstand.','');
    lines.push('## Offene Folgeprüfungen','');
    if(!open.length) lines.push('_Keine offenen Folgeprüfungen._','');
    for(const n of open){ const ch=state.book.chapters.find(c=>c.id===n.chapterId); const b=ch?.blocks.find(x=>x.id===n.blockId); lines.push(`### Kapitel ${ch?.number ?? '?'} – ${ch?.title ?? ''}`,`**ID:** ${n.id}`,`**Hinweis:** ${n.text}`,`**Bezug:** ${blockExcerpt(b,260)}`,''); }
    lines.push('## Eigene Notizen','');
    if(!ownNotes.length) lines.push('_Keine zusätzlichen Notizen._','');
    for(const n of ownNotes){ const ch=state.book.chapters.find(c=>c.id===n.chapterId); const b=ch?.blocks.find(x=>x.id===n.blockId); lines.push(`### Kapitel ${ch?.number ?? '?'} – ${ch?.title ?? ''}`,`**ID:** ${n.id}`,`**Notiz:** ${n.text}`,`**Bezug:** ${blockExcerpt(b,260)}`,''); }
    lines.push('## Eigene Änderungen am Roman seit dem Basisstand','');
    if(!changes.length) lines.push('_Keine lokal markierten Textänderungen seit dem Basisstand._','');
    for(const {chapter,block} of changes){ lines.push(`### Kapitel ${chapter.number} – ${chapter.title}`,`**Vorher:** ${block.baselineText || '— neu eingefügt —'}`,`**Jetzt:** ${block.text}`,''); }
    lines.push('## Weitere Projektdokumente','');
    lines.push(`- Storybibliothek: ${state.library.text !== (state.library.baselineText ?? state.library.text) ? 'seit Basisstand geändert' : 'keine lokale Änderung markiert'}`);
    lines.push(`- Revisionsstand: ${state.revisions.text !== (state.revisions.baselineText ?? state.revisions.text) ? 'seit Basisstand geändert' : 'keine lokale Änderung markiert'}`);
    return lines.join('\n')+'\n';
  }

  function exportChatGPT() {
    if (!state?.book) return toast('Noch kein Arbeitsmaster geladen');
    const missing=[];
    if(!state.library?.text) missing.push('Storybibliothek');
    if(!state.revisions?.text) missing.push('Revisionsstand');
    if(missing.length) return toast(`Fehlt noch: ${missing.join(' und ')}`);
    const entries=[
      {name:'00_AENDERUNGEN_UND_FOLGEPRUEFUNGEN.md', text:buildChatGPTHints()},
      {name:'01_NESSA_SNAPE_ARBEITSMASTER_AKTUELL.md', text:buildMaster(state.book)},
      {name:'02_NESSA_SNAPE_STORYBIBLIOTHEK_AKTUELL.md', text:state.library.text},
      {name:'03_NESSA_SNAPE_REVISIONSSTAND_AKTUELL.md', text:state.revisions.text}
    ];
    downloadBlob(`NESSA_FUER_CHATGPT_${dateStamp()}.zip`, makeZip(entries));
    toast('ZIP mit 4 Dateien erstellt: Änderungen, Master, Storybibliothek, Revisionsstand');
  }

  function dateStamp(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

  async function acceptBaseline(){
    if(!state?.book) return;
    const ok=await confirmBox('Stand übernehmen','Alle derzeit grün markierten Textänderungen werden zum neuen Basisstand. Die Texte bleiben erhalten; nur die Änderungsmarkierung wird zurückgesetzt. Vorher wird automatisch eine lokale Version gespeichert.');
    if(!ok) return;
    await createSnapshot('Vor Stand übernehmen');
    for(const ch of state.book.chapters) for(const b of ch.blocks) if(b.type==='p'){ b.baselineText=b.text; b.changed=false; }
    ensureStateShape();
    state.library.baselineText=state.library.text;
    state.revisions.baselineText=state.revisions.text;
    state.metadata.baselineAt=nowIso(); state.metadata.baselineLabel=`Übernommen ${humanTime(state.metadata.baselineAt)}`;
    await persist(false); render(); toast('Neuer Basisstand gesetzt');
  }

  function openNote(type){
    if(!state?.book) return toast('Zuerst ein Buch importieren');
    pendingNoteType=type; const block=currentBlock();
    els.noteDialogTitle.textContent=type==='followup'?'Folgeänderung prüfen':'Notiz';
    els.noteContext.textContent=block?`Bezug: ${blockExcerpt(block,180)}`:`Bezug: Kapitel ${currentChapter().number}`;
    els.noteText.value=''; els.noteDialog.showModal(); setTimeout(()=>els.noteText.focus(),50);
  }

  async function saveNote(){
    const text=els.noteText.value.trim(); if(!text) return;
    const ch=currentChapter(); const note={id:uid('note'),type:pendingNoteType,chapterId:ch.id,blockId:activeBlockId||null,text,createdAt:nowIso(),resolved:false};
    state.notes.push(note); await persist(false); renderFollowups(); toast(pendingNoteType==='followup'?'Folgeprüfung gespeichert':'Notiz gespeichert');
  }

  async function confirmBox(title,text){
    els.confirmTitle.textContent=title; els.confirmText.textContent=text;
    return new Promise(resolve=>{
      const handler=()=>{ els.confirmDialog.removeEventListener('close',handler); resolve(els.confirmDialog.returnValue==='default'); };
      els.confirmDialog.addEventListener('close',handler); els.confirmDialog.showModal();
    });
  }

  function applySettings(){
    if(!state) return;
    document.documentElement.style.setProperty('--font-size',`${state.settings.fontSize || 23}px`);
    els.fontSize.value=state.settings.fontSize || 23;
    els.showChanges.checked=state.settings.showChanges !== false;
  }

  async function action(name){
    switch(name){
      case 'import-private': openPicker('private'); break;
      case 'import-master': openPicker('master'); break;
      case 'import-library': openPicker('library'); break;
      case 'import-revisions': openPicker('revisions'); break;
      case 'import-chatgpt-return': openPicker('chatgpt-return'); break;
      case 'open-library': openProjectDoc('library'); break;
      case 'open-revisions': openProjectDoc('revisions'); break;
      case 'toggle-edit': setEditMode(!editMode); break;
      case 'toggle-changes': state.settings.showChanges=!state.settings.showChanges; els.showChanges.checked=state.settings.showChanges; await persist(false); render(); break;
      case 'add-note': openNote('note'); break;
      case 'add-followup': openNote('followup'); break;
      case 'export-backup': exportBackup(); break;
      case 'export-master': exportMaster(); break;
      case 'export-chatgpt': exportChatGPT(); break;
      case 'accept-baseline': acceptBaseline(); break;
      case 'install': if(installPrompt){ installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; } else toast('Im Browsermenü „App installieren“ bzw. „Zum Startbildschirm“ wählen.'); break;
    }
  }

  function bindEvents(){
    els.menuBtn.addEventListener('click',openDrawer); els.drawerBtn.addEventListener('click',openDrawer); els.closeDrawerBtn.addEventListener('click',closeDrawer); els.backdrop.addEventListener('click',closeDrawer);
    els.editBtn.addEventListener('click',()=>setEditMode(!editMode)); els.modeBtn.addEventListener('click',()=>setEditMode(!editMode));
    els.prevBtn.addEventListener('click',()=>goChapter(currentChapterIndex-1)); els.nextBtn.addEventListener('click',()=>goChapter(currentChapterIndex+1));
    els.chapterSearch.addEventListener('input',()=>renderChapterList(els.chapterSearch.value));
    document.addEventListener('click',e=>{ const btn=e.target.closest('[data-action]'); if(btn) action(btn.dataset.action); });
    els.filePicker.addEventListener('change',async()=>{ try{ await handleFile(els.filePicker.files[0]); }catch(err){ console.error(err); toast(err.message || 'Import fehlgeschlagen'); } });
    els.fontSize.addEventListener('input',()=>{ if(!state) state=baseState(); state.settings.fontSize=Number(els.fontSize.value); applySettings(); schedulePersist(); });
    els.showChanges.addEventListener('change',()=>{ if(!state) return; state.settings.showChanges=els.showChanges.checked; schedulePersist(); render(); });
    els.noteForm.addEventListener('submit',e=>{ if(e.submitter===els.saveNoteBtn) saveNote(); });
    els.docEditorText.addEventListener('input',onProjectDocInput);
    els.closeDocEditorBtn.addEventListener('click',closeProjectDoc);
    els.doneDocEditorBtn.addEventListener('click',closeProjectDoc);
    document.addEventListener('selectionchange',()=>{ if(!editMode) captureReadSelection(); });
    window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installPrompt=e; });
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden' && state) persist(false); });
  }

  async function init(){
    db=await openDb();
    state=await dbGet('state',PROJECT_KEY) || baseState();
    ensureStateShape();
    applySettings(); bindEvents(); render(); renderProjectStatus(); renderSnapshots();
    if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./sw.js'); }catch(err){ console.warn('Service Worker konnte nicht registriert werden',err); } }
  }

  init().catch(err=>{ console.error(err); alert('Die App konnte nicht gestartet werden: '+err.message); });
})();
