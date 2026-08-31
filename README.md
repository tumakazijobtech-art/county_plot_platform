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

## Important payment note

The default transaction type is `CustomerBuyGoodsOnline` and the request includes `PartyB`, as requested. Safaricom account configurations can differ between sandbox and production. If Daraja rejects the transaction type for the shortcode, set `MPESA_TRANSACTION_TYPE` to the value permitted for that account after confirming it with Safaricom.

## Documentation

- [User manual](docs/USER_MANUAL.md)
- [Deployment and operations runbook](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
