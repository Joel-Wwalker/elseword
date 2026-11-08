// UI-only fixture: production builds copy src/, so this never ships with the app.
import { createLanguage } from '/src/engine.js';
import { CloudLibrary } from '/src/cloud-library.js';
import { mountCloudUI } from '/src/cloud-ui.js';
let user=null;
let local=createLanguage({name:'Preview language',seed:'ui-check'});
const rows=new Map(),listeners=new Set(),cache=new Map();
const clone=value=>structuredClone(value);
const $=id=>document.getElementById(id);
const failure=code=>Object.assign(new Error(code),{code});
const service={configured:true,googleEnabled:true,
  async getSession(){return user;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async signInEmail(){},async signInGoogle(){user={id:'11111111-1111-4111-8111-111111111111',email:'preview@example.test'};listeners.forEach(fn=>fn(user));},
  async signOut(){if($('fixture-signout-failure').checked){$('fixture-signout-failure').checked=false;throw failure('NETWORK');}user=null;listeners.forEach(fn=>fn(null));},
  async list(){return clone([...rows.values()].filter(row=>!row.deleted_at));},
  async save({id,document,expectedVersion,mutationId}){const current=rows.get(id);if(current?.lastMutation===mutationId)return clone(current);if((current?.version??null)!==expectedVersion)throw failure('CONFLICT');const result={id,document:clone(document),version:(expectedVersion??0)+1,updated_at:new Date().toISOString(),deleted_at:null,lastMutation:mutationId};rows.set(id,result);return clone(result);},
  async remove({id,expectedVersion}){const current=rows.get(id);if(current?.version!==expectedVersion)throw failure('CONFLICT');const result={...current,version:current.version+1,document:null,deleted_at:new Date().toISOString()};rows.set(id,result);return clone(result);}
};
const library=new CloudLibrary({service,storage:{getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)}});
function openDialog(title,body,actions=''){$('dialog-content').innerHTML=`<div class="dialog-inner"><div class="dialog-head"><h2 id="studio-dialog-title"></h2><button class="icon-button" data-close aria-label="Close dialog">×</button></div>${body}<p id="modal-error" class="modal-error" role="alert"></p><div class="dialog-actions">${actions}</div></div>`;$('studio-dialog-title').textContent=title;$('studio-dialog').setAttribute('aria-labelledby','studio-dialog-title');if(!$('studio-dialog').open)$('studio-dialog').showModal();}
const showLocal=()=>{$('fixture-local').textContent=`Local working language: ${local.name}`;};
mountCloudUI({library,service,button:$('account-button'),getLanguage:()=>local,openDialog,closeDialog:()=>$('studio-dialog').close(),notify:message=>{$('fixture-notice').textContent=message;},openLocalCopy:document=>{local={...clone(document),id:`lang-${crypto.randomUUID()}`};showLocal();return local.id;}});
document.addEventListener('click',event=>{if(event.target.closest('[data-close]'))$('studio-dialog').close();});
$('fixture-edit').onclick=()=>{local.name='My edited language';showLocal();};
$('fixture-conflict').onclick=()=>{for(const row of rows.values())if(!row.deleted_at){row.version++;row.document.name='From another device';} $('fixture-notice').textContent='Test: cloud version changed on another device.';};
showLocal();void library.start();
