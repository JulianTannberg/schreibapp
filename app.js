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
      library: {name:'', text:''},
      revisions: {name:'', text:''},
      notes: [],
      settings: {fontSize:23, showChanges:true},
      metadata: {createdAt: nowIso(), lastSavedAt: nowIso(), baselineAt: null, baselineLabel: 'Importstand'}
    };
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
        div.textContent = block.text;
        if (editMode) {
          div.contentEditable = 'true';
          div.spellcheck = true;
          div.addEventListener('input', onBlockInput);
          div.addEventListener('keydown', onBlockKeydown);
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
    if (editMode && !on) await maybeSnapshot('Bearbeitung beendet');
    editMode = on;
    render();
    if (on) toast('Bearbeiten aktiv – Änderungen werden lokal gespeichert');
  }

  async function goChapter(index) {
    if (!state?.book) return;
    if (editMode) await maybeSnapshot(`Vor Kapitelwechsel von Kapitel ${currentChapter()?.number || ''}`);
    currentChapterIndex = Math.max(0, Math.min(index, state.book.chapters.length-1));
    activeBlockId = null;
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
    setStatus(
      els.libraryStatusIcon,
      els.libraryStatusText,
      !!state?.library?.text,
      state?.library?.name || 'geladen'
    );
    setStatus(
      els.revisionsStatusIcon,
      els.revisionsStatusText,
      !!state?.revisions?.text,
      state?.revisions?.name || 'geladen'
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
    els.filePicker.accept = mode==='private' ? '.json,application/json' : '.md,.txt,text/plain,text/markdown';
    els.filePicker.click();
  }

  async function handleFile(file) {
    if (!file) return;
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
      state.library={name:file.name,text}; await persist(false); renderProjectStatus(); toast('Storybibliothek lokal gespeichert');
    } else if (pendingPickerMode==='revisions') {
      state.revisions={name:file.name,text}; await persist(false); renderProjectStatus(); toast('Revisionsstand lokal gespeichert');
    }
  }

  async function importPrivateObject(obj, fileName='Sicherung.json') {
    await maybeSnapshot('Vor Import');
    if (obj.nessaBackupVersion && obj.state) {
      state=obj.state;
    } else if (obj.nessaPrivateBundleVersion && obj.files?.master) {
      state=baseState();
      state.book=parseMaster(obj.files.master.text,obj.files.master.name || 'Arbeitsmaster.md');
      state.library={name:obj.files.library?.name||'',text:obj.files.library?.text||''};
      state.revisions={name:obj.files.revisions?.name||'',text:obj.files.revisions?.text||''};
      state.metadata.baselineAt=nowIso(); state.metadata.baselineLabel=obj.label || `Privater Import ${fileName}`;
    } else {
      throw new Error('Diese Datei ist keine Nessa-Sicherung bzw. kein privates Importpaket.');
    }
    state.settings ||= {fontSize:23,showChanges:true}; state.notes ||= [];
    currentChapterIndex=0; activeBlockId=null; editMode=false; dirtySinceSnapshot=false;
    await persist(false); applySettings(); render(); await createSnapshot('Privater Projektstand importiert'); toast('Privater Projektstand lokal geladen');
  }

  function download(name, content, mime='text/plain;charset=utf-8') {
    const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
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

  function exportChatGPT() {
    if (!state?.book) return toast('Noch kein Arbeitsmaster geladen');
    const open=state.notes.filter(n=>n.type==='followup'&&!n.resolved);
    const changes=changedBlocks();
    const lines=[];
    lines.push('# NESSA-SNAPE – EXPORT FÜR CHATGPT','',`Export: ${new Date().toLocaleString('de-DE')}`,'',
      '## Arbeitsauftrag / wichtige Hinweise','',
      'Dieser Export stammt aus der lokalen Nessa-Schreib-PWA. Bitte behandle den enthaltenen Arbeitsmaster als aktuellen Romanstand. Prüfe insbesondere die unten markierten Folgeprüfungen im gesamten Arbeitsmaster und – soweit relevant – in der Storybibliothek und im Revisionsstand.','');
    lines.push('## Offene Folgeprüfungen','');
    if(!open.length) lines.push('_Keine offenen Folgeprüfungen._','');
    for(const n of open){ const ch=state.book.chapters.find(c=>c.id===n.chapterId); const b=ch?.blocks.find(x=>x.id===n.blockId); lines.push(`### Kapitel ${ch?.number ?? '?'} – ${ch?.title ?? ''}`,`**Hinweis:** ${n.text}`,`**Bezug:** ${blockExcerpt(b,260)}`,''); }
    lines.push('## Eigene Änderungen seit dem Basisstand','');
    if(!changes.length) lines.push('_Keine lokal markierten Textänderungen seit dem Basisstand._','');
    for(const {chapter,block} of changes){ lines.push(`### Kapitel ${chapter.number} – ${chapter.title}`,`**Vorher:** ${block.baselineText || '— neu eingefügt —'}`,`**Jetzt:** ${block.text}`,''); }
    lines.push('\n---\n','# AKTUELLER ARBEITSMASTER','',buildMaster(state.book));
    lines.push('\n---\n','# AKTUELLE STORYBIBLIOTHEK','',state.library?.text || '_Nicht importiert._');
    lines.push('\n---\n','# AKTUELLER REVISIONSSTAND','',state.revisions?.text || '_Nicht importiert._');
    download(`NESSA_FUER_CHATGPT_${dateStamp()}.md`,lines.join('\n'),'text/markdown;charset=utf-8');
  }

  function dateStamp(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

  async function acceptBaseline(){
    if(!state?.book) return;
    const ok=await confirmBox('Stand übernehmen','Alle derzeit grün markierten Textänderungen werden zum neuen Basisstand. Die Texte bleiben erhalten; nur die Änderungsmarkierung wird zurückgesetzt. Vorher wird automatisch eine lokale Version gespeichert.');
    if(!ok) return;
    await createSnapshot('Vor Stand übernehmen');
    for(const ch of state.book.chapters) for(const b of ch.blocks) if(b.type==='p'){ b.baselineText=b.text; b.changed=false; }
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
    window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installPrompt=e; });
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden' && state) persist(false); });
  }

  async function init(){
    db=await openDb();
    state=await dbGet('state',PROJECT_KEY) || baseState();
    applySettings(); bindEvents(); render(); renderProjectStatus(); renderSnapshots();
    if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./sw.js'); }catch(err){ console.warn('Service Worker konnte nicht registriert werden',err); } }
  }

  init().catch(err=>{ console.error(err); alert('Die App konnte nicht gestartet werden: '+err.message); });
})();
