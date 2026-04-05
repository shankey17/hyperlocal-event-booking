require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/search', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'search.html'));
});

app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    res.json({ success: true, db: rows[0].ok === 1 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { fullName, email, phone, preferredCity, eventType } = req.body;

    if (!fullName || !email || !phone || !preferredCity || !eventType) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, phone, preferred city, and event type are required.'
      });
    }

    const sql = `
      INSERT INTO SurveyLead (full_name, email, phone, preferred_city, event_type)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(sql, [
      fullName.trim(),
      email.trim(),
      phone.trim(),
      preferredCity.trim(),
      eventType.trim()
    ]);

    res.status(201).json({
      success: true,
      message: 'Enquiry saved successfully.',
      leadId: result.insertId
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Email or phone already exists.'
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/venues', async (req, res) => {
  try {
    const city = (req.query.city || '').trim();
    const guests = req.query.guests ? Number(req.query.guests) : null;
    const start = (req.query.start || '').trim();
    const end = (req.query.end || '').trim();

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'start and end datetime are required for availability search.'
      });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid start or end datetime.'
      });
    }

    let venueSql = `
      SELECT
        v.venue_id,
        v.name,
        v.street,
        v.city,
        v.state,
        v.pincode,
        v.max_capacity,
        v.base_rate_per_hour,
        v.amenities,
        o.owner_id,
        o.first_name AS owner_first_name,
        o.last_name AS owner_last_name,
        o.email AS owner_email,
        o.phone AS owner_phone,
        COUNT(DISTINCT r.room_id) AS room_count
      FROM Venue v
      INNER JOIN Owner o ON o.owner_id = v.owner_id
      LEFT JOIN Room r ON r.venue_id = v.venue_id
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

    if (!venues.length) {
      return res.json({ success: true, venues: [] });
    }

    const venueIds = venues.map(v => v.venue_id);
    const roomPlaceholders = venueIds.map(() => '?').join(',');

    const [rooms] = await db.query(
      `
      SELECT
        r.room_id,
        r.venue_id,
        r.room_no,
        r.room_name,
        r.capacity,
        r.hourly_rate,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM RoomReservation rr
            WHERE rr.room_id = r.room_id
              AND ? < rr.reserved_to
              AND ? > rr.reserved_from
          )
          THEN 0
          ELSE 1
        END AS is_available
      FROM Room r
      WHERE r.venue_id IN (${roomPlaceholders})
      ORDER BY r.venue_id, r.room_id
      `,
      [end, start, ...venueIds]
    );

    const roomsByVenue = rooms.reduce((acc, room) => {
      if (!acc[room.venue_id]) acc[room.venue_id] = [];
      acc[room.venue_id].push({
        room_id: room.room_id,
        room_no: room.room_no,
        room_name: room.room_name,
        capacity: Number(room.capacity),
        hourly_rate: Number(room.hourly_rate),
        is_available: Boolean(room.is_available)
      });
      return acc;
    }, {});

    const data = venues.map(venue => {
      const venueRooms = roomsByVenue[venue.venue_id] || [];
      const availableRoomCount = venueRooms.filter(room => room.is_available).length;
      return {
        venue_id: venue.venue_id,
        name: venue.name,
        street: venue.street,
        city: venue.city,
        state: venue.state,
        pincode: venue.pincode,
        max_capacity: Number(venue.max_capacity),
        base_rate_per_hour: Number(venue.base_rate_per_hour),
        amenities: venue.amenities ? venue.amenities.split(',').map(item => item.trim()) : [],
        owner: {
          owner_id: venue.owner_id,
          name: `${venue.owner_first_name} ${venue.owner_last_name}`,
          email: venue.owner_email,
          phone: venue.owner_phone
        },
        room_count: Number(venue.room_count),
        available_room_count: availableRoomCount,
        availability_status: availableRoomCount > 0 ? 'Available' : 'Fully Booked',
        rooms: venueRooms
      };
    });

    res.json({ success: true, venues: data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/venues/:id', async (req, res) => {
  try {
    const venueId = Number(req.params.id);
    if (!venueId) {
      return res.status(400).json({ success: false, message: 'Invalid venue id.' });
    }

    const [venues] = await db.query(
      `
      SELECT
        v.venue_id,
        v.name,
        v.street,
        v.city,
        v.state,
        v.pincode,
        v.max_capacity,
        v.base_rate_per_hour,
        v.amenities,
        o.owner_id,
        o.first_name AS owner_first_name,
        o.last_name AS owner_last_name,
        o.email AS owner_email,
        o.phone AS owner_phone
      FROM Venue v
      INNER JOIN Owner o ON o.owner_id = v.owner_id
      WHERE v.venue_id = ?
      `,
      [venueId]
    );

    if (!venues.length) {
      return res.status(404).json({ success: false, message: 'Venue not found.' });
    }

    const [rooms] = await db.query(
      `SELECT room_id, room_no, room_name, capacity, hourly_rate FROM Room WHERE venue_id = ? ORDER BY room_id`,
      [venueId]
    );

    const venue = venues[0];
    res.json({
      success: true,
      venue: {
        venue_id: venue.venue_id,
        name: venue.name,
        street: venue.street,
        city: venue.city,
        state: venue.state,
        pincode: venue.pincode,
        max_capacity: Number(venue.max_capacity),
        base_rate_per_hour: Number(venue.base_rate_per_hour),
        amenities: venue.amenities ? venue.amenities.split(',').map(item => item.trim()) : [],
        owner: {
          owner_id: venue.owner_id,
          name: `${venue.owner_first_name} ${venue.owner_last_name}`,
          email: venue.owner_email,
          phone: venue.owner_phone
        },
        rooms: rooms.map(room => ({
          room_id: room.room_id,
          room_no: room.room_no,
          room_name: room.room_name,
          capacity: Number(room.capacity),
          hourly_rate: Number(room.hourly_rate)
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { customerId, venueId, eventId, eventDate, status = 'pending', totalAmount = 0 } = req.body;

    if (!customerId || !venueId || !eventId || !eventDate) {
      return res.status(400).json({
        success: false,
        message: 'customerId, venueId, eventId and eventDate are required.'
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO Booking (customer_id, venue_id, event_id, event_date, status, total_amount)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [customerId, venueId, eventId, eventDate, status, totalAmount]
    );

    res.status(201).json({
      success: true,
      message: 'Booking created successfully.',
      bookingId: result.insertId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
