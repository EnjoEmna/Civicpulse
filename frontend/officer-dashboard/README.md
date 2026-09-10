# CivicPulse — Officer Dashboard

Independent React + TypeScript + Vite + Tailwind app for the officer-facing side of
CivicPulse. Does not share code with `frontend/citizen-portal`.

## Setup
```
cd frontend/officer-dashboard
npm install
cp .env.example .env      # point VITE_API_URL at your backend
npm run dev                # http://localhost:5174
```

## Pages → files

| Route                        | File                              | Purpose                                        |
|-------------------------------|------------------------------------|-------------------------------------------------|
| `/officer/login`             | `src/pages/Login.tsx`             | Officer sign-in                                 |
| `/officer`                   | `src/pages/Dashboard.tsx`         | Main operational dashboard (stats + top queue)  |
| `/officer/complaints`        | `src/pages/ComplaintQueue.tsx`    | Filter/search/manage complaints                 |
| `/officer/complaints/:id`    | `src/pages/ComplaintReview.tsx`   | Full complaint + location + evidence + status   |
| `/officer/map`               | `src/pages/IssueMap.tsx`          | Spatial view of complaints                      |

Routing lives in `src/App.tsx`. Shared chrome (sidebar nav on desktop, bottom tabs on
tablet) is in `src/components/Layout.tsx` and wraps every page except `/officer/login`.

Note: the original `pages/ComplaintDetail.tsx` from the initial scaffold has been
superseded by `pages/ComplaintReview.tsx` to match the page spec ("Complaint Review").
Delete the old file if it's still present in your branch.

## Wiring to the real backend
Every page reads from a `MOCK_*` constant with a `// TODO:` comment pointing at the
matching function in `src/api/client.ts` (e.g. `api.getQueue()`, `api.updateStatus()`).

## Design system
Shares the same color tokens as the citizen portal (`src/index.css`) so the two apps
feel like one product, but uses a darker sidebar chrome and tabular numerals — this app
is used for hours at a stretch, so density and scan-ability are prioritized over warmth.

## Known follow-ups
- Map pages use a placeholder grid — swap in MapLibre GL / Google Maps once
  `../../contracts/layer2-spatial-service.md` is implemented.
- `ComplaintReview` "Citizen Contact" phone number is hardcoded — wire to the real
  citizen record once available.
