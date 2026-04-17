require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const bcrypt       = require('bcryptjs');
const session      = require('express-session');
const MySQLStore   = require('connect-mysql2')(session);
const db           = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Session store (sessions saved in MySQL UserSession table) ─────────────────
const sessionStore = new MySQLStore({
  expiration:          86400000, // 1 day in ms
  createDatabaseTable: false,    // table already created in schema.sql
  schema: {
    tableName:    'UserSession',
    columnNames: {
      session_id: 'session_id',
      expires:    'expires',
      data:       'data'
    }
  }
}, db);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'hyperlocal_secret_key',
  store:             sessionStore,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   86400000, // 1 day
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware: blocks unauthenticated access to protected API routes ────
function requireAuth(req, res, next) {
  if (req.session && req.session.customerId) return next();
  res.status(401).json({ success: false, message: 'Please log in to continue.' });
}

// ── Page routes ───────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// /search is protected: unauthenticated users are redirected to /login
app.get('/search', (req, res) => {
  if (req.session && req.session.customerId) {
    return res.sendFile(path.join(__dirname, 'public', 'search.html'));
  }
  res.redirect('/login');
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    res.json({ success: true, db: rows[0].ok === 1 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
// Creates a new Customer account with a hashed password.
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, preferredCity, eventType } = req.body;

    if (!firstName || !lastName || !email || !phone || !password || !preferredCity || !eventType) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO Customer (first_name, last_name, email, phone, password_hash, preferred_city, event_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName.trim(), lastName.trim(), email.trim(),
        phone.trim(), passwordHash, preferredCity.trim(), eventType.trim()
      ]
    );

    // Log the user in immediately after signup
    req.session.customerId  = result.insertId;
    req.session.customerName = `${firstName.trim()} ${lastName.trim()}`;

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      customer: { id: result.insertId, name: req.session.customerName }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Email or phone already registered.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Verifies credentials and creates a session.
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [rows] = await db.query(
      `SELECT customer_id, first_name, last_name, password_hash, preferred_city, event_type
       FROM Customer WHERE email = ?`,
      [email.trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const customer    = rows[0];
    const passwordOk  = await bcrypt.compare(password, customer.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Save user info in session
    req.session.customerId     = customer.customer_id;
    req.session.customerName   = `${customer.first_name} ${customer.last_name}`;
    req.session.preferredCity  = customer.preferred_city;
    req.session.eventType      = customer.event_type;

    res.json({
      success: true,
      message: 'Logged in successfully.',
      customer: {
        id:            customer.customer_id,
        name:          req.session.customerName,
        preferredCity: customer.preferred_city,
        eventType:     customer.event_type
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Destroys the session on both server (DB) and client.
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed.' });
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Returns the currently logged-in user's basic info (used on page load).
app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.customerId) {
    return res.json({
      success: true,
      customer: {
        id:            req.session.customerId,
        name:          req.session.customerName,
        preferredCity: req.session.preferredCity,
        eventType:     req.session.eventType
      }
    });
  }
  res.status(401).json({ success: false, message: 'Not logged in.' });
});

// ── GET /api/venues ───────────────────────────────────────────────────────────
// Protected. Query params: city (opt), guests (opt), start (req), end (req)
app.get('/api/venues', requireAuth, async (req, res) => {
  try {
    const city   = (req.query.city  || '').trim();
    const guests = req.query.guests ? Number(req.query.guests) : null;
    const start  = (req.query.start || '').trim();
    const end    = (req.query.end   || '').trim();

    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'start and end datetime are required.' });
    }

    const startDate = new Date(start);
    const endDate   = new Date(end);

    if (isNaN(startDate) || isNaN(endDate) || endDate <= startDate) {
      return res.status(400).json({ success: false, message: 'Invalid start or end datetime.' });
    }

    let venueSql = `
      SELECT
        v.venue_id, v.name, v.street, v.city, v.state, v.pincode,
        v.max_capacity, v.base_rate_per_hour, v.amenities,
        o.owner_id,
        o.first_name  AS owner_first_name,
        o.last_name   AS owner_last_name,
        o.email       AS owner_email,
        o.phone       AS owner_phone,
        COUNT(DISTINCT r.room_id) AS room_count
      FROM Venue v
      INNER JOIN Owner o ON o.owner_id = v.owner_id
      LEFT  JOIN Room  r ON r.venue_id = v.venue_id
      WHERE 1=1
    `;
    const venueParams = [];

    if (city) {
      venueSql += ' AND v.city LIKE ?';
      venueParams.push(`%${city}%`);
    }
    if (guests) {
      venueSql += ' AND v.max_capacity >= ?';
      venueParams.push(guests);
    }

    venueSql += `
      GROUP BY
        v.venue_id, v.name, v.street, v.city, v.state, v.pincode,
        v.max_capacity, v.base_rate_per_hour, v.amenities,
        o.owner_id, o.first_name, o.last_name, o.email, o.phone
      ORDER BY v.max_capacity DESC, v.base_rate_per_hour ASC
    `;

    const [venues] = await db.query(venueSql, venueParams);

    if (!venues.length) return res.json({ success: true, venues: [] });

    const venueIds         = venues.map(v => v.venue_id);
    const roomPlaceholders = venueIds.map(() => '?').join(',');

    const [rooms] = await db.query(
      `SELECT
        r.room_id, r.venue_id, r.room_no, r.room_name, r.capacity, r.hourly_rate,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM RoomReservation rr
            WHERE rr.room_id = r.room_id
              AND ? < rr.reserved_to
              AND ? > rr.reserved_from
          ) THEN 0
          ELSE 1
        END AS is_available
      FROM Room r
      WHERE r.venue_id IN (${roomPlaceholders})
      ORDER BY r.venue_id, r.room_id`,
      [end, start, ...venueIds]
    );

    const roomsByVenue = rooms.reduce((acc, room) => {
      if (!acc[room.venue_id]) acc[room.venue_id] = [];
      acc[room.venue_id].push({
        room_id:      room.room_id,
        room_no:      room.room_no,
        room_name:    room.room_name,
        capacity:     Number(room.capacity),
        hourly_rate:  Number(room.hourly_rate),
        is_available: Boolean(room.is_available)
      });
      return acc;
    }, {});

    const data = venues.map(venue => {
      const venueRooms         = roomsByVenue[venue.venue_id] || [];
      const availableRoomCount = venueRooms.filter(r => r.is_available).length;
      return {
        venue_id:           venue.venue_id,
        name:               venue.name,
        street:             venue.street,
        city:               venue.city,
        state:              venue.state,
        pincode:            venue.pincode,
        max_capacity:       Number(venue.max_capacity),
        base_rate_per_hour: Number(venue.base_rate_per_hour),
        amenities: venue.amenities ? venue.amenities.split(',').map(a => a.trim()) : [],
        owner: {
          owner_id: venue.owner_id,
          name:     `${venue.owner_first_name} ${venue.owner_last_name}`,
          email:    venue.owner_email,
          phone:    venue.owner_phone
        },
        room_count:           Number(venue.room_count),
        available_room_count: availableRoomCount,
        availability_status:  availableRoomCount > 0 ? 'Available' : 'Fully Booked',
        rooms: venueRooms
      };
    });

    res.json({ success: true, venues: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/venues/:id ───────────────────────────────────────────────────────
app.get('/api/venues/:id', requireAuth, async (req, res) => {
  try {
    const venueId = Number(req.params.id);
    if (!venueId) return res.status(400).json({ success: false, message: 'Invalid venue id.' });

    const [venues] = await db.query(
      `SELECT
        v.venue_id, v.name, v.street, v.city, v.state, v.pincode,
        v.max_capacity, v.base_rate_per_hour, v.amenities,
        o.owner_id,
        o.first_name AS owner_first_name,
        o.last_name  AS owner_last_name,
        o.email      AS owner_email,
        o.phone      AS owner_phone
      FROM Venue v
      INNER JOIN Owner o ON o.owner_id = v.owner_id
      WHERE v.venue_id = ?`,
      [venueId]
    );

    if (!venues.length) return res.status(404).json({ success: false, message: 'Venue not found.' });

    const [rooms] = await db.query(
      `SELECT room_id, room_no, room_name, capacity, hourly_rate
       FROM Room WHERE venue_id = ? ORDER BY room_id`,
      [venueId]
    );

    const v = venues[0];
    res.json({
      success: true,
      venue: {
        venue_id:           v.venue_id,
        name:               v.name,
        street:             v.street,
        city:               v.city,
        state:              v.state,
        pincode:            v.pincode,
        max_capacity:       Number(v.max_capacity),
        base_rate_per_hour: Number(v.base_rate_per_hour),
        amenities: v.amenities ? v.amenities.split(',').map(a => a.trim()) : [],
        owner: {
          owner_id: v.owner_id,
          name:     `${v.owner_first_name} ${v.owner_last_name}`,
          email:    v.owner_email,
          phone:    v.owner_phone
        },
        rooms: rooms.map(r => ({
          room_id:     r.room_id,
          room_no:     r.room_no,
          room_name:   r.room_name,
          capacity:    Number(r.capacity),
          hourly_rate: Number(r.hourly_rate)
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
