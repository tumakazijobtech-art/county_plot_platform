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
- `POST /api/payments/stk`
- `POST /api/payments/daraja/callback`
- `POST /api/inquiries`

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
