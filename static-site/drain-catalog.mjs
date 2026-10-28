import {extractFacility, normalizeKey} from "./facility.mjs";

/** Use only BMP/stormwater operational layers, never basemap or duplicated CSV markers. */
const BMP_LAYER = /\bbmp\b|storm[ _-]?water|storm[ _-]?drain|drainage/i;
const BMP_COLUMNS = new Set(["bmpname", "ms4bmpid", "bmptype", "swmtrackingnumber"]);
const NAME_COLUMNS = ["bmp_name", "facility_name", "asset_name", "name"];
const collator = new Intl.Collator(undefined, {numeric:true, sensitivity:"base"});

function asArray(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  if (typeof list.toArray === "function") return list.toArray();
  if (typeof list.forEach === "function") { const result=[]; list.forEach(x=>result.push(x)); return result; }
  return [];
}

function fieldsFor(layer) {
  return asArray(layer?.fields).map(f => normalizeKey(f.name || f.alias));
}

/** Traverse WebMap operational layers, including feature sublayers in services. */
export function bmpQueryableLayers(map, configuredLayerIds=[]) {
  const found=[];
  const visited=new Set();
  function visit(layer, parentIsBmp=false) {
    if (!layer || visited.has(layer)) return;
    visited.add(layer);
    if (layer.visible === false) return;
    const title=`${layer.title||""} ${layer.id||""}`.replace(/[_-]/g, " ");
    const fields=fieldsFor(layer);
    const named = BMP_LAYER.test(title) || fields.some(name=>BMP_COLUMNS.has(name));
    const explicit = configuredLayerIds.some(id=>[layer.id,layer.url,layer.parent?.id].map(String).includes(String(id)));
    const eligible=explicit || (configuredLayerIds.length===0 && (named || parentIsBmp));
    if (typeof layer.queryFeatures === "function" && eligible) found.push(layer);
    for (const child of [...asArray(layer.layers),...asArray(layer.sublayers)]) visit(child,eligible);
  }
  asArray(map?.layers || map?.allLayers).forEach(x=>visit(x));
  return found;
}

function graphicFrom(feature, layer) {
  // FeatureLayer.queryFeatures() can return graphics without a .layer pointer.
  // Wrap only the locally retrieved result for selection; the source is unmodified.
  return feature.layer ? feature : {attributes:feature.attributes||{},geometry:feature.geometry,layer};
}

/** Request the complete feature set, even when the service enforces maxRecordCount. */
export async function queryLayerDrains(layer) {
  if (typeof layer.load === "function") await layer.load();
  const getQuery=()=>{
    const query=typeof layer.createQuery === "function" ? layer.createQuery() : {};
    query.where ||= "1=1";
    query.outFields=["*"];
    query.returnGeometry=true;
    return query;
  };
  const records=[];
  if (typeof layer.queryObjectIds === "function") {
    let ids=null;
    try { ids=await layer.queryObjectIds(getQuery()); }
    catch { /* A few older sublayers support feature queries but not ID queries. */ }
    if (Array.isArray(ids)) {
      if (!ids.length) return records;
      // Object IDs bypass offset support limitations on hosted feature services.
      for(let i=0;i<ids.length;i+=100){
        const q=getQuery();
        q.objectIds=ids.slice(i,i+100);
        const page=await layer.queryFeatures(q);
        records.push(...(page.features||[]).map(f=>graphicFrom(f,layer)));
      }
      return records;
    }
  }
  // Fallback for older service sublayers without queryObjectIds.
  const count=typeof layer.queryFeatureCount === "function" ? await layer.queryFeatureCount(getQuery()) : null;
  const pageSize=Math.max(1,Math.min(100,layer.capabilities?.query?.maxRecordCount || 100));
  for(let start=0;start<(count ?? 10000);start+=pageSize){
    const q=getQuery(); q.start=start; q.num=pageSize;
    const page=await layer.queryFeatures(q);
    const features=page.features||[];
    records.push(...features.map(f=>graphicFrom(f,layer)));
    if(features.length<pageSize) break;
  }
  return records;
}

function readAttr(attrs, fields) {
  for(const name of fields){
    const key=Object.keys(attrs).find(k=>normalizeKey(k)===normalizeKey(name));
    if(key && attrs[key] !== null && attrs[key] !== undefined && String(attrs[key]).trim()) return String(attrs[key]).trim();
  }
  return "";
}

function layerIdentity(layer) { return String(layer?.url || layer?.id || layer?.title || "unknown"); }

function identity(graphic) {
  const layer=graphic.layer||graphic.sourceLayer;
  const attrs=graphic.attributes||{};
  const objectName=layer?.objectIdField || "OBJECTID";
  const oid=readAttr(attrs,[objectName,"OBJECTID","FID"]);
  const tracking=readAttr(attrs,["swm_tracking_number"]);
  const sequence=readAttr(attrs,["bmp_sequence"]);
  const name=readAttr(attrs,NAME_COLUMNS);
  return `${layerIdentity(layer)}|${oid ? `oid:${oid}` : `bmp:${tracking}|${sequence}|${name}`}`;
}

/** Catalog built from the live ArcGIS query, not from a separate local file. */
export async function loadDrainCatalog(map, configuredLayerIds=[], getLayers=bmpQueryableLayers) {
  const layers=getLayers(map,configuredLayerIds);
  const records=[];
  const errors=[];
  for(const layer of layers){
    try{
      const graphics=await queryLayerDrains(layer);
      for(const graphic of graphics){
        const attrs=graphic.attributes||{};
        const name=readAttr(attrs,NAME_COLUMNS);
        if(!name) continue; // never show empty or non-drain service records.
        const facility=extractFacility(graphic);
        if(!facility.bmpType && !facility.assetTag && !facility.trackingNumber && !BMP_LAYER.test(String(layer.title||"").replace(/[_-]/g," "))) continue;
        records.push({key:identity(graphic), name, tracking:facility.trackingNumber, sequence:facility.sequence, graphic});
      }
    }catch(error){errors.push({layer:layer.title||layer.id||"Unknown layer",error});}
  }
  // One option per real ArcGIS feature, even if some names and MS4 IDs repeat.
  const unique=new Map(records.map(item=>[item.key,item]));
  const drains=[...unique.values()].sort((a,b)=>collator.compare(a.name,b.name)||collator.compare(a.tracking,b.tracking)||collator.compare(a.key,b.key));
  return {drains, errors};
}

/** Make duplicate names distinguishable, e.g. Library Pond — tracking number. */
export function drainOptions(drains) {
  const counts=new Map();
  for(const d of drains) counts.set(d.name,(counts.get(d.name)||0)+1);
  return drains.map(d=>({key:d.key,label:counts.get(d.name)>1 ? `${d.name} — ${d.tracking || d.sequence || d.key.split("|").at(-1)}` : d.name}));
}

/** Clicking a map symbol updates the dropdown without ever choosing a similarly named asset. */
export function findMatchingDrain(drains,graphic) {
  const key=identity(graphic);
  return drains.find(d=>d.key===key) || null;
}
