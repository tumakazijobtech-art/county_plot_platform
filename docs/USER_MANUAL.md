# County Plot Hub — User Manual

## For exhibitors

### 1. Choose a showground

Use the Kenya map or the showground cards. Each card shows the county, number of available plots, and the leasing-window countdown. Browsing is available even when booking is closed.

### 2. Browse plots

Filter by size, availability, or expected traffic. Select a plot to open its map view.

### 3. Inspect the site plan

The Leaflet site plan draws each plot from its stored GPS centre and physical dimensions. Select a rectangle to see price, capacity, GPS centre, category, and status.

### 4. Ask a question

Select **Ask a question**, enter the question, and provide a phone number. The question is stored for the showground team. In production, connect the team workflow to the inquiry collection or add an admin inbox.

### 5. Start a booking

For an available plot during its leasing window:

1. Enter the exhibitor or business name.
2. Enter a Kenyan mobile number.
3. Request and verify the OTP sent through Talk Sasa.
4. Enter stand requirements.
5. Review the total and details.
6. Select **Confirm and pay**.

The plot is temporarily reserved while payment is pending. Do not close the payment screen until the result is displayed.

### 6. Complete payment

With live Daraja credentials, the phone receives an M-Pesa prompt. Enter the M-Pesa PIN on the phone. The browser polls the booking status while the Daraja callback is processed.

### 7. Download the permit

When the payment is confirmed, the permit screen displays the permit reference and QR verification value. Download the PDF and present it with valid ID at the gate.

### 8. Verify an exhibitor permit

Select **Scan permit** in the header, allow camera access, and point the camera at the permit QR code. The scanner retrieves the confirmed permit from the server and displays the exhibitor, showground, plot, setup date, and amount paid. If camera scanning is unavailable, enter the permit number manually.

## For showground staff

- Open `/admin` and sign in with the primary administrator credentials.
- Use **Land leasing** to create, edit, and delete showgrounds and to add, edit, or remove plots. A showground or plot with active bookings cannot be deleted.
- Keep plot status values as `available`, `reserved`, or `taken`. Do not manually mark a plot as `taken` until payment has been confirmed, unless correcting a record.
- Use **Managers** to create individual manager accounts and assign each account one or more showgrounds. Managers have read-only, server-enforced access to their assigned locations only.
- Use **Logo & theme** to change the logo shown on the public booking flow and lease permits, plus the site's primary, accent, background, surface, and text colors.
- Set a WhatsApp number on each showground's inventory record. Questions submitted for that location are saved and open a pre-addressed WhatsApp message to its number.
- Review `Booking` and `Payment` records together when reconciling M-Pesa.
- Use **Visitors & gate** to approve visitors and record QR/manual check-ins and check-outs.

## Demo mode

Demo mode is for local QA only. It does not charge M-Pesa and does not send a real SMS. The OTP response includes `demoCode`, and a simulated payment callback confirms the booking.

## Recommended daily workflow

1. Confirm the show season and prices.
2. Confirm plot statuses before opening registration.
3. Test one OTP request and one payment in the provider's sandbox.
4. Monitor Render logs for callback and provider errors.
5. Export or reconcile confirmed bookings before the show.
