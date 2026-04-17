# Hyperlocal Event & Venue Booking System

A full-stack DBMS demo project — Node.js + Express backend, MySQL (Aiven), hosted on Railway.

---

## Folder structure

```
hyperlocal_event_booking/
├── server.js          ← Express server, all API routes, session setup
├── db.js              ← MySQL connection pool (uses DATABASE_URL)
├── schema.sql         ← Full DB schema + sample data (run once on Aiven)
├── package.json
├── README.md
└── public/
    ├── index.html     ← Landing page (no auth required)
    ├── login.html     ← Login page
    ├── signup.html    ← Signup page
    ├── search.html    ← Venue search (login required)
    ├── app.js         ← Search page JS (venue fetch + rendering)
    └── styles.css
```

---

## Database tables

| Table | Purpose |
|---|---|
| `Owner` | Venue owners |
| `Venue` | Venue details with amenities column |
| `Amenity` / `VenueAmenity` | Normalized amenity reference |
| `Room` | Rooms inside each venue |
| `Customer` | User accounts (stores password_hash, preferred_city, event_type) |
| `UserSession` | Active login sessions stored in MySQL (managed by express-session) |
| `Event` / `EventType` | Event details and type lookup |
| `Booking` / `BookingStatus` | Bookings with FK status |
| `Payment` / `PaymentStatus` | Payment records |
| `ServiceVendor` / `BookingService` | Vendors and booked services |
| `RoomReservation` | Time-slot reservations; overlap prevented by trigger |

---

## Auth flow

1. User signs up → password hashed with **bcrypt** → stored in `Customer.password_hash`
2. Login → password compared with bcrypt → session created and saved in **MySQL `UserSession` table**
3. Session cookie sent to browser → every subsequent request carries it automatically
4. `/search` page and `/api/venues` routes check for a valid session — redirect/401 if missing
5. Logout → session destroyed in DB and cookie cleared

---

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | No | DB connectivity check |
| POST | `/api/auth/signup` | No | Register new customer account |
| POST | `/api/auth/login` | No | Login and create session |
| POST | `/api/auth/logout` | Yes | Destroy session |
| GET | `/api/auth/me` | Yes | Get logged-in user info |
| GET | `/api/venues?city=&guests=&start=&end=` | Yes | Search venues with availability |
| GET | `/api/venues/:id` | Yes | Single venue detail |

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
   SESSION_SECRET=any_long_random_string
   PORT=3000
   ```
4. Run `schema.sql` once in your MySQL client.
5. Start:
   ```bash
   npm start
   ```
6. Open `http://localhost:3000`

---

## Deployment (Railway + Aiven)

### Aiven
1. Create an Aiven MySQL service.
2. Copy the **Service URI** from the Aiven console.
3. Run `schema.sql` via the Aiven Query Editor or MySQL Workbench.

### Railway
1. Push project to GitHub.
2. New Project → Deploy from GitHub repo.
3. Add environment variables:
   ```
   DATABASE_URL = <Aiven Service URI>
   SESSION_SECRET = <any long random string>
   ```
   Railway sets `PORT` automatically.
4. Deploy — Railway runs `npm install` and `node server.js` automatically.

---

## Demo credentials (from sample data)

| Email | Password |
|---|---|
| c1@mail.com | password123 |
| c2@mail.com | password123 |
