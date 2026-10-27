# Stormwater project reconnaissance

Date: October 26, 2026 (America/New_York)
Scope: read-only reconnaissance and recommendations; no application implementation authorized in this phase.

## Method

Read Jarvis AGENTS.md, README.md, docs/00-brief.md, and skills/intake/references/principles.md. Applied its research-before-solution, current-workflow-first, recorded-assumptions, and evidence-before-completion philosophy. This was Codex performing reconnaissance, not a Jarvis runner execution.

Inspected the user's existing Brave scene through native computer use. Browser-tab automation was disabled; native Brave observation worked. Opened an ArcGIS item details tab and inspected Overview, Data, and Fields. No data, schema, sharing, or service settings were changed. Layer properties were inspected and cancelled.

## Verified in the signed-in browser

- Scene URL: https://umbc-ges.maps.arcgis.com/home/webscene/viewer.html?layers=cc6a7a27c267435c8f7ed95a59eb5f24&viewpoint=cam%3A-76.71254753%2C39.25447807%2C1504.788%3B0%2C0.5
- Hosted feature-layer item: UMBC_SWM_Tracking_test, owner shown as Kyle Wu (kwu5_umbc). The browser is signed in as that account. This observation establishes no permission for sharing or modifying the item.
- Item UI lists the group Stormwater ArcGIS Map under Sharing. Anonymous access and application OAuth access have not been tested.
- Service URL displayed by ArcGIS: https://services1.arcgis.com/diQbEFavWah0WAHd/arcgis/rest/services/UMBC_SWM_Tracking_test/FeatureServer
- Nine sublayers, in order: SubDrainageAreas, SWM Study Area, SWM Outfall Points, BMP Database, BMP Drainage Areas, Storm Pipe, Storm Junction, Campus Landcover, Subdrainage Areas. The last two similarly named drainage layers are distinct entries; equivalence is not established.
- BMP_Database is polygon layer 3, with 121 features according to the Data table. This is a feature count, not a verified count of unique real-world assets.
- BMP service URL: https://services1.arcgis.com/diQbEFavWah0WAHd/arcgis/rest/services/UMBC_SWM_Tracking_test/FeatureServer/3
- Schema includes OBJECTID_1 (ObjectID), MDE_SF_Num, UMBC_PRF, Facility_T, Facility_N, SWM_Tracki, SWM_Tracking_Number, MDE_SF_Number, Drainage_A, and other engineering attributes. Similar short/long field names require mapping checks.
- Visible facility types include Micro-Bioretention, NonRooftop Disconnection, and Submerged Gravel Wetland.
- Multiple visible rows share MDE_SF_Num=11-SF-0048 and UMBC_PRF=10-148. These are not unique feature identifiers. Use source item + layer + ObjectID as a provisional feature reference, with an app UUID for long-term records; behavior after source republishing remains untested.
- ArcGIS Data UI says editing is disabled despite the signed-in account having editing privileges. BMP attachments are disabled. These are observed service settings, not a recommendation to change them.
- The original scene renders campus infrastructure and provides navigation/layer/legend tools. Presence of these tools in ArcGIS is not evidence that the team's custom app is implemented.

## Implications

- Previous assumption that GIS data is wholly unavailable is superseded for this browser session. Separate-app access remains unknown.
- A generic map with invented drain markers would discard meaningful existing geometries and attributes.
- The most relevant custom workflow appears to be inspection records linked to existing facilities. This is an inference from the supplied requirements and observed map, not verified stakeholder confirmation.
- Keep GIS reference data read-only under the documented design; store application inspection records separately.
- No inspection history was established by the BMP schema inspected. Other ArcGIS items, related tables, and attachments beyond this layer were not audited.

## Recommendations for user review

1. Recommended: an inspection workflow around existing BMP polygons: select a facility, read its actual attributes, submit an inspection, reopen the saved record. Prove persistence after reload and association to the correct feature.
2. Narrower: a facility explorer using the actual layer, with facility-type filters, selection, readable attribute labels, and contextual infrastructure layers. Useful foundation but does not deliver inspection submission.
3. If standalone service access blocks integration: evaluate an authorized snapshot or existing ArcGIS application configuration. Do not make the layer public or change permissions to force a demo.

## Not checked

- Team repository, branches, code, app deployment, Supabase environment, or individual contributions. The SWE project directory was empty before this note.
- API query behavior, CORS, anonymous access, OAuth setup, identity stability across republishing, and geometry conversion.
- Stakeholder-approved inspection fields, asset grouping/tag semantics, existing inspection systems, and presentation slot.
- Newly named Downloads PDFs were absent at the paths supplied during the previous turn. Earlier syllabus/rubric findings were already read in this conversation; the previously fetched Drive SDD is a design claim, not implementation proof.

## Stop point

Present findings and recommendations to Fabricio. Await his direction before creating the demo application or changing external systems.
