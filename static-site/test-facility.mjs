import assert from "node:assert/strict";
import {extractFacility, isBmpFeature, normalizeKey} from "./facility.mjs";
const bmp = {id:'stormwater-bmps', type:'feature', title:'Stormwater BMP Facilities', objectIdField:'OBJECTID',fields:[
  {name:'BMP_TAG',alias:'BMP Tag'}, {name:'BMP_TYPE',alias:'BMP Type',domain:{codedValues:[{code:2,name:'Rain garden'}]}},
  {name:'CAMPUS_LOCATION',alias:'Campus Location'},{name:'INSPECTION_DATE',alias:'Inspection Date',type:'date'}, {name:'OBJECTID',alias:'Object ID'}]};
const raw = {layer:bmp, attributes:{BMP_TAG:'BMP-047',BMP_TYPE:2,CAMPUS_LOCATION:'Near the library',INSPECTION_DATE:1761600000000,OBJECTID:147,OBSERVATION:'Ponded water'}};
assert.equal(normalizeKey('BMP_Tag #'), 'bmptag');
assert.equal(isBmpFeature(raw), true);
const facility = extractFacility(raw, {latitude:39.253,longitude:-76.711});
assert.equal(facility.assetTag,'BMP-047');
assert.equal(facility.bmpType,'Rain garden');
assert.equal(facility.location,'Near the library');
assert.equal(facility.entries.length,6);
assert.equal(facility.rawAttributes.OBJECTID,147);
assert.match(facility.coordinates, /39\.253/);
const nonBmp={layer:{id:'buildings',type:'feature',title:'Buildings'},attributes:{NAME:'Library'}};
assert.equal(isBmpFeature(nonBmp),false);
assert.equal(isBmpFeature(nonBmp,'buildings'),true); // Explicit layer selection.
assert.equal(isBmpFeature(raw,'buildings'),false);
assert.equal(isBmpFeature(raw,'auto',['buildings']),false);
assert.equal(isBmpFeature(raw,'auto',['stormwater-bmps']),true);
const sparse=extractFacility({layer:bmp,attributes:{BMP_TAG:'T-12',BMP_TYPE:null,OBJECTID:0}});
assert.equal(sparse.bmpType,'');
assert.equal(sparse.assetTag,'T-12');
assert.equal(sparse.entries.length,2); // zero is still a real value.
console.log('PASS: attribute mapping, coded values, absent fields, filtering, zero values');
