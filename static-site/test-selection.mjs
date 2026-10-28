import assert from 'node:assert/strict';
class El {
  constructor(){this.hidden=false;this.textContent='';this.children=[];this.disabled=true;this.value='';this.listeners={};this.classList={add(){}};}
  addEventListener(name,fn){this.listeners[name]=fn;}
  removeEventListener(name){delete this.listeners[name];}
  append(...els){this.children.push(...els);}
  add(option){this.children.push(option);}
  replaceChildren(){this.children=[];}
  focus(){} scrollIntoView(){}
}
const ids = new Map();
globalThis.document = {getElementById(id){if(!ids.has(id))ids.set(id,new El());return ids.get(id);},createElement(){return new El();},querySelector(){return form;}};
globalThis.Option = class Option {constructor(text,value){this.text=text;this.value=value;}};
const formEls = new Map();
const form = new El();
form.elements={namedItem(name){if(!formEls.has(name))formEls.set(name,new El());return formEls.get(name);}};
const bmp = {id:'bmp',type:'feature',title:'Stormwater BMPs',fields:[{name:'BMP_TAG',alias:'BMP Tag'},{name:'BMP_TYPE',alias:'BMP Type'},{name:'LOC',alias:'Campus Location'},{name:'LOCATION',alias:'Location'}, {name:'OBJECTID',alias:'ObjectID'}],objectIdField:'OBJECTID',queryFeatures:async()=>({features:[{attributes:{BMP_TAG:'BMP-A4',BMP_TYPE:'Swale',LOCATION:'South lawn',OBJECTID:4}}]})};
const other={id:'buildings',type:'feature',title:'Campus Buildings'};
let hits=[{type:'graphic',graphic:{layer:bmp,attributes:{OBJECTID:4}}}];
const map=new El();
map.map={allLayers:{forEach(fn){[bmp,other].forEach(fn);}}};
map.hitTest=async()=>({results:hits});
map.fetchPopupFeatures=async()=>async function*(){}();
const {connectBmpSelection}=await import('./facility-ui.mjs');
connectBmpSelection(map);
ids.get("bmp-layer-select").value="auto";
async function click(){await map.listeners.arcgisViewClick({detail:{screenPoint:{x:0,y:0},pointerType:'mouse'}});}
await click();
assert.equal(ids.get('facility-tag').textContent,'BMP-A4');
assert.equal(formEls.get('asset_tag').value,'BMP-A4');
assert.equal(formEls.get('bmp_type').value,'Swale');
assert.equal(formEls.get('location').value,'South lawn');
assert.equal(ids.get('facility-selected').hidden,false);
assert.equal(ids.get('facility-attributes').children.length,4);
assert.equal(ids.get('start-inspection').disabled,false);
form.elements.namedItem('observations').value='Needs cleaning';
form.listeners.reset({preventDefault(){}});
assert.equal(formEls.get('observations').value,'');
assert.equal(formEls.get('asset_tag').value,'BMP-A4');
hits=[{type:'graphic',graphic:{layer:other,attributes:{BUILDING_NAME:'Admin Hall'}}}];
await click();
assert.equal(formEls.get('asset_tag').value,'BMP-A4');
assert.match(ids.get('selection-message').textContent,/No matching BMP/);
console.log('PASS: simulated map clicks, complete ArcGIS attribute retrieval, form prefill, safe clear, non-BMP rejection');
