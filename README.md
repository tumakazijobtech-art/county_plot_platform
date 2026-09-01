# County Plot Hub

County Plot Hub is a production-oriented MERN booking system for exhibitor plots at county showgrounds. It is based on the supplied County Showgrounds demo, but replaces its in-browser mock data with a MongoDB API and a real payment/SMS integration boundary.

## What is included

- React + Vite frontend intended for Vercel.
- Node.js + Express backend intended for Render.
- MongoDB persistence through Mongoose.
- Leaflet maps with OpenStreetMap tiles and real latitude/longitude plot footprints.
- Seasonal booking windows and atomic plot reservation.
- Kenyan phone validation and OTP flow.
- Daraja STK Push adapter with configurable `PartyB` and `CustomerBuyGoodsOnline` transaction type.
- Talk Sasa SMS adapter for OTP, payment confirmation, and inquiries.
- M-Pesa callback handling and idempotent payment updates.
- Branded permit screen with QR verification data and downloadable PDF.
- Branded permits include a light originality watermark and PDF metadata.
- Admin workspace at `/admin` for showground/plot leasing, booking approvals, visitor approval and gate scans.
- Full admin CRUD for showgrounds, plots, and individual showground manager accounts.
- Admin plot digitizer ("Plot boundaries" tab): upload a georeferenced site-plan image or import a GeoJSON file, trace each plot as a real polygon, drag vertices to correct the shape, and get a warning if two plots overlap. Digitized plots render as true polygons — colored by available/reserved/taken status — on the public map, and visitors click a plot's polygon to start the existing booking flow. See [Digitizing plot boundaries](#digitizing-plot-boundaries) below.
- Admin-controlled public logo, lease-permit logo, site name, and theme colors.
- Each showground can have its own WhatsApp number; inquiries are saved and open a pre-addressed WhatsApp message for that location.
- Manager accounts are assigned specific showgrounds and are restricted server-side to read-only details for those locations.
- Password login with secure reset links. Brevo's free sending allowance can be used for reset emails.
- Demo mode so the full flow works before provider credentials are configured.
- Deployment files for Vercel and Render.

## Quick start

Requirements: Node.js 20+, a MongoDB database, and npm.

```bash
cd county-plot-hub
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run seed
npm run dev
```

Open `http://localhost:5173`.

Open `http://localhost:5173/admin` for the operations workspace. In demo mode the initial credentials come from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (defaults are shown in `server/.env.example`); change them before production. The primary admin can create manager accounts, assign them one or more showgrounds, and remove or reassign them later. Forgot-password links are logged and shown in the demo UI when no Brevo key is configured.

### Adding managers from the database (last resort)

If the admin UI is unavailable, the primary admin account is locked out, or you're scripting environment setup, manager accounts can be created, updated, or removed directly against MongoDB with the same rules the API enforces:

```bash
cd server
npm run manager -- list-showgrounds
npm run manager -- add --name "Jane Doe" --email jane@example.com --password "Secret123" --showgrounds kisumu,mombasa
npm run manager -- list
npm run manager -- update --email jane@example.com --showgrounds kisumu
npm run manager -- remove --email jane@example.com
```

It connects using the same `MONGODB_URI` as the API, rejects the primary admin's email, requires at least one real showground ID, and hashes passwords identically to the web UI — so accounts made this way sign in normally. Run `npm run manager -- --help` for the full command list.

The default local configuration uses `DEMO_MODE=true`. In that mode OTP verification accepts the code displayed by the backend response, and a simulated M-Pesa callback confirms the booking after a short delay. This is deliberate: it makes the application testable without pretending that a payment has happened.

## Deployment

1. Create a MongoDB Atlas database and copy its connection string.
2. Deploy the repository root to Vercel. Vercel uses `vercel.json` and serves `client/dist`.
3. Deploy the `server` directory as a Render Web Service, or use `render.yaml`.
4. Add the variables from `server/.env.example` to Render.
5. Set `VITE_API_URL` in Vercel to the Render API URL, for example `https://county-plot-hub-api.onrender.com`.
6. Set `CLIENT_ORIGIN` in Render to the exact Vercel URL.
7. Run `npm run seed` once with the production `MONGODB_URI`.
8. Set `DEMO_MODE=false` only after Daraja and Talk Sasa credentials, callback routing, and a small live test have been verified.
9. Configure `APP_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, and `EMAIL_FROM` for admin access and password reset emails. Brevo's free plan is sufficient for low-volume operational emails.

Do not put Daraja or Talk Sasa secrets in the Vercel frontend. Provider credentials belong only in Render environment variables.

## Digitizing plot boundaries

Plots are represented by an `id` plus `offsetN`/`offsetE`, which lets the map position a plot approximately but does not store its true shape. The right way to represent a plot is as a polygon — its actual surveyed boundary — not a single point. The admin workspace's **Plot boundaries** tab (`/admin` → Plot boundaries) is built for this: upload a site-plan image or a GeoJSON file, trace each plot on the map, and save real polygons back onto the plot records.

### Recommended workflow

1. **Get the best available base plan.**
   - Best: survey CAD, Shapefile, KML, or GeoJSON.
   - Acceptable: a dimensioned PDF or image site plan.
   - Avoid drawing from memory or an unscaled photograph.

2. **Georeference the plan.**
   - If the plan already has coordinates (Shapefile/KML/GeoJSON), skip straight to importing it — no manual alignment needed.
   - If it is only an image or PDF, upload it in the Plot boundaries tab and align it against the OpenStreetMap base layer using at least two known points (a road intersection, a survey beacon, a gate, or a building corner): use "Pick SW corner" / "Pick NE corner" to click those points on the map, or enter their coordinates directly. The image overlay is an axis-aligned rectangle, so it works best for plans that are already roughly north-aligned; for a rotated or distorted scan, georeference it properly in GIS software first and export it as GeoJSON instead.
   - For accurate leasing and navigation, use a proper survey or GIS reference rather than estimating from Google imagery.

3. **Draw each plot boundary.**
   - In the Plot boundaries tab, click a plot in the list to start tracing it (this assigns the polygon to that plot ID from the outset).
   - Trace the corners of the plot in order, using the uploaded site plan or the base map as a guide. The shape closes automatically back to the first point when you save — you don't need to click the first point again.
   - Drag any placed vertex to correct its position, either while still drawing or later by reopening the plot with "Edit".
   - Add or update attributes such as category, size, price, and capacity in the **Land leasing** tab, and confirm the plot ID matches the physical signage and booking inventory.

4. **Validate the drawing.**
   - The editor warns in real time, and again after saving, if a shape overlaps another plot's boundary — review and adjust before treating it as final.
   - Check that there are no unintended gaps between adjacent plots.
   - Confirm the plot IDs match the physical signage and booking inventory.
   - Compare the traced shape's size against the advertised plot size (`size`, e.g. `3x3m`).

5. **Or import boundaries in bulk from GeoJSON.**
   - If you already have (or have produced in GIS software) a `FeatureCollection` of `Polygon` features, use "Import boundaries from GeoJSON" in the Plot boundaries tab instead of tracing by hand.
   - Each feature's `id` (or `properties.id` / `properties.plotId`) must match an existing plot ID exactly, for example `A-01`, `A-02`, or `E-15`.
   - The import reports which plot IDs matched, which didn't, and which resulting boundaries overlap another plot, so nothing is silently skipped.
   - Each plot should look like this:

     ```json
     {
       "id": "A-01",
       "category": "Standard stall",
       "size": "3x3m",
       "price": 25000,
       "boundary": {
         "type": "Polygon",
         "coordinates": [
           [
             [36.8219, -1.2921],
             [36.8222, -1.2921],
             [36.8222, -1.2924],
             [36.8219, -1.2924],
             [36.8219, -1.2921]
           ]
         ]
       }
     }
     ```

     GeoJSON coordinates use longitude first, latitude second, and the ring closes by repeating the first point as the last.

Once a plot has a saved `boundary`, the public map renders its real polygon — colored green/amber/grey for available/reserved/taken — instead of the approximate rectangle, and visitors click directly on that polygon to start the existing booking flow. Plots without a digitized boundary keep working exactly as before, using the `offsetN`/`offsetE` approximation, so digitizing can be done incrementally, plot by plot or showground by showground.

## Important payment note

The default transaction type is `CustomerBuyGoodsOnline` and the request includes `PartyB`, as requested. Safaricom account configurations can differ between sandbox and production. If Daraja rejects the transaction type for the shortcode, set `MPESA_TRANSACTION_TYPE` to the value permitted for that account after confirming it with Safaricom.

## Documentation

- [User manual](docs/USER_MANUAL.md)
- [Deployment and operations runbook](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
