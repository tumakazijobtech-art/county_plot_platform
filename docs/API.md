# API reference

Base URL: `http://localhost:4000`

## Public

- `GET /health`
- `GET /api/showgrounds`
- `GET /api/showgrounds/:showgroundId`
- `POST /api/otp/request`
- `POST /api/otp/verify`
- `POST /api/bookings`
- `GET /api/bookings/:bookingId`
- `GET /api/permits/:permitRef`
- `POST /api/payments/stk`
- `POST /api/payments/daraja/callback`
- `POST /api/inquiries`
- `GET /api/settings`

## Admin

Admin routes require `Authorization: Bearer <session-token>`. Tokens are issued by the login endpoint and expire after eight hours.

- `POST /api/admin/auth/login`
- `POST /api/admin/auth/forgot-password`
- `POST /api/admin/auth/reset-password`
- `GET /api/admin/auth/me`
- `GET /api/admin/dashboard`
- `GET /api/admin/showgrounds`
- `PUT /api/admin/showgrounds/:showgroundId`
- `GET /api/admin/bookings`
- `PATCH /api/admin/bookings/:bookingId/approval`
- `GET /api/admin/visitors`
- `POST /api/admin/visitors`
- `PATCH /api/admin/visitors/:visitorId/approval`
- `POST /api/admin/visitors/scan`
- `GET /api/admin/settings`
- `PUT /api/admin/settings`

`POST /api/admin/visitors/scan` accepts a `permitRef` or an existing `visitorId`, plus `action` set to `check_in` or `check_out`. Password reset email delivery uses Brevo when `BREVO_API_KEY` is configured; demo mode exposes the reset link for local testing.

## Booking creation body

```json
{
  "showgroundId": "nairobi",
  "plotId": "A-01",
  "exhibitorName": "Kibaki Dairy Farmers Co-op",
  "phone": "0712345678",
  "exhibitorCount": 2,
  "powerNeed": "single",
  "signageText": "Kibaki Dairy",
  "setupDate": "2026-09-04",
  "competitionOptIn": true,
  "otpToken": "verified-session-token"
}
```

## Error format

```json
{
  "error": "Human-readable message",
  "code": "VALIDATION_ERROR"
}
```
