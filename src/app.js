import { verbForm, keyFor } from './sentence-grammar.js';
import { CORE_VOCAB, PRESETS, createLanguage, generateWord, regenerateLanguage, translateText, composeSentence, validateLanguage, exportCSV, generateNames, applySoundChange, renderWriting } from './engine.js';
import { translateSentence } from './sentence-translator.js';
import { createLanguageGenerator } from './language-generator.js';
import { WRITING_PRESETS, applyWritingPreset, identifyWritingPreset } from './writing-presets.js';
import { SCENES, CHARACTERS, getSceneEpisode, getSceneEpisodes } from './scenes.js';
import { ensureSceneVocabulary } from './scene-language.js';
import { ScenePlayer, renderSceneRoom } from './scene-player.js';
import { loadProject, saveProject, RECOVERY_STORAGE_KEY } from './storage.js';
import { TextAudio } from './text-audio.js';
import { CLOUD_CONFIG } from './cloud-config.js';
import { createCloudService } from './cloud-service.js';
import { CloudLibrary } from './cloud-library.js';
import { mountCloudUI } from './cloud-ui.js';
import { mountLanguageTools, updateWordDetails, serializePortableLanguage } from './language-ui.js';

const $ = id => document.getElementById(id);
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const uid = () => `lang-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const WORDS_PER_PAGE = 15;
const generateLanguage = createLanguageGenerator(CLOUD_CONFIG);
const SCENE_HIDDEN_KEY = 'elseword-scene-hidden-v1';
let storage;
try { storage = localStorage; } catch { storage = {getItem:()=>null,setItem:()=>{throw new Error('Your browser has disabled local storage. Export a backup to keep your work.');}}; }
for(const id of ['writing-alphabet','writing-lookup']){
  const panel=$(id), key=`elseword-${id}-open-v1`;
  try { panel.open=storage.getItem(key)==='true'; } catch { /* Keep optional tools usable without storage. */ }
  panel.addEventListener('toggle',()=>{try { storage.setItem(key,String(panel.open)); } catch { /* The current page still remembers this choice. */ }});
}
const textAudio = new TextAudio({storage});
textAudio.subscribe(({enabled,supported,ready}) => {
  const button=$('text-sound-toggle');
  button.textContent=supported?`♪ SFX ${enabled?'ON':'OFF'}`:'SFX N/A';
  button.disabled=!supported;
  button.setAttribute('aria-pressed',String(enabled&&supported));
  button.setAttribute('aria-label',supported?(enabled?'Mute text sounds':'Enable text sounds'):'Text sounds unavailable');
  button.dataset.soundState=!supported?'unavailable':!enabled?'muted':ready?'ready':'waiting';
  button.title=!supported?'This browser does not support text sounds.':enabled&&!ready?'Retro text sounds start after your first interaction.':enabled?'Mute text sounds across the studio.':'Enable text sounds across the studio.';
});
$('text-sound-toggle').onclick=()=>{textAudio.setEnabled(!textAudio.enabled);if(textAudio.enabled)void textAudio.unlock();};
let project = loadProject(storage);
let vocabularyUpdated = false;
project.languages = project.languages.map(item => {
  const updated = ensureSceneVocabulary(item);
  if (updated.words.length !== item.words.length) vocabularyUpdated = true;
  return updated;
});
let history = [], view = 'world', sceneId = 'bakery', castOverrides = {}, episodeSelections = {}, page = 0, onlyLocked = false, namesRoll = 0, player, cloudUI, languageTools;
let sentenceText = '', glossText = '', toastTimer, resumeAfterDialog = false, focusDialogueAfterDialog = false;
let sceneMaker, makerLoading, makerOpen=false, makerEpoch=0;
let sceneCollapsed=false, resumeAfterCollapse=false;
try { sceneCollapsed=storage.getItem(SCENE_HIDDEN_KEY)==='true'; } catch { /* Display preferences are optional when storage is blocked. */ }
const worldPreviewAvailable=()=>view==='world'&&!makerOpen&&!sceneCollapsed&&!$('studio-dialog').open;
function renderSceneVisibility(){
  $('world-scene-content').hidden=sceneCollapsed;
  $('world-browser').classList.toggle('is-scene-collapsed',sceneCollapsed);
  $('toggle-scene-window').setAttribute('aria-expanded',String(!sceneCollapsed));
  $('toggle-scene-window').textContent=sceneCollapsed?'Show scene':'Hide scene';
}
const playGenerated = (text,delay=0) => textAudio.playText(String(text??''),{delay});
const language = () => project.languages.find(item => item.id === project.activeId) ?? project.languages[0];
const currentScene = () => getSceneEpisode(sceneId, episodeSelections[sceneId] ?? 'original');
const currentCast = () => castOverrides[sceneId] ?? currentScene().characters;
const byEnglish = (key) => language().words.find(word => word.english.toLocaleLowerCase() === key.toLocaleLowerCase());

function notify(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{$('toast').hidden=true;},4200); }
function save() {
  try { saveProject(storage,project); $('save-status').innerHTML='<i></i> Saved on this device'; $('save-status').classList.remove('error'); }
  catch(error) { $('save-status').textContent='Not saved · export a backup'; $('save-status').classList.add('error'); notify(error.message); }
}
function checkpoint() { history.push(clone({languages:project.languages,activeId:project.activeId})); if(history.length>20)history.shift(); $('undo-button').disabled=false; }
function commit(next, message, {render=true}={}) {
  let valid;
  try { valid=validateLanguage(next); } catch(error) { notify(error.message); return false; }
  clearTranslation(); checkpoint(); project.languages=project.languages.map(item=>item.id===project.activeId?valid:item); project.activeId=valid.id; save();
  if(render)renderAll(); else {renderSummary();player?.refresh();languageTools?.refresh();}
  if(message)notify(message); return true;
}
function option(value,label,selected=false) {return `<option value="${escapeHTML(value)}"${selected?' selected':''}>${escapeHTML(label)}</option>`;}
function sprite(character,extra='') {return `<span class="sprite-portrait ${extra}" role="img" aria-label="${escapeHTML(character.name)}" style="background-image:url('${character.atlas}');background-position:0 ${character.row*100}%"></span>`;}
function showView(next) {
  textAudio.stop();
  if(next==='editor') { if(!makerOpen){showView('world');void openMaker();} return; }
  if(!['world','words','rules','writing'].includes(next))next='world'; view=next;
  makerEpoch++;
  if(makerOpen)sceneMaker?.close();
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${next}`);
  document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===next); if(el.dataset.view===next)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  if(worldPreviewAvailable()){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)player?.play();}else player?.pause();
  if(next==='words')renderDictionary(); if(next==='rules')renderRules();if(next==='writing')renderWritingPanel();
  window.history.replaceState(null,'',`#${next}`);
}
function renderSummary() {
  const lang=language();
  $('language-switch').innerHTML=project.languages.map(item=>option(item.id,item.name,item.id===lang.id)).join('');
  $('world-language-name').value=lang.name;
  $('word-count').textContent=`${lang.words.length} words`;
  $('language-sound').textContent=`${lang.grammar.order} · ${PRESETS.find(p=>p.id===lang.preset)?.name??'Custom'} sounds`;
  $('dictionary-language-heading').textContent=lang.name.toUpperCase();
  cloudUI?.refresh();
}
function renderScenePicker() {
  $('scene-grid').innerHTML=SCENES.map((scene,index)=>`<button class="scene-card ${scene.id===sceneId?'selected':''}" data-scene="${scene.id}" aria-pressed="${scene.id===sceneId}" aria-label="Visit ${escapeHTML(scene.name)}"><span class="scene-thumb" aria-hidden="true">${renderSceneRoom(scene.id)}</span><span class="scene-card-name">${escapeHTML(scene.name)}</span><span class="scene-card-tag">${String(index+1).padStart(2,'0')} / ${escapeHTML(scene.id==='busstop'?'Weather':scene.id==='bakery'?'Food':scene.id==='market'?'Shopping':scene.id==='library'?'Books':scene.id==='cafe'?'Small talk':scene.id==='tickets'?'Travel':scene.id==='rooftop'?'Night sky':'Remedies')}</span></button>`).join('');
  $('scene-description').textContent=currentScene().tag;
  $('scene-count').textContent=`${currentScene().lines.length} lines · ${currentScene().words.length} words`;
  $('conversation-count').textContent=`${SCENES.length} rooms · ${SCENES.reduce((total, scene) => total + getSceneEpisodes(scene.id).length, 0)} conversations`;
}
function contextWords() {
  const stop=new Set(['a','the','is','are','i','you','it','this','that','has','will','do','of','on','in','to','and','all','an','my','your','we','how','yes','no']);
  const keys=currentScene().words;
  const priority=keys.filter(key=>!stop.has(key));
  const unique=[...new Set([...priority,...keys])].slice(0,6);
  return unique.map(byEnglish).filter(Boolean);
}
function renderContextWords() {
  $('context-words').innerHTML=contextWords().map(word=>`<div class="context-word"><label for="context-${word.id}">${escapeHTML(word.english)}</label><input id="context-${word.id}" data-context-word="${escapeHTML(word.id)}" value="${escapeHTML(word.word)}" maxlength="80" autocomplete="off" spellcheck="false" aria-label="Word for ${escapeHTML(word.english)}"></div>`).join('');
  if(!contextWords().length)$('context-words').innerHTML='<p class="small-note">Add scene vocabulary in Words to give these lines a voice.</p>';
}
function renderCast() { $('cast-preview').innerHTML=currentCast().map(id=>{const c=CHARACTERS.find(c=>c.id===id);return `<div class="cast-mini">${sprite(c)}<div><strong>${c.name}</strong><small>${escapeHTML(c.title)}</small></div></div>`;}).join(''); }
function selectScene(id) {sceneId=id;renderScenePicker();renderContextWords();renderCast();player.setScene(id,currentCast(),episodeSelections[id]??'original');}
function episodeChanged({sceneId: locationId,episodeId}) {
  episodeSelections[locationId]=episodeId;
  if(locationId===sceneId){renderScenePicker();renderContextWords();}
}
function filteredWords() {
  const query=$('word-search').value.trim().toLocaleLowerCase();const category=$('category-filter').value;
  const words=language().words.filter(word=>(!category||word.category===category)&&(!onlyLocked||word.locked)&&(!query||[word.english,word.word,word.notes].some(v=>v?.toLocaleLowerCase().includes(query))));
  const sort=$('word-sort')?.value;
  return sort&&sort!=='original'?words.sort((a,b)=>a[sort].localeCompare(b[sort])||a.english.localeCompare(b.english)):words;
}
function renderDictionary() {
  const category=$('category-filter').value;
  $('category-filter').innerHTML=option('','All categories')+[...new Set(language().words.map(w=>w.category))].sort().map(value=>option(value,value,category===value)).join('');
  const all=filteredWords();const pages=Math.max(1,Math.ceil(all.length/WORDS_PER_PAGE));page=Math.max(0,Math.min(page,pages-1));
  $('dictionary-body').innerHTML=all.slice(page*WORDS_PER_PAGE,(page+1)*WORDS_PER_PAGE).map(word=>`<tr><td><button class="word-detail text-button" data-edit-word="${escapeHTML(word.id)}" title="Edit details for ${escapeHTML(word.english)}" style="color:var(--ink);font-size:12px;text-align:left;white-space:normal">${escapeHTML(word.english)}</button></td><td><input class="dictionary-input" data-dictionary-word="${escapeHTML(word.id)}" aria-label="Translation of ${escapeHTML(word.english)}" value="${escapeHTML(word.word)}" maxlength="80" spellcheck="false"></td><td>${escapeHTML(word.pos)}</td><td><button class="keep-button" data-keep="${escapeHTML(word.id)}" aria-label="${word.locked?'Release':'Keep'} ${escapeHTML(word.english)}" aria-pressed="${word.locked}" title="${word.locked?'Kept during regeneration':'Can be regenerated'}">${word.locked?'◆':'◇'}</button></td><td><button class="reroll-button" data-reroll="${escapeHTML(word.id)}" aria-label="Regenerate ${escapeHTML(word.english)}" title="Generate another word" ${word.locked?'disabled':''}>↻</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty-state">No words here yet. Try another search or add your own.</td></tr>';
  $('dictionary-count').textContent=`${all.length?`${page*WORDS_PER_PAGE+1}–${Math.min((page+1)*WORDS_PER_PAGE,all.length)} of ${all.length}`:'0'} words`;
  $('page-label').textContent=`${page+1} / ${pages}`;$('prev-page').disabled=page===0;$('next-page').disabled=page>=pages-1;
  $('locked-filter').setAttribute('aria-pressed',onlyLocked);
  const filters=[$('category-filter').value,onlyLocked?'Kept words':''].filter(Boolean);
  const sortName=$('word-sort').selectedOptions[0]?.textContent??'Original order';
  $('dictionary-filter-summary').textContent=`${filters.join(' · ')||'All words'} · ${sortName}`;
}
function setWord(id,value) {
  const next=clone(language());const word=next.words.find(w=>w.id===id);if(!word)return;
  const clean=value.trim();if(!clean){notify('A word needs at least one character.');renderContextWords();renderDictionary();return;}
  if(clean===word.word)return;word.word=clean;word.locked=true;delete word.family;
  if(commit(next,null,{render:false})){renderContextWords();renderDictionary();renderSentence();renderGloss();playGenerated(clean);}
}
function renderRules() {
  const lang=language();
  $('preset-grid').innerHTML=PRESETS.map((p,i)=>`<button class="preset-card" data-preset="${p.id}" aria-pressed="${lang.preset===p.id}"><span class="preset-mark">${['~','⌁','≋','⋇'][i]}</span><strong>${p.name}</strong><small>${['Gentle & flowing','Short & sharp','Warm & grounded','A little unfamiliar'][i]}</small></button>`).join('');
  $('sound-preview').innerHTML=Array.from({length:5},(_,i)=>`<span>${escapeHTML(generateWord(lang,`preview-${i}`,lang.revision))}</span>`).join('');
  $('consonants').value=lang.sounds.consonants.join(' ');$('vowels').value=lang.sounds.vowels.join(' ');$('min-syllables').value=lang.sounds.minSyllables;$('max-syllables').value=lang.sounds.maxSyllables;$('language-seed').value=lang.seed;
  document.querySelectorAll('.pattern-options input').forEach(input=>input.checked=lang.sounds.patterns.includes(input.value));
  $('kept-count').textContent=`${lang.words.filter(w=>w.locked).length} kept words will stay the same.`;
  $('word-order').value=lang.grammar.order;$('adjective-order').value=lang.grammar.adjective;
  for(const key of ['plural','past','future','negative','question'])$(`grammar-${key}`).value=lang.grammar[key];
  $('rules-language-name').textContent=lang.name;
  const example=composeSentence({subject:'i',verb:'see',object:'moon',adjective:'big'},lang);
  $('grammar-example').textContent=renderWriting(example.text,lang);$('grammar-example').dir=lang.script.direction;
  $('grammar-tokens').innerHTML=Array.from(lang.grammar.order).map(slot=>`<span class="token">${escapeHTML(example.slots[slot]??'…')}<small>${({S:'WHO',V:'ACTION',O:'WHAT'})[slot]}</small></span>`).join('');
}
function applySounds() {
  const next=clone(language());next.sounds={...next.sounds,consonants:$('consonants').value.trim().split(/\s+/).filter(Boolean),vowels:$('vowels').value.trim().split(/\s+/).filter(Boolean),patterns:[...document.querySelectorAll('.pattern-options input:checked')].map(input=>input.value),minSyllables:Number($('min-syllables').value),maxSyllables:Number($('max-syllables').value)};next.seed=$('language-seed').value.trim();
  if(commit(next,'Sound settings saved. Generate vocabulary when you’re ready.'))playGenerated($('sound-preview').textContent);
}
function renderSentenceSelectors() {
  const lang=language();
  const sets={subject:lang.words.filter(w=>['pronoun','noun'].includes(w.pos)),verb:lang.words.filter(w=>w.pos==='verb' && (verbForm(lang,w.english)?.root ?? keyFor(w.english))===keyFor(w.english)),object:lang.words.filter(w=>w.pos==='noun'),adjective:lang.words.filter(w=>w.pos==='adjective')};
  const defaults={subject:'i',verb:'see',object:'moon',adjective:'big'};
  for(const [kind,words] of Object.entries(sets)){
    const control=$(`sentence-${kind}`),previous=control.value;
    const optional=kind==='adjective'||kind==='object';
    const selected=control.dataset.initialized?previous:defaults[kind];
    control.innerHTML=(optional?option('','None',selected===''):'')+words.map(w=>option(w.english,w.english,w.english===selected)).join('');
    if((optional&&previous==='')&&control.dataset.initialized)control.value='';
    control.dataset.initialized='true';
  }
}
function sentenceOptions() {return {subject:$('sentence-subject').value,verb:$('sentence-verb').value,object:$('sentence-object').value,adjective:$('sentence-adjective').value,tense:$('sentence-tense').value,plural:$('sentence-plural').checked,negative:$('sentence-negative').checked,question:$('sentence-question').checked};}
function renderSentence({sound=false}={}) {
  const lang=language();const result=composeSentence(sentenceOptions(),lang);sentenceText=renderWriting(result.text,lang);
  $('sentence-language-label').textContent=`${lang.name.toUpperCase()} · ${lang.grammar.order}`;
  $('sentence-result').textContent=sentenceText;$('sentence-result').dir=lang.script.direction;
  $('sentence-english').textContent=result.error||result.english;
  $('sentence-english').setAttribute('aria-live','polite');
  $('copy-sentence').disabled=!sentenceText;
  $('sentence-tokens').innerHTML=result.tokens.map(token=>`<span class="token">${escapeHTML(token.text)}</span>`).join('');
  if(sound)playGenerated(sentenceText);
}
function renderAlphabet() {
  const lang=language(), presetId=identifyWritingPreset(lang.script);
  $('script-style').innerHTML=WRITING_PRESETS.map(preset=>`<option value="${preset.id}">${escapeHTML(preset.name)}</option>`).join('')+'<option value="custom">My own symbols</option>';
  $('script-style').value=presetId;$('script-direction').value=lang.script.direction;
  $('alphabet-current-style').textContent=`${WRITING_PRESETS.find(preset=>preset.id===presetId)?.name??'My own symbols'}${lang.script.direction==='rtl'?' · Right to left':''}`;
  $('script-description').textContent=WRITING_PRESETS.find(preset=>preset.id===presetId)?.description??'Your own alphabet. Edit any symbol below.';
  $('alphabet-preview').textContent=renderWriting('a b c d e f g h i j k l m n o p q r s t u v w x y z',lang);$('alphabet-preview').dir=lang.script.direction;
  const letters=[...new Set([...'abcdefghijklmnopqrstuvwxyz',...lang.sounds.consonants,...lang.sounds.vowels])];
  $('glyph-editor').innerHTML=letters.map(letter=>`<label>${escapeHTML(letter)}<input data-glyph="${escapeHTML(letter)}" maxlength="16" aria-label="Symbol for ${escapeHTML(letter)}" value="${escapeHTML(lang.script.glyphs[letter]??'')}" placeholder="${escapeHTML(renderWriting(letter,lang))}"></label>`).join('');
}
function renderGloss({sound=false}={}) {
  const lang=language(), result=translateText($('gloss-input').value,lang);glossText=result.tokens.map(token=>token.known?renderWriting(token.text,lang):token.text).join('');
  $('gloss-language-label').textContent=lang.name;
  $('gloss-output').innerHTML=result.tokens.map(token=>token.known?escapeHTML(renderWriting(token.text,lang)):`<button type="button" class="unknown-token" data-add-meaning="${escapeHTML(token.source)}" title="Add this word to your dictionary">${escapeHTML(token.text)}</button>`).join('');$('gloss-output').dir=lang.script.direction;
  $('unknown-words').textContent=result.unknown.length?`Click an unknown word to add it: ${result.unknown.join(', ')}.`:'Every word found in your dictionary.';
  if(sound)playGenerated(glossText,150);
}
function renderWritingPanel() {renderSentenceSelectors();renderSentence();renderAlphabet();renderGloss();}
function renderNames({sound=false}={}) {const temp={...language(),revision:language().revision+namesRoll};const names=generateNames(temp,6,$('name-kind').value);$('generated-names').innerHTML=names.map(name=>`<div class="generated-name"><span>${escapeHTML(name)}</span><button data-copy-name="${escapeHTML(name)}" aria-label="Copy ${escapeHTML(name)}">↗</button></div>`).join('');if(sound)playGenerated(names.join(' '));}
function renderAll() {clearTranslation();renderSummary();renderScenePicker();renderContextWords();renderCast();renderDictionary();renderRules();renderWritingPanel();renderNames();player?.refresh();languageTools?.refresh();}

function openDialog(title,body,actions='') {
  textAudio.stop();
  if(!$('studio-dialog').open){resumeAfterDialog=player?.paused===false;player?.pause();}
  $('dialog-content').innerHTML=`<div class="dialog-inner"><div class="dialog-head"><h2 id="studio-dialog-title">${escapeHTML(title)}</h2><button class="icon-button" data-close aria-label="Close dialog">×</button></div>${body}<p class="modal-error" id="modal-error" role="alert"></p>${actions?`<div class="dialog-actions">${actions}</div>`:''}</div>`;
  $('studio-dialog').setAttribute('aria-labelledby','studio-dialog-title');
  if(!$('studio-dialog').open)$('studio-dialog').showModal();
}
function closeDialog() {$('studio-dialog').close();}
function sceneWordDialog(token) {
  if(token.kind!=='word'||!token.key)return;
  const existing=language().words.find(word=>word.id===token.wordId)??byEnglish(token.key);
  const suffixes=(token.suffixes??[]).filter(suffix=>suffix.text);
  const inflection=suffixes.length?`In this line: ${token.text}. The ${suffixes.map(suffix=>`${suffix.marker} ending “${suffix.text}”`).join(' and ')} comes from Rules. Edit the base word below.`:'Changes apply everywhere this word is used.';
  openDialog(token.key,`<p class="scene-word-meaning">${escapeHTML(existing?.pos??'Missing from your dictionary')} · ENGLISH MEANING</p><label class="scene-word-field">${escapeHTML(language().name)} word<input id="scene-word-value" value="${escapeHTML(existing?.word??'')}" placeholder="Give this meaning a word" maxlength="80" spellcheck="false" autofocus></label><p class="small-note scene-word-note">${escapeHTML(inflection)}</p>`,`<button id="replay-word-line" class="secondary-button">Replay line</button><button id="save-scene-word" class="primary-button">Save &amp; replay</button>`);
  focusDialogueAfterDialog=true;
  const replay=()=>{
    player.replayLine();
    resumeAfterDialog=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    focusDialogueAfterDialog=true;
    closeDialog();
  };
  $('replay-word-line').onclick=replay;
  $('save-scene-word').onclick=()=>{
    try {
      const value=$('scene-word-value').value.trim();
      if(!value)throw new Error('Give this meaning a word first.');
      if(value!==existing?.word){
        const next=clone(language());
        if(existing)next.words=next.words.map(word=>word.id===existing.id?{...word,word:value,locked:true}:word);
        else {
          const original=CORE_VOCAB.find(word=>word.english===token.key);
          next.words.push({id:`word-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,english:token.key,word:value,pos:original?.pos??'noun',category:original?.category??'Scenes',notes:'',locked:true});
        }
        validateLanguage(next);
        if(!commit(next,null,{render:false}))return;
        renderContextWords();renderDictionary();renderSentence();renderGloss();
        notify(`“${token.key}” saved. Undo is available.`);
      }
      replay();
    }catch(error){$('modal-error').textContent=error.message;}
  };
  $('scene-word-value').onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();$('save-scene-word').click();}};
}
function addCreatedLanguage(fresh) {
  if(project.languages.length>=50)throw new Error('You can keep 50 languages on this device. Export and remove one first.');
  fresh.id=uid();checkpoint();project.languages.push(fresh);project.activeId=fresh.id;page=0;save();closeDialog();renderAll();showView('world');player.replay();if(!worldPreviewAvailable())player.pause();notify(`${fresh.name} created.`);
}
function clearTranslation() {
  $('translation-result').hidden=true;$('translation-output').textContent='';$('translation-status').textContent='';$('copy-translation').disabled=true;
}
$('translate-input').oninput=clearTranslation;
$('translate-english').onclick=()=>{
  clearTranslation();
  const result=translateSentence(language(),$('translate-input').value);
  if(!result.supported){$('translation-status').textContent=result.warnings.join(' ');return;}
  if(result.addedWords.length&&!commit(result.language,null))return;
  const text=renderWriting(result.text,language());
  $('translation-output').textContent=text;$('translation-output').dir=language().script.direction;$('translation-result').hidden=false;
  $('translation-status').textContent=[result.addedWords.length?`Added ${result.addedWords.map(word=>word.english).join(', ')} to your dictionary. Undo is available.`:'Used your existing dictionary.',...result.warnings].join(' ');
  $('copy-translation').disabled=false;playGenerated(text);
};
$('copy-translation').onclick=async()=>{
  try{await navigator.clipboard.writeText($('translation-output').textContent);notify('Translation copied.');}
  catch{notify('Copy is unavailable. Select the translation and copy it manually.');}
};
function newLanguageDialog() {
  openDialog('Create a language',`<p class="dialog-intro">Generate a language with its own sounds, words and grammar. Everything is yours to edit.</p><p class="small-note">Generation needs an internet connection. No account needed.</p><details class="advanced"><summary>Choose your own starting point</summary><div class="advanced-body"><div class="form-grid"><label>Language name<input id="new-name" value="" placeholder="Language name" maxlength="40"></label><label>Starting sound<select id="new-preset">${PRESETS.map(p=>option(p.id,p.name)).join('')}</select></label></div><label>Seed <span class="footnote">Same seed, same starting words</span><input id="new-seed" value="${Date.now().toString(36)}" maxlength="80"></label><button class="secondary-button" id="confirm-create">Create from these settings</button></div></details>`,`<button class="secondary-button" data-close>Cancel</button><button class="primary-button" id="generate-language">Generate language</button>`);
  const generateButton=$('generate-language'), manualButton=$('confirm-create'), errorBox=$('modal-error');
  generateButton.onclick=async()=>{
    if(project.languages.length>=50){errorBox.textContent='You can keep 50 languages on this device. Export and remove one first.';return;}
    generateButton.disabled=true;manualButton.disabled=true;generateButton.textContent='Generating…';errorBox.textContent='';
    try {
      const fresh=await generateLanguage(project.languages.map(item=>item.seed));
      if(!$('studio-dialog').open||$('generate-language')!==generateButton)return;
      addCreatedLanguage(fresh);
    } catch(error) {
      if($('studio-dialog').open&&$('generate-language')===generateButton)errorBox.textContent=error.message;
    } finally {generateButton.disabled=false;manualButton.disabled=false;generateButton.textContent='Generate language';}
  };
  manualButton.onclick=()=>{
    try{addCreatedLanguage(createLanguage({name:$('new-name').value.trim()||'Untitled language',preset:$('new-preset').value,seed:$('new-seed').value.trim()||Date.now().toString(36)}));}
    catch(error){errorBox.textContent=error.message;}
  };
}
function editWordDialog(id,meaning='') {
  const existing=id?language().words.find(w=>w.id===id):null;
  const word=existing??{english:meaning,word:'',pos:'noun',category:'Custom',notes:''};
  openDialog(existing?'Edit word':'Add word',`<div class="form-grid"><label>English meaning<input id="edit-english" value="${escapeHTML(word.english)}" maxlength="80" ${existing?'readonly':''}></label><label>${escapeHTML(language().name)}<input id="edit-translation" value="${escapeHTML(word.word)}" placeholder="Your word" maxlength="80"></label><label>Word type<select id="edit-pos">${[...new Set(['noun','verb','adjective','adverb','pronoun','particle','number','phrase','question',word.pos])].map(pos=>option(pos,pos,word.pos===pos)).join('')}</select></label><label>Category<input id="edit-category" value="${escapeHTML(word.category)}" maxlength="60"></label></div><label>Notes<textarea id="edit-notes" maxlength="500" rows="2">${escapeHTML(word.notes)}</textarea></label>`,`<button id="suggest-word" class="secondary-button">Suggest a word ↻</button><button id="save-word" class="primary-button">${existing?'Save word':'Add word'}</button>`);
  let salt=0;$('suggest-word').onclick=()=>{$('edit-translation').value=generateWord(language(),$('edit-english').value||'new-word',`${Date.now()}-${salt++}`);playGenerated($('edit-translation').value);};
  $('save-word').onclick=()=>{try{
    const next=clone(language());const english=$('edit-english').value.trim().toLocaleLowerCase();const translation=$('edit-translation').value.trim();if(!english||!translation)throw new Error('Give this word both a meaning and a translation.');
    if(!existing&&next.words.some(w=>w.english.toLocaleLowerCase()===english))throw new Error('That meaning already exists. Search for it in your dictionary.');
    const record={id:existing?.id??`word-${Date.now().toString(36)}`,english,word:translation,pos:$('edit-pos').value,category:$('edit-category').value.trim()||'Custom',notes:$('edit-notes').value.trim(),locked:true};
    const saved=existing?updateWordDetails(next,id,record):validateLanguage({...next,words:[...next.words,record]});
    if(commit(saved,`“${english}” saved.`))closeDialog();
  }catch(error){$('modal-error').textContent=error.message;}};
}
function download(content,filename,type) {const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const filename=()=>(language().name.replace(/[^\p{L}\p{N}_-]/gu,'-')||'language').slice(0,50);
async function copyText(text) {try{await navigator.clipboard.writeText(text);notify('Copied.');}catch{openDialog('Your text',`<p class="small-note">Select the text below to copy it.</p><textarea readonly rows="5">${escapeHTML(text)}</textarea>`);}}
function projectDialog() {
  openDialog('Language files',`<p class="dialog-intro">Your languages save in this browser. Download a file to keep a backup or use it on another device.</p><button class="menu-action" id="backup-language"><span>↓</span><span><strong>Download ${escapeHTML(language().name)}</strong><small>JSON · words, sound rules, grammar &amp; alphabet</small></span></button><button class="menu-action" id="import-language"><span>↑</span><span><strong>Import a language</strong><small>Open an Oddtongue JSON backup</small></span></button><button class="menu-action" id="duplicate-language"><span>＋</span><span><strong>Make a copy</strong><small>Duplicate this language</small></span></button><button class="menu-action" id="menu-csv"><span>↗</span><span><strong>Export dictionary</strong><small>Download a CSV file</small></span></button><button class="text-button danger-button" id="remove-language" style="margin-top:24px">Remove this language from this device</button>`);
  const cloudButton=document.createElement('button');cloudButton.className='menu-action';cloudButton.innerHTML='<span>☁</span><span><strong>Cloud library</strong><small>Optional account · save and open languages online</small></span>';cloudButton.onclick=()=>cloudUI.show();$('backup-language').before(cloudButton);
  let recoveryRaw=project.recoveryRaw;try{recoveryRaw??=storage.getItem(RECOVERY_STORAGE_KEY);}catch{}
  if(recoveryRaw){const button=document.createElement('button');button.className='menu-action';button.innerHTML='<span>↓</span><span><strong>Download recovered save</strong><small>The original data, before automatic recovery</small></span>';button.onclick=()=>download(recoveryRaw,'oddtongue-recovery.json','application/json');$('remove-language').before(button);}
  $('backup-language').onclick=()=>{try{download(serializePortableLanguage(language()),`${filename()}.json`,'application/json');notify('Language backup downloaded.');}catch(error){$('modal-error').textContent=error.message;}};
  $('import-language').onclick=()=>$('import-file').click();
  $('menu-csv').onclick=()=>download(exportCSV(language()),`${filename()}-dictionary.csv`,'text/csv;charset=utf-8');
  $('duplicate-language').onclick=()=>{if(project.languages.length>=50){$('modal-error').textContent='You can keep up to 50 languages.';return;}checkpoint();const fresh=clone(language());fresh.id=uid();fresh.name=`${fresh.name.slice(0,34)} (copy)`;project.languages.push(fresh);project.activeId=fresh.id;save();renderAll();closeDialog();notify('Language copied.');};
  $('remove-language').onclick=()=>{const name=language().name;openDialog(`Remove ${name}?`,`<p class="dialog-intro">This removes the language from this browser. You can undo it until you close or reload the studio.</p>`,`<button class="secondary-button" data-close>Keep it</button><button class="secondary-button danger-button" id="confirm-remove">Remove language</button>`);$('confirm-remove').onclick=()=>{checkpoint();project.languages=project.languages.filter(l=>l.id!==project.activeId);if(!project.languages.length)project.languages=[createLanguage()];project.activeId=project.languages[0].id;save();renderAll();closeDialog();notify('Language removed. Undo is available.');};};
}
function castDialog() {
  let slot=0;
  const draw=()=>{
    openDialog('Choose characters',`<p class="dialog-intro">Choose a character for each speaker.</p><div class="cast-slot-tabs" style="margin-top:20px"><button data-slot="0" class="${slot===0?'selected':''}">First speaker</button><button data-slot="1" class="${slot===1?'selected':''}">Second speaker</button></div><div class="cast-picker">${CHARACTERS.map(c=>`<button class="cast-choice" data-character="${c.id}" aria-pressed="${currentCast()[slot]===c.id}" title="${escapeHTML(c.description)}">${sprite(c)}<strong>${c.name}</strong><small>${escapeHTML(c.title)}</small></button>`).join('')}</div>`,`<button class="primary-button" data-close>Done</button>`);
    document.querySelectorAll('[data-slot]').forEach(button=>button.onclick=()=>{slot=Number(button.dataset.slot);draw();});
    document.querySelectorAll('[data-character]').forEach(button=>button.onclick=()=>{const next=[...currentCast()];next[slot]=button.dataset.character;castOverrides[sceneId]=next;player.setCast(next);renderCast();draw();});
  };draw();
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.view)showView(button.dataset.view);
  if(button.dataset.go)showView(button.dataset.go);
  if(button.hasAttribute('data-close'))closeDialog();
  if(button.dataset.scene)selectScene(button.dataset.scene);
  if(button.dataset.editWord)editWordDialog(button.dataset.editWord);
  if(button.dataset.addMeaning)editWordDialog(null,button.dataset.addMeaning);
  if(button.dataset.keep){const next=clone(language());const word=next.words.find(w=>w.id===button.dataset.keep);word.locked=!word.locked;commit(next);}
  if(button.dataset.reroll){try{const next=clone(language());const word=next.words.find(w=>w.id===button.dataset.reroll);if(!word.locked){delete word.family;word.word=generateWord(next,word.english,Date.now());if(commit(next))playGenerated(word.word);}}catch(error){notify(error.message);}}
  if(button.dataset.preset){const p=PRESETS.find(p=>p.id===button.dataset.preset);const next=clone(language());next.preset=p.id;next.sounds=clone(p.sounds);if(commit(next,`${p.name} sounds selected. Generate vocabulary to use them.`))playGenerated($('sound-preview').textContent);}
  if(button.dataset.copyName)copyText(button.dataset.copyName);
});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.contextWord)setWord(target.dataset.contextWord,target.value);
  if(target.dataset.dictionaryWord)setWord(target.dataset.dictionaryWord,target.value);
  if(target.dataset.glyph){const next=clone(language());next.script=applyWritingPreset(next.script,'custom');const value=target.value.trim();if(value)next.script.glyphs[target.dataset.glyph]=value;else delete next.script.glyphs[target.dataset.glyph];if(commit(next))playGenerated(sentenceText);}
});
$('language-switch').onchange=event=>{project.activeId=event.target.value;page=0;save();renderAll();};
$('new-language').onclick=newLanguageDialog;
$('project-menu').onclick=projectDialog;
$('world-language-name').onchange=event=>{const next=clone(language());next.name=event.target.value.trim()||language().name;commit(next);};
$('undo-button').onclick=()=>{if(!history.length)return;project={...project,...history.pop()};$('undo-button').disabled=!history.length;save();renderAll();notify('Last change undone.');};
$('word-search').oninput=()=>{page=0;renderDictionary();};$('category-filter').onchange=()=>{page=0;renderDictionary();};$('locked-filter').onclick=()=>{onlyLocked=!onlyLocked;page=0;renderDictionary();};
$('word-sort').onchange=()=>{page=0;renderDictionary();};
$('prev-page').onclick=()=>{page--;renderDictionary();};$('next-page').onclick=()=>{page++;renderDictionary();};$('add-word').onclick=()=>editWordDialog();
$('export-csv').onclick=()=>download(exportCSV(language()),`${filename()}-dictionary.csv`,'text/csv;charset=utf-8');
$('generate-names').onclick=()=>{namesRoll++;renderNames({sound:true});};$('name-kind').onchange=()=>renderNames({sound:true});
$('apply-sounds').onclick=applySounds;
$('regenerate').onclick=()=>{try{if(commit(regenerateLanguage(language()),'Vocabulary generated. Kept words are unchanged.'))playGenerated($('sound-preview').textContent);}catch(error){notify(error.message);}};
for(const [id,key] of [['word-order','order'],['adjective-order','adjective'],...['plural','past','future','negative','question'].map(key=>[`grammar-${key}`,key])])$(id).onchange=event=>{const next=clone(language());next.grammar[key]=event.target.value.trim();if(commit(next))playGenerated($('grammar-example').textContent);};
$('apply-change').onclick=()=>{try{if(commit(applySoundChange(language(),$('sound-from').value,$('sound-to').value),'Sound change applied. Undo is available.'))playGenerated($('sound-preview').textContent);}catch(error){notify(error.message);}};
for(const key of ['subject','verb','object','adjective','tense','plural','negative','question'])$(`sentence-${key}`).onchange=()=>renderSentence({sound:true});
$('script-style').onchange=event=>{const next=clone(language()), presetId=event.target.value;next.script=applyWritingPreset(next.script,presetId);if(commit(next)){playGenerated(sentenceText);if(presetId==='custom'){$('alphabet-editor').open=true;$('glyph-editor').querySelector('input')?.focus();}}};$('script-direction').onchange=event=>{const next=clone(language());next.script.direction=event.target.value;if(commit(next))playGenerated(sentenceText);};
$('gloss-input').oninput=()=>renderGloss({sound:true});$('copy-sentence').onclick=()=>copyText(sentenceText);$('copy-gloss').onclick=()=>copyText(glossText);$('change-cast').onclick=castDialog;
$('import-file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>1_000_000)throw new Error('Choose a language backup smaller than 1 MB.');if(project.languages.length>=50)throw new Error('You can keep up to 50 languages.');const parsed=validateLanguage(await file.text());parsed.id=uid();const imported=ensureSceneVocabulary(parsed);checkpoint();project.languages.push(imported);project.activeId=imported.id;save();renderAll();closeDialog();notify(`${imported.name} imported.`);}
  catch(error){if($('modal-error'))$('modal-error').textContent=error.message;else notify(error.message);}finally{event.target.value='';}
};
$('studio-dialog').addEventListener('click',event=>{if(event.target===$('studio-dialog')){const r=$('studio-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
$('studio-dialog').addEventListener('close',()=>{textAudio.stop();if(resumeAfterDialog&&worldPreviewAvailable())player?.play();resumeAfterDialog=false;if(focusDialogueAfterDialog){if(worldPreviewAvailable())document.querySelector('.scene-next')?.focus();focusDialogueAfterDialog=false;}});
window.addEventListener('hashchange',()=>showView(location.hash.slice(1)));
renderSceneVisibility();
renderAll();
player=new ScenePlayer($('player-host'),{getLanguage:language,onLine:()=>{},onEnd:()=>{},onEpisodeChange:episodeChanged,onWordSelect:sceneWordDialog,textAudio});
player.setScene(sceneId,currentCast());
if(sceneCollapsed){resumeAfterCollapse=!player.paused;player.pause();}
$('toggle-scene-window').onclick=()=>{
  if(!sceneCollapsed){resumeAfterCollapse=!player.paused;player.pause();}
  sceneCollapsed=!sceneCollapsed;
  renderSceneVisibility();
  try { storage.setItem(SCENE_HIDDEN_KEY,String(sceneCollapsed)); } catch { /* Keep the toggle usable even if this preference cannot be saved. */ }
  if(!sceneCollapsed&&resumeAfterCollapse&&worldPreviewAvailable()&&!matchMedia('(prefers-reduced-motion: reduce)').matches)player.play();
};
const cloudService=createCloudService(CLOUD_CONFIG);
const cloudLibrary=new CloudLibrary({service:cloudService,storage});
function closeMakerView(){
  makerOpen=false;$('scene-maker-host').hidden=true;$('world-browser').hidden=false;document.querySelector('.maker-entry').hidden=false;
  document.querySelector('.shell').classList.remove('editing-scene');
  $('view-world').querySelector('.page-heading').hidden=false;
  if(worldPreviewAvailable()&&!matchMedia('(prefers-reduced-motion: reduce)').matches)player?.play();
  if(view==='world')$('make-scene').focus();
  if(view==='world'){
    document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view==='world');if(el.dataset.view==='world')el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    window.history.replaceState(null,'','#world');
  }
}
async function openMaker(remix=false){
  if(remix&&currentScene().choice&&!player.choiceId){notify('Choose a reply before editing this conversation.');return;}
  const epoch=++makerEpoch, languageId=language().id;
  const options=remix?{room:sceneId,episodeId:episodeSelections[sceneId]??'original',choiceId:player.choiceId}:{room:sceneId};
  $('make-scene').disabled=true;$('remix-scene').disabled=true;$('scene-editor-tab').disabled=true;$('scene-editor-tab').textContent='Opening editor…';
  try {
    if(!makerLoading)makerLoading=Promise.all([import('./scene-maker.js'),import('./scene-project.js')]).then(async ([{mountSceneMaker},{validateSceneProject}])=>{
      if(!document.querySelector('link[data-maker-css]')){const css=document.createElement('link');css.rel='stylesheet';css.href='./scene-maker.css';css.dataset.makerCss='true';document.head.append(css);}
      return mountSceneMaker({host:$('scene-maker-host'),getLanguage:language,notify,cloudService:cloudService.forScenes(validateSceneProject),onClose:closeMakerView});
    }).catch(error=>{makerLoading=null;throw error;});
    sceneMaker=await makerLoading;
    if(epoch!==makerEpoch||view!=='world'||language().id!==languageId)return;
    player.pause();textAudio.stop();makerOpen=true;$('scene-maker-host').hidden=false;$('world-browser').hidden=true;document.querySelector('.maker-entry').hidden=true;
    document.querySelector('.shell').classList.add('editing-scene');
    $('view-world').querySelector('.page-heading').hidden=true;
    await sceneMaker.open(options);
    document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view==='editor');if(el.dataset.view==='editor')el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    window.history.replaceState(null,'','#editor');
  }catch(error){closeMakerView();notify(error.message);}
  finally{$('make-scene').disabled=false;$('remix-scene').disabled=false;$('scene-editor-tab').disabled=false;$('scene-editor-tab').textContent='Scene editor';}
}
$('make-scene').onclick=()=>void openMaker();$('remix-scene').onclick=()=>void openMaker(true);
cloudUI=mountCloudUI({library:cloudLibrary,service:cloudService,button:$('account-button'),getLanguage:language,openDialog,closeDialog,notify,
  openLocalCopy:document=>{
    if(project.languages.length>=50)throw new Error('This device already has 50 languages. Export and remove one before opening another.');
    const copy=validateLanguage({...clone(document),id:uid()});
    checkpoint();project.languages.push(copy);project.activeId=copy.id;page=0;save();renderAll();showView('world');return copy.id;
  }
});
void cloudLibrary.start();
languageTools=mountLanguageTools({getLanguage:language,commit,openDialog,closeDialog,notify,playGenerated});
showView(location.hash.slice(1)||'world');
if(project.warning){$('save-status').textContent='Saved data needs attention';$('save-status').classList.add('error');notify(project.warning);}
else if(vocabularyUpdated)save();
