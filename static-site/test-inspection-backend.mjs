import assert from "node:assert/strict";
import {BMP_SOURCE, featureRef, snapshotOf, readFields, buildSaveArgs, checkFields, explainError, savedResult, historyRow} from "./inspection-backend-core.mjs";

const bmpLayer = {title:'BMP_Database', portalItem:{id:BMP_SOURCE.item}, layerId:3, objectIdField:'OBJECTID_1'};
const graphic = {layer:bmpLayer, attributes:{OBJECTID_1:42, Facility_N:'Pond A', MDE_SF_Num:null}};

// Feature identity: portal item + layer id, or the known service URL.
assert.deepEqual(featureRef(graphic), {ok:true, sourceItem:BMP_SOURCE.item, layerId:3, objectId:'42'});
const byUrl = {layer:{url:`${BMP_SOURCE.serviceUrl}/3`, objectIdField:'OBJECTID_1'}, attributes:{OBJECTID_1:7}};
assert.equal(featureRef(byUrl).ok, true);
assert.equal(featureRef(byUrl).sourceItem, BMP_SOURCE.item);
const copiedItem = {layer:{url:BMP_SOURCE.serviceUrl, layerId:3, portalItem:{id:'ffffffffffffffffffffffffffffffff'}, objectIdField:'OBJECTID_1'}, attributes:{OBJECTID_1:7}};
assert.equal(featureRef(copiedItem).sourceItem, BMP_SOURCE.item); // Same service, different item: same features.
const sourceLayer = {sourceLayer:bmpLayer, attributes:{OBJECTID_1:5}};
assert.equal(featureRef(sourceLayer).objectId, '5');

// Wrong layer, missing selection, missing object ID: refused with a readable message.
const wrongLayer = featureRef({layer:{...bmpLayer, layerId:2}, attributes:{OBJECTID_1:42}});
assert.equal(wrongLayer.ok, false);
assert.match(wrongLayer.message, /layer 2/);
assert.match(featureRef({layer:{title:'Buildings', portalItem:{id:'abc'}, layerId:0, objectIdField:'OBJECTID'}, attributes:{OBJECTID:1}}).message, /Buildings/);
assert.match(featureRef(null).message, /No BMP is selected/);
assert.match(featureRef({layer:bmpLayer, attributes:{}}).message, /no object ID/);
assert.equal(featureRef({layer:bmpLayer, attributes:{OBJECTID_1:0}}).ok, false);
assert.equal(featureRef({layer:bmpLayer, attributes:{OBJECTID_1:'042'}}).objectId, '42'); // No leading zero reaches the database.

// Snapshot: JSON-safe and under the database limit.
assert.deepEqual(snapshotOf({attributes:{a:1, b:undefined, c:NaN, d:null, e:'x'}}), {a:1, b:null, c:null, d:null, e:'x'});
const huge = snapshotOf({attributes:{Facility_N:'Pond A', big:'s'.repeat(20000)}});
assert.deepEqual(huge, {Facility_T:null, Facility_N:'Pond A', MDE_SF_Num:null, UMBC_PRF:null});

// Fields from the real form (by input name) or from a plain object.
const form = {elements:{namedItem:name => ({inspection_type:{value:'Routine'}, inspection_result:{value:'Pass'}, observations:{value:'  ok  '}})[name] ?? null}};
assert.deepEqual(readFields(form), {inspectionType:'Routine', outcome:'Pass', notes:'  ok  '});
assert.deepEqual(readFields({inspectionType:'Routine', outcome:'fail', notes:''}), {inspectionType:'Routine', outcome:'fail', notes:''});

const args = buildSaveArgs('d1', featureRef(graphic), readFields(form), snapshotOf(graphic));
assert.equal(args.p_outcome, 'pass');
assert.equal(args.p_notes, 'ok');
assert.equal(args.p_layer_id, 3);
assert.equal(args.p_object_id, '42');
assert.equal(checkFields(args), null);
assert.equal(checkFields({...args, p_outcome:'needs verification'}).field, 'outcome');
assert.equal(checkFields({...args, p_inspection_type:''}).field, 'inspection_type');
assert.equal(checkFields({...args, p_notes:'n'.repeat(4001)}).field, 'notes');

// Database errors become plain English, and only a missing reply counts as "maybe saved".
assert.equal(explainError({code:'P0001', message:'invalid_input:outcome'}, 400).field, 'outcome');
assert.equal(explainError({code:'42501', message:'forbidden_domain'}, 403).kind, 'forbidden_domain');
assert.equal(explainError({code:'23505', message:'draft_conflict'}, 409).kind, 'draft_conflict');
assert.equal(explainError({code:'P0001', message:'unknown_source'}, 400).kind, 'unknown_source');
assert.equal(explainError({code:'42501', message:'permission denied for function create_inspection'}, 401).kind, 'signed_out');
assert.equal(explainError({code:'PGRST303', message:'JWT expired'}, 401).kind, 'signed_out');
const lost = explainError(null, 0);
assert.equal(lost.kind, 'network');
assert.equal(lost.maybeSaved, true);
assert.equal(explainError({code:'23505', message:'draft_conflict'}, 409).maybeSaved, false);
assert.equal(explainError(null, 0, 'load').maybeSaved, false);
for (const result of [lost, explainError({code:'P0001', message:'invalid_input:notes'})]) assert.ok(result.message.length > 10);

// Results for the page.
const saved = savedResult({id:'r1', submitted_at:'2026-10-28T02:51:07Z'});
assert.equal(saved.ok, true);
assert.equal(saved.alreadySaved, false);
assert.match(saved.message, /Saved at .*Record r1/);
assert.match(savedResult({id:'r1', submitted_at:'2026-10-28T02:51:07Z'}, true).message, /Already saved/);
assert.equal(historyRow({id:'r1', submitted_at:'2026-10-28T02:51:07Z', inspection_type:'Routine', outcome:'pass', notes:null}).notes, '');

console.log('PASS: feature identity, layer check, snapshot limits, form fields, client checks, error messages, results');
