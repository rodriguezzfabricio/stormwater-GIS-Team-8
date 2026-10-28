import assert from "node:assert/strict";
import {
  BMP_SOURCE, FORM_FIELDS, NON_UMBC_MESSAGE, featureRef, attributesOf, readFormSection, snapshotOf, readFields, buildSaveArgs,
  checkFields, explainError, savedResult, historyRow, isUmbcEmail
} from "./inspection-backend-core.mjs";

const bmpLayer = {title:'UMBC_BMP_ArcGIS_Import', portalItem:{id:BMP_SOURCE.item}, layerId:0, objectIdField:'OBJECTID_1'};
const graphic = {layer:bmpLayer, attributes:{OBJECTID_1:42, bmp_name:'Pond A', ms4_bmp_id:null}};

// Feature identity: UMBC_BMP_ArcGIS_Import, portal item + layer 0, and the layer's own object-ID field.
assert.deepEqual(BMP_SOURCE, {item:'5d70e438bb6045d6b3af05aee061e3cd', layer:0});
assert.deepEqual(featureRef(graphic), {ok:true, sourceItem:BMP_SOURCE.item, layerId:0, objectId:'42'});
const byUrl = {layer:{url:'https://example.test/arcgis/rest/services/UMBC_BMP/FeatureServer/0', portalItem:{id:BMP_SOURCE.item}, objectIdField:'FID'}, attributes:{FID:7}};
assert.deepEqual(featureRef(byUrl), {ok:true, sourceItem:BMP_SOURCE.item, layerId:0, objectId:'7'}); // Layer ID from the URL.
const sublayer = {layer:{layerId:0, parent:{portalItem:{id:BMP_SOURCE.item}}, objectIdField:'OBJECTID'}, attributes:{OBJECTID:9}};
assert.equal(featureRef(sublayer).ok, true); // Item ID from the parent service.
const sourceLayer = {sourceLayer:bmpLayer, attributes:{OBJECTID_1:5}};
assert.equal(featureRef(sourceLayer).objectId, '5');
// The old layer and its service are refused now; no service-URL matching remains.
const oldLayer = featureRef({layer:{title:'BMP_Database', portalItem:{id:'cc6a7a27c267435c8f7ed95a59eb5f24'}, layerId:3, objectIdField:'OBJECTID_1'}, attributes:{OBJECTID_1:42}});
assert.equal(oldLayer.ok, false);
assert.match(oldLayer.message, /BMP_Database.*not the BMP layer the database accepts \(item 5d70e438bb6045d6b3af05aee061e3cd, layer 0\)/);
const oldByUrl = {layer:{url:'https://services1.arcgis.com/diQbEFavWah0WAHd/arcgis/rest/services/UMBC_SWM_Tracking_test/FeatureServer/0', objectIdField:'OBJECTID_1'}, attributes:{OBJECTID_1:7}};
assert.equal(featureRef(oldByUrl).ok, false);

// Wrong layer, missing selection, missing object ID: refused with a readable message.
const wrongLayer = featureRef({layer:{...bmpLayer, layerId:2}, attributes:{OBJECTID_1:42}});
assert.equal(wrongLayer.ok, false);
assert.match(wrongLayer.message, /layer 2/);
assert.match(featureRef({layer:{title:'Buildings', portalItem:{id:'abc'}, layerId:0, objectIdField:'OBJECTID'}, attributes:{OBJECTID:1}}).message, /Buildings/);
assert.match(featureRef(null).message, /No BMP is selected/);
assert.match(featureRef({layer:bmpLayer, attributes:{}}).message, /no object ID/);
assert.equal(featureRef({layer:bmpLayer, attributes:{OBJECTID_1:0}}).ok, false);
assert.equal(featureRef({layer:bmpLayer, attributes:{OBJECTID_1:'042'}}).objectId, '42'); // No leading zero reaches the database.

// Snapshot: { arcgis: every attribute, form: the five form fields }, JSON-safe and under the database limit.
assert.deepEqual(attributesOf({attributes:{a:1, b:undefined, c:NaN, d:null, e:'x'}}), {a:1, b:null, c:null, d:null, e:'x'});
assert.deepEqual(FORM_FIELDS, ['verified_campus_location', 'nearby_address', 'address_kind', 'condition_status', 'last_inspection']);
const formValues = {verified_campus_location:' North lot ', nearby_address:'a'.repeat(600), address_kind:'Geocoder', condition_status:'', last_inspection:undefined};
const formSection = readFormSection(formValues);
assert.deepEqual(Object.keys(formSection), FORM_FIELDS);
assert.equal(formSection.verified_campus_location, 'North lot');
assert.equal(formSection.nearby_address.length, 500); // Prefilled values are cut to 500 characters.
assert.equal(formSection.last_inspection, '');
const formElement = {elements:{namedItem:name => ({verified_campus_location:{value:'Door B'}, condition_status:{value:'Good'}})[name] ?? null}};
assert.deepEqual(readFormSection(formElement), {verified_campus_location:'Door B', nearby_address:'', address_kind:'', condition_status:'Good', last_inspection:''});
assert.deepEqual(snapshotOf(attributesOf(graphic), formSection), {arcgis:{OBJECTID_1:42, bmp_name:'Pond A', ms4_bmp_id:null}, form:formSection});
const huge = snapshotOf(attributesOf({attributes:{bmp_name:'Pond A', bmp_type:'Pond', big:'s'.repeat(20000)}}), formSection);
assert.deepEqual(huge.arcgis, {bmp_name:'Pond A', bmp_sequence:null, ms4_bmp_id:null, bmp_type:'Pond'}); // Identifying fields only.
assert.deepEqual(huge.form, formSection);
// Worst case still fits the database's 16384 bytes: five 500-character fields of 4-byte characters plus fallback attributes.
const widest = snapshotOf(attributesOf({attributes:{bmp_name:'\u{1F30A}'.repeat(500), big:'s'.repeat(20000)}}),
  readFormSection(Object.fromEntries(FORM_FIELDS.map(name => [name, '\u{1F30A}'.repeat(500)]))));
assert.ok(new TextEncoder().encode(JSON.stringify(widest)).length <= 16384);

// Fields from the real form (by input name) or from a plain object.
const form = {elements:{namedItem:name => ({inspection_type:{value:'Routine'}, inspection_result:{value:'Pass'}, observations:{value:'  ok  '}})[name] ?? null}};
assert.deepEqual(readFields(form), {inspectionType:'Routine', outcome:'Pass', notes:'  ok  '});
assert.deepEqual(readFields({inspectionType:'Routine', outcome:'fail', notes:''}), {inspectionType:'Routine', outcome:'fail', notes:''});

const args = buildSaveArgs('d1', featureRef(graphic), readFields(form), snapshotOf(graphic));
assert.equal(args.p_outcome, 'pass');
assert.equal(args.p_notes, 'ok');
assert.equal(args.p_layer_id, 0);
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
// Signed out at Save keeps the tab's values: sign in elsewhere, then press Save here (AC19). History has its own text.
assert.equal(explainError({code:'42501', message:'permission denied for function create_inspection'}, 401).message,
  'You are signed out. Sign in again in a new tab, then press Save again here.');
assert.equal(explainError({code:'PGRST303', message:'JWT expired'}, 401, 'load').message,
  'You are signed out. Sign in again in a new tab, then select the BMP again.');
assert.equal(explainError({code:'P0001', message:'unknown_source'}, 400, 'load').kind, 'unknown_source');
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
// History rows carry the saved form section, or null when the record has none.
assert.equal(historyRow({id:'r1', submitted_at:'2026-10-28T02:51:07Z', inspection_type:'Routine', outcome:'pass', notes:null}).form, null);
assert.equal(historyRow({id:'r1', submitted_at:'2026-10-28T02:51:07Z', inspection_type:'Routine', outcome:'pass', displayed_snapshot:{bmp_name:'x'}}).form, null);
assert.deepEqual(historyRow({id:'r1', submitted_at:'2026-10-28T02:51:07Z', inspection_type:'Routine', outcome:'pass',
  displayed_snapshot:{arcgis:{}, form:{condition_status:'Good', nearby_address:null, other:'ignored'}}}).form,
  {nearby_address:'', condition_status:'Good'});

// Only @umbc.edu accounts can use the app (AC29).
assert.equal(isUmbcEmail('ab12@umbc.edu'), true);
assert.equal(isUmbcEmail('AB12@UMBC.EDU'), true);
for (const email of ['x@gmail.com', 'x@evilumbc.edu', 'x@umbc.edu.evil.com', '@umbc.edu', '', null, undefined]) assert.equal(isUmbcEmail(email), false, String(email));
assert.equal(NON_UMBC_MESSAGE, 'Only @umbc.edu accounts can use this app.');

console.log('PASS: feature identity, layer check, snapshot shape and limits, form fields, client checks, error messages, results, history, UMBC emails');
