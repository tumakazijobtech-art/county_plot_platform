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

Do not put Daraja or Talk Sasa secrets in the Vercel frontend. Provider credentials belong only in Render environment variables.

## Important payment note

The default transaction type is `CustomerBuyGoodsOnline` and the request includes `PartyB`, as requested. Safaricom account configurations can differ between sandbox and production. If Daraja rejects the transaction type for the shortcode, set `MPESA_TRANSACTION_TYPE` to the value permitted for that account after confirming it with Safaricom.

## Documentation

- [User manual](docs/USER_MANUAL.md)
- [Deployment and operations runbook](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
