# CMSC447 Sprint 2 demo recommendation

Planning only — October 26, 2026. No application, access configuration, database, Jira history, or external system was changed for this plan. No live service-access tests were performed.

## Recommended decision

Choose a **BMP inspection walkthrough**: select an actual mapped BMP polygon, review its attributes, submit a small inspection, and reopen its saved history after reloading the application.

The product promise is: **“An inspector can record what they observed at a selected mapped feature and retrieve that record later without confusing it with another feature.”** This improves the supplied inspection workflow and provides a stronger demonstration of team work than reproducing an existing GIS viewer. The crucial new behavior is durable, correctly associated inspection records; the map makes the record geographically meaningful.

Aim for one credible end-to-end increment, not the entire final application. The supplied Sprint 2 goal already includes map interaction, asset selection, an initial inspection form, and beginning submission/storage. Completing this path would directly support that goal. The rubric allows a live or recorded demonstration of completed features; it does not require every final-system feature to exist at midterm.

This is a conditional 10–12-hour work plan for three available teammates, not an estimate based on an inspected repository. Exact presentation time, repository state, individual availability, existing authentication, and database setup remain unknown. If fewer than six useful hours remain, choose the reduced scope described below rather than promising the full path.

## What the evidence supports

**Verified reconnaissance:** the signed-in ArcGIS browser contains a hosted test service with a polygon BMP layer, 121 feature rows, several facility types, and repeated permit/reference values. Editing and attachments were disabled on the inspected layer. Separate-application access was not verified. A feature count is not a count of distinct physical facilities.

**Supplied project context:** the intended workflow is for Facilities inspectors on iPads, with inspection records, later history, and eventual administrative review. Next.js/TypeScript, ArcGIS, and Supabase are documented architecture choices. These are requirements and design claims, not proof of implementation. Current paper forms, spreadsheets, or other operational steps were not verified and should not be invented in the presentation.

**Recommendation:** use the existing source polygons as read-only reference geometry and keep application inspection records separate. Until grouping and field semantics are confirmed, internally call the selected object a “mapped BMP feature.” Use its verified source identifier in the interface; do not turn a repeated permit number into an official unique asset tag.

This plan applies Jarvis’s research-before-solution, current-workflow-first, engineering-ownership, and evidence-before-completion principles. It does not run Jarvis or rely on its implementation. Newly named PDFs were absent; the course details here come from the prior extracted context supplied to this planning task.

## The screens reviewers would actually see

| Screen or state | Concrete behavior | Acceptance boundary |
|---|---|---|
| Campus map | A 2D campus view with real BMP polygons, zoom/pan, a clear selected outline, and a reset-view control | Layer geometry loads through a verified access path. Source-layer count is not called an asset count. |
| Selected feature panel | Readable facility type, verified name/reference fields, source feature ID, and “Start inspection” | Missing values say “Not provided.” Unconfirmed fields retain neutral labels. No guessed address or unique tag. |
| Inspection form | Selected feature summary remains visible; inspection type, pass/fail, notes; clear submit/cancel controls | Pass/fail starts unselected. Inspection type accepts text until an approved controlled list exists. No regulatory checklist is implied. |
| Save result | Saved record ID, selected feature reference, database submission time, authenticated inspector, and “View inspection” | Success appears only after a confirmed database result. Failure preserves entered values and provides a retry action. |
| Feature history/detail | A newest-first list and a readable record detail containing the submitted asset snapshot | Reload triggers a fresh backend read. Two records remain distinct. Scope is labeled accurately, such as “My inspections,” if only own-record access is implemented. |

Keep this to one primary page with a map and details panel; form and history can replace the panel content. On a narrow viewport, use a full-width panel or stacked layout. Visible loading, empty, and failure states are part of these screens, not additional product features.

For an iPad-oriented design, prioritize comfortable touch targets, readable text, and a form that stays usable with the keyboard open. Validate on a real iPad if one is available. A desktop responsive viewport alone does not justify claiming iPad compatibility.

## Engineering decisions to make up front

| Decision | Recommendation and reason |
|---|---|
| 2D or 3D | Choose 2D for this increment. The demonstrated task is selecting polygons and entering observations; elevation and camera controls do not establish additional inspection value. A fixed top-down view should also make the presentation easier to follow. Revisit 3D only for a demonstrated terrain-related requirement. |
| GIS implementation | Retain the selected ArcGIS stack and use its feature-layer capability instead of rebuilding polygon rendering or inventing markers. The SDK documents service-backed and client-side FeatureLayers; which access path works for this particular service is still untested. [ArcGIS FeatureLayer reference](https://developers.arcgis.com/javascript/latest/references/core/layers/FeatureLayer/) |
| Application boundary | GIS supplies reference features; the application stores inspection records. Do not edit official GIS geometry, enable service editing/attachments, or change sharing to make the demo easier. The absence of ArcGIS attachments does not prevent a separate future photo-storage feature. |
| Backend and identity | Prefer the documented Supabase stack if an authorized project and test account can be made functional quickly. A real login session and database policies must support the demonstrated identity; a name dropdown or decorative login screen is not authentication. |
| Release and infrastructure | Reuse existing working project structure and dependencies after inspecting the repository. Prefer a verified local presentation and recording over rushing an unverified deployment. Public hosting is optional. Basemap access, SDK version compatibility, service permissions, and free-tier availability must be checked during implementation; no new spending is assumed. |

Do not expand into a platform rewrite. If the team already has useful working code, preserve it and implement the missing path. The current workspace does not establish whether such code exists elsewhere.

## The first 90 minutes: decide whether the full path is viable

1. **Find and run the actual team repository — 20 minutes.** Identify the current branch, existing implementation, environment prerequisites, and who has legitimate project access. Record what actually runs. If no implementation exists, say so and initialize only after implementation is authorized. Avoid having three people independently scaffold competing applications.
2. **Prove GIS access and map selection — 30 minutes.** Inspect service metadata through the intended application access method; confirm the object-ID field, relevant field meanings, coordinate handling, and a selectable real polygon. Read a few representative records, including missing values and repeated permit/reference values. A working signed-in scene does not prove app authorization. Basemap loading is a separate dependency.
3. **Prove persistence and real identity — 25 minutes.** In the authorized demo environment, verify a provisioned inspector can create and retrieve one test record through the actual application path. Confirm unauthenticated requests cannot write. An administrative database-editor insert is not proof that browser authorization works.
4. **Freeze a shared contract — 10 minutes.** Agree on the selected-feature shape, create-inspection input, persisted-record shape, error states, and ownership of files. Document the temporary field mapping and record-access policy. Carry these small contracts into the existing code structure rather than creating an elaborate new architecture.
5. **Choose the scope gate — 5 minutes.** If map selection and a genuine backend round-trip work, pursue the full inspection path. If access or persistence remains blocked, switch to the most honest viable smaller increment below. Do not consume the day adding features around an unproven dependency.

These times are investigation caps, not promises that account provisioning or organizational authorization can be completed within them. A teammate’s source familiarity can help identify the legitimate access path but does not authorize borrowing their session tokens.

## Fallbacks that preserve honest claims

| Blocker | Allowed fallback | What can be claimed |
|---|---|---|
| Live GIS service unavailable to app, approved snapshot available | Use an authorized exported snapshot with original geometry and source references; label dataset date and snapshot mode | Inspection workflow on a static reference dataset. No live GIS sync claim. Export permission and permitted storage/distribution must be established; do not infer them from browser visibility. |
| GIS requires organizational authorization that cannot be completed | Use existing legitimately accessible GIS only as reference/context; demonstrate whichever custom form/backend behavior is actually working separately | A partial increment with a clearly identified integration blocker. No claim that an existing ArcGIS scene is the team’s custom map integration. |
| Map works, private persistence or authentication does not | Deliver the facility explorer plus validated unsaved inspection form; explicitly label submission/history incomplete | Map integration, feature details, and initial form behavior. Do not call browser memory or localStorage centralized persistence. |
| Full path works locally, deployment is unreliable | Run the same verified build locally and use a recorded run as backup | Working local prototype with proven database persistence. No production availability claim. |
| Presentation is within six working hours | Narrow to real layer selection, readable details, and a validated form; add persisted submission only if the existing backend already works | A smaller completed increment, accompanied by accurate backlog/status and technical blocker evidence. |

A static snapshot is not automatically permitted, and making a private dataset part of a public repository or bundle is not an acceptable shortcut. If no authorized data path exists, acknowledge the limitation. Synthetic test data is useful for development but must never be presented as the real integrated campus dataset.

## Minimum data contract

Prefer two logical records, adapted to the existing schema if one exists:

| Record | Minimum fields | Purpose |
|---|---|---|
| App asset reference | App UUID; source item ID; layer ID; verified source object ID; dataset/version provenance if using a snapshot | A unique app reference for the currently mapped feature. Enforce uniqueness of the source reference within that dataset. |
| Inspection | Inspection UUID; app asset UUID; inspector user ID; database-generated submission time; inspection type, outcome, notes; asset-details snapshot | An append-only inspection tied to the selected reference and what the form displayed at submission. |

Use the currently verified source item + layer + object ID as a provisional source key. `MDE_SF_Num` and `UMBC_PRF` are known to repeat and cannot identify the record by themselves. A UUID does not solve source reconciliation: if the source is republished or IDs are recycled, the mapping must be reviewed. Do not implement automatic source replacement in this demo.

The asset snapshot should preserve the source reference plus verified displayed name/type/reference values. Capture it when the inspection is submitted and avoid silently rewriting past inspections when reference data changes. Resolve or validate the selected app asset on the write path; do not trust an arbitrary display label as the saved identity. Never invent a human-friendly tag or a physical location when the data does not support it.

Give each inspection its own UUID. Repeated submission attempts for the same draft should reuse that ID so a retry cannot create a second logical record. After a confirmed save, a new inspection receives a new ID. Disable submit during an in-flight request, and handle an ambiguous response by checking whether that ID already exists before creating another. Do not overwrite prior records with an upsert keyed only by the asset.

Validate on both form and write path. Require an existing selected reference, nonblank inspection type, and explicit pass/fail. Keep notes optional unless stakeholder requirements establish otherwise; a stronger notes-on-failure rule would be a new product policy. Reject unsupported outcomes, oversized input, and requests with invalid identity. Database submission time and inspector identity must not come from editable form fields.

For a fresh restricted demo, the smallest authorization policy may allow the provisioned inspector to insert their own records and read their own history. Label that “My inspections,” because it does not demonstrate shared cross-inspector history or an admin role. Supabase documents operation-specific row policies using the authenticated user ID; privileged keys must remain out of browser code. Test policy behavior through the app, not only the database editor. [Supabase row-level security documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Definition of done: prove the difficult behavior

The strongest concise demonstration is **two inspections for feature A, one for feature B, and zero from an invalid submission**. Choose A and B with a repeated permit/reference value when actual sample data supports it. This demonstrates that the system solved the identity problem found during reconnaissance.

| Check | Exact proof | Failure that this detects |
|---|---|---|
| Append without overwrite | Save two distinguishable inspections for A; see two different inspection UUIDs and both bodies | One-row-per-asset storage or an upsert that destroys history |
| Correct feature association | Save one inspection for B; A and B share a permit/reference but have different source IDs; histories show A=2 and B=1 in a clean test case, or corresponding increments over a recorded baseline | Keying records by a shared permit number or carrying stale selection into submit |
| Genuine persistence | Reload, reselect A and B, and fetch the same records from the backend; preferably repeat in a second fresh authenticated tab | State existing only in a JavaScript array, localStorage, or an optimistic UI cache |
| Invalid and repeated requests | Missing required values create no record; a rejected direct write also creates none; a double-click/retry on the same draft yields only one record | Frontend-only validation, false success, or duplicate writes |
| Failure and access behavior | Interrupt a save or expire the session: preserve form input and show no false success; signed-out writes are denied; missing attributes render safely | Silent data loss, fabricated login, overly broad writes, or an exception on sparse GIS data |

The two-plus-one sequence is the final acceptance run, not a requirement to repeatedly create records during every rehearsal. Preserve test records with clear demo context or use a separate test environment; do not delete existing project data for a cleaner count. Document the actual baseline.

If the current time budget cannot support all these checks, reduce the claimed completed scope. Do not skip correctness checks and present the same feature claims anyway.

## What to build now and what to defer

| Priority | Scope |
|---|---|
| Required for the recommended complete increment | Real geometry, selection/details, minimal validated form, verified inspector identity, database save, reloadable correctly associated history, visible failure states |
| First small improvement after the complete path passes | Facility-type filter or a list of available features to make demo selection easier; choose one based on observed usability |
| Optional only with stable spare time | One-photo upload to private application storage, if existing storage access is already configured and verified. Otherwise omit photos entirely from the completed-feature claim. |
| Deferred final-system work | PDF generation; Work Control email; admin approval/review; asset editing/deactivation UI; broad cross-inspector history and role management |
| Outside this sprint slice | Offline sync, 3D feature work, advanced engineering overlays, dashboard analytics, GIS edits, new infrastructure/platform changes |

Email is especially poor critical-path work: the recipient and workflow are unconfirmed, configuration can take time, and accidental real notifications have consequences. Later, persist a report before attempting email; email failure must never erase the report. Photos create a separate upload-and-record consistency problem, so they should not endanger the more valuable durable text-inspection path.

The core architecture remains compatible with the SDD. A 2D view is a presentation choice within the ArcGIS stack. Online-only behavior follows the supplied SDD resolution. Own-inspection history, a provisional asset key, and an authorized dated snapshot are explicit scope adaptations if used. The absent admin, PDF, email, photo, and offline capabilities must appear as unfinished or deferred, not implied completed requirements.

## One-day execution budget after approval

| Elapsed working time | Bounded outcome | Decision at the end |
|---|---|---|
| 0:00–1:30 | Repository/access/backend gates and shared contracts | Full path or documented reduced scope |
| 1:30–4:30 | Parallel map/details, form/history UI, persistence/auth work; integrate the first real save as early as possible | If no real save/read round-trip exists, remove all optional work and resolve that path |
| 4:30–7:00 | Complete selected feature → save → history; resolve identity, validation, retry, and failure behavior | Freeze feature scope at hour 7 |
| 7:00–9:00 | Run acceptance sequence, capture proof and backup video, assemble actual Jira/GitHub evidence and slides | State completed scope from results rather than intentions |
| 9:00–12:00 | Rehearse the full 20 minutes, fix only demo blockers, verify launch steps, reserve up to 60 minutes for presentation-machine problems | Ready local run plus playable recording and accurate presentation |

The final three hours include contingency rather than three hours of guaranteed feature development. Three teammates do not provide three independent copies of the elapsed time: integration and shared-service setup constrain parallel work. If one person is unavailable or setup stalls, adjust scope immediately.

## Suggested responsibility tracks

These are proposed areas for the three teammates to choose, not claims about their skills, availability, past contributions, or accepted assignments. Each person should own a bounded deliverable with an interface and explain their actual work in the presentation.

1. **GIS and feature identity:** access investigation, map, selection, verified attribute mapping, missing-data behavior. Kyle’s visible ownership of the inspected item may help locate authorization context; it does not establish his engineering role or permit token reuse.
2. **Inspection interaction:** form state and validation, clear save/error behavior, history/detail rendering, tablet layout. Agree with the backend owner on exact input/output shapes before working separately.
3. **Persistence and integration:** schema and constraints, real auth access, record writes/reads, idempotency, integration, launch instructions. This track is most exposed to setup delays; stop and pair on it if it blocks the whole path.

Fabricio, Kyle, and Tai should choose among these areas based on current access and ability. Assign one integration owner. All three contribute their genuine Jira evidence, retrospective points, and a short explanation of their own deliverable. Use small real commits and truthful task updates; do not manufacture a historical burndown or redistribute authorship after the fact.

## A 20-minute presentation that matches the rubric

The demo is worth 2 of 10 rubric points; the other 8 concern review, retrospective, and Jira/backlog evidence. A stronger demo cannot substitute for those artifacts. Build and presentation preparation both need explicit time.

| Time | Topic | Evidence and wording |
|---|---|---|
| 0:00–3:00 | Sprint 1 review | Actual planning/research/SRS/ER/UML/repository outputs, stakeholder wording feedback, what increment existed, and how incomplete map/data access changed priorities. Do not imply Sprint 1 code was demonstrated if it was not. |
| 3:00–7:00 | Sprint 1 retrospective | Concrete examples of what went well and poorly, then actionable start/stop/continue decisions. Link poor time management or Jira learning to the new scope freeze and integration checkpoint. |
| 7:00–11:00 | Sprint 1 and Sprint 2 Jira charts plus Sprint 2 backlog | Show both actual sprint/burndown views and current prioritized/status backlog screenshot. Explain sparse or late updates honestly. Include real incomplete work. |
| 11:00–17:00 | Completed-feature demo | Briefly show actual GIS source context, then custom selection, invalid form, two saved records on A, a separate record on B, reload, and history. Attribute base rendering/navigation to ArcGIS and new inspection behavior to the team. |
| 17:00–20:00 | Technical challenges and next increment | Explain access, duplicate references, persistence/validation evidence, remaining requirements, and next backlog priorities. Show the scope boundary and conclude at 20 minutes. |

Prepare a six-minute recorded run of the same completed features using the same build as the live demo. The recording should show the actual invalid attempt, successful saves, and reload; it must not splice together disconnected mock behavior. Verify playback without relying on a network video player. Use it if the presentation environment prevents a reliable live run, since the rubric explicitly permits recorded demos.

If completed functionality differs from this plan, rewrite the script around what actually works. Demonstrate every feature marked completed, and remove unsupported claims from slides and backlog status.

## Remaining decisions and review boundary

The two logistical facts with the highest value are the exact presentation slot and the actual team repository location. Confirm the slot first if the one-day assumption is wrong; repository access is the first implementation task, not a reason to ask the user to design the architecture.

Stakeholder-approved inspection types, facility grouping, official tag/location mapping, full history access policy, and Work Control routing remain open. They need not block the narrow prototype when the provisional choices are labeled correctly. They do block claims of a production-ready inspection process.

**Recommended review decision:** approve the full map → inspection → saved history direction, with the first-90-minute access/persistence gate and the documented smaller fallback. Implementation should start only after Fabricio explicitly chooses to proceed, because he asked to review the plan first.

**Next action under two minutes:** review that single direction and choose “Proceed with the inspection walkthrough” or “Keep this sprint to the facility explorer.”
