# Deployment and operations runbook

## MongoDB Atlas

1. Create a cluster and a database named `county_plot_hub`.
2. Add the Render outbound IP policy required by your Atlas plan. For a quick first deployment, Atlas can allow all IPs, but a restricted policy is preferable.
3. Create a least-privilege database user.
4. Put the connection string in Render as `MONGODB_URI`.

## Render API

Required:

- `MONGODB_URI`
- `CLIENT_ORIGIN`
- `DEMO_MODE=false`

Set `CLIENT_ORIGIN` to the exact public URL of the deployed frontend, without a path. For example:

```text
CLIENT_ORIGIN=https://county-plot-platform.vercel.app
```

Multiple frontend URLs can be separated with commas. After changing this variable, manually redeploy the Render service. The API accepts origins with or without a trailing slash.

Daraja:

- `MPESA_ENV=sandbox` or `live`
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORT_CODE`
- `MPESA_PARTY_B`
- `MPESA_PASSKEY`
- `MPESA_CALLBACK_URL`
- `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline`

Talk Sasa:

- `TALKSASA_API_KEY`
- `TALKSASA_SENDER_ID`
- `TALKSASA_API_URL`

The Talk Sasa URL is configurable because account plans can expose different API endpoints. The standard SMS endpoint is `https://bulksms.talksasa.com/api/v3/sms/send`; the adapter sends JSON with `recipient`, `sender_id`, `type: "plain"`, and `message`, using a bearer token. Confirm the endpoint and sender ID for the Talk Sasa account before enabling production SMS.

## Vercel frontend

Set:

```text
VITE_API_URL=https://your-render-service.onrender.com
```

Redeploy after changing the variable. The frontend never receives provider secrets.

## Callback routing

Set `MPESA_CALLBACK_URL` to:

```text
https://your-render-service.onrender.com/api/payments/daraja/callback
```

Daraja callbacks are accepted without a browser session and matched by `CheckoutRequestID`. The backend updates the same payment record idempotently, so repeated callbacks do not double-confirm a booking.

## Health checks

- `GET /health` verifies API liveness and reports MongoDB readiness.
- `GET /api/showgrounds` verifies catalog access.
- `GET /api/bookings/:id` verifies a booking/permit record.

## Production hardening checklist

- Use HTTPS URLs for both Vercel and Render.
- Keep `DEMO_MODE=false`.
- Restrict MongoDB network access.
- Rotate provider credentials through the provider dashboards, not source code.
- Configure monitoring for 5xx responses and payment callback failures.
- Back up MongoDB before major catalog changes.
- Add an authenticated staff/admin surface before exposing catalog editing.
