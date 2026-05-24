# Sandav Internet System

Web app to manage internet service clients — replaces 3 Google Sheets + Make.com.

## What it does
- Track new client requests (intake → installation → activation)
- Manage active/permanent clients with technical network details
- Monthly billing tracking with paid/unpaid status per client

## Three sections
1. **Requests** — new client requests, filled in 2 stages (intake + post-installation)
2. **Active Clients** — permanent clients, includes Rocket No./LiteBeam IP/Router IP/MAC
3. **Billing** — monthly payment tracking with month-over-month comparison

## Move to Active Client trigger
All 11 fields must be filled before the "Activate Client" button appears:
Client Full Name, Phone, Location, Internet Type, Monthly Fee,
Installation Status, Payment Status, Payment Reference, Pay Date,
Device Name, MAC Address

## Stack
- Next.js 15 App Router
- SQLite via better-sqlite3 — file: sandav.db (gitignored)
- Tailwind CSS
- No external auth — simple single-user app

## Dev
```bash
npm run dev   # http://localhost:3000
```

## Database
Tables: `requests`, `clients`, `billing`
Schema initialised automatically on first run via `lib/db.ts`

## Key UI rules
- Simple, non-technical users — plain language, no jargon
- Mobile-first — large tap targets, works on phone
- Dropdowns for all status fields (no free typing)
- Never delete without confirmation dialog
- Show exactly which fields are still missing on a request
