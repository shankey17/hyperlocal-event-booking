# Hyperlocal Event & Venue Booking System

A full-stack DBMS demo project — Node.js + Express backend, MySQL database (Aiven), hosted on Railway.

---

## Folder structure

```
hyperlocal_event_booking/
├── server.js          ← Express server + all API routes
├── db.js              ← MySQL connection pool (uses DATABASE_URL)
├── schema.sql         ← Full DB schema + sample data (run once on Aiven)
├── package.json
├── README.md
└── public/
    ├── index.html     ← Homepage with enquiry form
    ├── search.html    ← Venue search + availability page
    ├── app.js         ← Frontend JS (fetch calls, rendering)
    └── styles.css
```

---

## Database tables

| Table | Purpose |
|---|---|
| `Owner` | Venue owners |
| `Venue` | Venue details (includes `amenities` as a comma-separated column) |
| `Amenity` / `VenueAmenity` | Normalized amenity reference (for DBMS demo) |
| `Room` | Rooms inside each venue |
| `Customer` | Customers |
| `Event` / `EventType` | Event details and type lookup |
| `Booking` / `BookingStatus` | Bookings with status FK |
| `Payment` / `PaymentStatus` | Payment records |
| `ServiceVendor` / `BookingService` | External vendors and booked services |
| `RoomReservation` | Time-slot reservations; overlap prevented by trigger |
| `SurveyLead` | Enquiry form submissions from the homepage |

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | DB connectivity check |
| POST | `/api/signup` | Save homepage enquiry to `SurveyLead` |
| GET | `/api/venues?city=&guests=&start=&end=` | Search venues with room availability |
| GET | `/api/venues/:id` | Single venue detail |

---

## Local setup

1. Install **Node.js LTS**.
2. Install packages:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```
   DATABASE_URL=mysql://user:password@host:port/defaultdb?ssl-mode=REQUIRED
   PORT=3000
   ```
4. Run `schema.sql` once in your MySQL client (Aiven or local).
5. Start the server:
   ```bash
   npm start
   ```
6. Open `http://localhost:3000`

---

## Deployment

### Aiven (MySQL)

1. Create an **Aiven MySQL** service.
2. From the Aiven console, copy the **Service URI** — it looks like:
   ```
   mysql://avnadmin:password@host:port/defaultdb?ssl-mode=REQUIRED
   ```
3. Open **Query Editor** (or connect via MySQL Workbench) and run `schema.sql`.

### Railway

1. Push the project to GitHub.
2. On Railway: **New Project → Deploy from GitHub repo**.
3. Add one environment variable:
   ```
   DATABASE_URL = <your Aiven Service URI>
   ```
   Railway sets `PORT` automatically — no need to add it.
4. Set the start command (Railway usually auto-detects from `package.json`):
   ```
   node server.js
   ```
5. Deploy. Railway will run `npm install` and start the server.

> **Important:** Do not add `DB_HOST`, `DB_USER`, etc. separately.  
> This project only uses `DATABASE_URL`. Aiven's Service URI already contains all credentials.

---

## How availability checking works

When you search with a time slot, the backend runs this check per room:

```sql
CASE
  WHEN EXISTS (
    SELECT 1 FROM RoomReservation rr
    WHERE rr.room_id = r.room_id
      AND ? < rr.reserved_to    -- your start < existing end
      AND ? > rr.reserved_from  -- your end   > existing start
  ) THEN 0   -- overlaps → Booked
  ELSE 1     -- no overlap → Available
END AS is_available
```

A trigger (`trg_no_overlap`) also prevents overlapping inserts at the DB level.
