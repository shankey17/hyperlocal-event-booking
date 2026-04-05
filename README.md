# Hyperlocal Event & Venue Booking System

A small full-stack demo project for a DBMS assignment.

## Features
- Home page with enquiry form
- SurveyLead table stores enquiries
- Venue search page with filters
- Availability check using RoomReservation data
- Node.js + Express backend
- MySQL database integration
- Bootstrap frontend via CDN
- Deployment-ready for Render + Aiven

## Folder structure

```text
hyperlocal_event_booking/
├── server.js
├── db.js
├── schema.sql
├── .env.example
├── package.json
├── README.md
└── public/
    ├── index.html
    ├── search.html
    ├── styles.css
    └── app.js
```

## Local setup

1. Install Node.js LTS.
2. Open terminal inside the project folder.
3. Install packages:
```bash
npm install
```
4. Create a MySQL database and run `schema.sql`.
5. Copy `.env.example` to `.env` and fill in your Aiven credentials.
6. Start the app:
```bash
npm start
```
7. Open:
```text
http://localhost:3000
```

## Database import

Run `schema.sql` in MySQL Workbench or your preferred MySQL client.

The schema creates these tables:
- Owner
- Venue
- Room
- Customer
- Event
- Booking
- Payment
- ServiceVendor
- BookingService
- RoomReservation
- SurveyLead

## Deployment guide

### Aiven MySQL
1. Create an Aiven MySQL service.
2. Note the host, port, user, password, and database name.
3. Import `schema.sql` into the database.
4. Keep the service credentials for Render.

### Render
1. Push the project to GitHub.
2. Create a new Render Web Service.
3. Connect the GitHub repository.
4. Set build command:
```bash
npm install
```
5. Set start command:
```bash
node server.js
```
6. Add environment variables:
- DB_HOST
- DB_USER
- DB_PASSWORD
- DB_NAME
- DB_PORT
- PORT (Render sets this automatically, so optional)
7. Deploy the service.

## API endpoints
- `POST /api/signup`
- `GET /api/venues?city=&guests=&start=&end=`
- `GET /api/venues/:id`

## Notes
- Frontend is served directly by Express from the `public` folder.
- The homepage is `/`.
- The search page is `/search`.
- Signup redirects to search after saving the enquiry.
