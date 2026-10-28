# PRODUCT.md: UMBC Stormwater GIS

Updated: 2026-10-27 · Spec: docs/spec/v1.md · Sources: docs/research/2026-10-27-wire-backend-into-static-site.md, docs/intake/2026-10-27-wire-backend-into-static-site.md

## Who it's for
- **Inspectors:** UMBC stormwater inspectors and the CMSC447 team demoing for them.
- **What they work with:** each person has a UMBC Google account. They work from a campus ArcGIS map of BMPs (stormwater best-management-practice facilities).
- **What's broken:** today the inspection form saves nothing.

## The main job
When I finish checking a BMP on campus, I want to save my inspection against that exact BMP, so my record is stored under my UMBC account and I can see it again after a reload.

## Where it's used
- **Desktop browser** on `http://localhost:5500/`, with no build step (static HTML and ES modules). The port and `localhost` are fixed by the OAuth redirect URLs.
- **Online only:** the ArcGIS SDK and supabase-js load from CDNs.
- **Two sign-ins, each needed once:**
  - Google `@umbc.edu` (Supabase) to save inspections and see history. Only a Google button is shown (intake Q3, D3).
  - ArcGIS, because the BMP layer is shared only with the "Stormwater ArcGIS Map" group.

## First value
- **Core result:** the first inspection is saved and shows in "Your past inspections of this BMP".
- **Budget:** see docs/spec/v1.md, AC22. From a loaded map to "Saved at …" uses four controls: the BMP, the type, Pass/Fail and Save. One-time sign-ins are excluded.

## Voice
- **Say what happened, plainly:** "Saved at 3:42 PM."
- **Tell the next step in the same message:** "No reply from the server, so the save is not confirmed. Press Save again; it will not create a duplicate."
- **Never claim a save that the back end did not confirm.** "Saving…" is not "Saved".

## Words
| Concept | Word we use | Words we avoid |
|---|---|---|
| Stormwater facility | BMP | drain, asset (in UI) |
| Recording a check | Save inspection → Saved | Submit, upload |
| Result | Pass / Fail | Needs verification |
| Own records | Your past inspections | history log, records |
| Account | Sign in with Google (UMBC) | log in, register |

## Constraints
- **Out of scope:** photos, a "Needs verification" outcome, email, PDF export and offline use (source: docs/designs/inspection-database-and-umbc-sign-in.md:53).
- **Who can sign in:** only `@umbc.edu` Google accounts. Email + password stays on as a fallback (source: docs/designs/inspection-database-and-umbc-sign-in.md:139).
- **Whose records are visible:** an inspector sees only their own inspections (source: app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md:9, :59).
- **Success means confirmed:** success shows only after the back end confirms, and a retry never duplicates (source: CLAUDE.md).
- **Never logged:** no tokens or raw auth errors (source: CLAUDE.md).
- **No GIS changes:** no ArcGIS sharing changes and no GIS edits (source: CLAUDE.md).
- **Accessibility:** WCAG 2.2 AA.

## Taste
- No taste profile yet.
