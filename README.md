# BSWA — Brahmanbaria Student's Welfare Association, Jagannath University

Community platform for Brahmanbaria students at university. React + Vite frontend,
Go API, zero-cost hosting constraints. Full requirements: [jela_kollan_claude_project_context.md](jela_kollan_claude_project_context.md).

## Run locally (Windows)

Backend (port 8080):

```bash
cd backend
go run .
```

Frontend (port 5173, proxies `/api` to the backend):

```bash
cd frontend
npm install
npm run dev
```

Tests and build:

```bash
cd backend && go test ./...
cd frontend && npm run build
```

## Data

Real exports live in `Data/` (git-ignored). Regenerate the API data and the map:

```bash
pip install openpyxl
python scripts/build_data.py
python scripts/build_map.py path/to/geoBoundaries-BGD-ADM3_simplified.geojson
```

Without `backend/data/students.json` the API serves synthetic sample students.

## Images

Photos come from Wikimedia Commons; author and licence for each are in
`frontend/src/data/images.json`. `images/download_images.py` fetches more with attribution.

## Credits

- Upazila boundaries: geoBoundaries (CC BY 4.0).
- Union names and population: Wikipedia (CC BY-SA), unverified.
- Photos: Wikimedia Commons contributors, see the gallery for each credit.
