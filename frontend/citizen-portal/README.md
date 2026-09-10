# CivicPulse — Citizen Portal

Independent React + TypeScript + Vite + Tailwind app for the citizen-facing side of CivicPulse.
This app does not share code with `frontend/officer-dashboard` — the two can be built,
deployed, and debugged separately.

## Setup
```
cd frontend/citizen-portal
npm install
cp .env.example .env      # point VITE_API_URL at your backend
npm run dev                # http://localhost:5173
```

## Pages → files

| Route              | File                              | Purpose                                   |
|---------------------|-----------------------------------|--------------------------------------------|
| `/login`            | `src/pages/Login.tsx`             | Citizen sign-in                            |
| `/`                 | `src/pages/Home.tsx`              | Explain CivicPulse + quick report action   |
| `/report`           | `src/pages/ReportIssue.tsx`       | Main complaint submission flow (3-step)    |
| `/complaints`       | `src/pages/MyComplaints.tsx`      | Citizen's submitted complaints, filterable |
| `/complaints/:id`   | `src/pages/ComplaintDetails.tsx`  | Track one complaint + timeline             |
| `/map`              | `src/pages/CivicMap.tsx`          | See reported issues around the area        |
| `/profile`          | `src/pages/Profile.tsx`           | Account + notification preferences         |

Routing lives in `src/App.tsx`. Shared chrome (top nav + mobile tab bar) is in
`src/components/Layout.tsx` and wraps every page except `/login`.

## Wiring to the real backend
Every page currently reads from a `MOCK_*` constant at the top of the file with a
`// TODO:` comment pointing at the matching function in `src/api/client.ts`
(e.g. `api.getMyComplaints()`, `api.createComplaint()`). Swap the mock for a
`useEffect` + `useState` fetch once the backend contract in
`../../contracts/layer1-ai-service.md` (or whichever layer owns complaints) is stable.

## Design system
Colors, spacing, and type live as CSS variables in `src/index.css` and are mapped into
Tailwind via `tailwind.config.ts`. One accent color (civic navy) is used for all primary
actions; status colors (amber/blue/green/red) are reserved for complaint status only —
don't reuse them decoratively.

## Known follow-ups
- Google Fonts is linked via `<link>` in `index.html` for now — self-host `Inter` with
  `@font-face` before shipping to production.
- Map pages (`/map`) use a placeholder grid — swap in MapLibre GL or Google Maps once
  the layer2-spatial-service contract is ready.
