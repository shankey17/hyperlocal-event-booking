-- =============================================
-- Hyperlocal Event & Venue Booking System
-- Drops and recreates the database from scratch.
-- Run this in your Aiven MySQL client (Query Editor / Workbench).
-- =============================================

DROP DATABASE IF EXISTS defaultdb;
CREATE DATABASE defaultdb;
USE defaultdb;

-- =====================
-- LOOKUP TABLES
-- =====================

CREATE TABLE `BookingStatus` (
  status_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO `BookingStatus` (name)
VALUES ('pending'), ('confirmed'), ('cancelled');

CREATE TABLE `PaymentStatus` (
  status_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO `PaymentStatus` (name)
VALUES ('pending'), ('partially_paid'), ('paid'), ('failed'), ('refunded');

CREATE TABLE `EventType` (
  type_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO `EventType` (name)
VALUES ('birthday'), ('wedding'), ('corporate'), ('social'), ('other');

-- =====================
-- CORE TABLES
-- =====================

CREATE TABLE `Owner` (
  owner_id    INT AUTO_INCREMENT PRIMARY KEY,
  first_name  VARCHAR(50),
  last_name   VARCHAR(50),
  email       VARCHAR(100) UNIQUE,
  phone       VARCHAR(15)  UNIQUE,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- NOTE: amenities stored as comma-separated string for easy display.
-- VenueAmenity junction table is also kept for normalized reference.
CREATE TABLE `Venue` (
  venue_id          INT AUTO_INCREMENT PRIMARY KEY,
  owner_id          INT NOT NULL,
  name              VARCHAR(120) NOT NULL,
  street            VARCHAR(150),
  city              VARCHAR(80),
  state             VARCHAR(80),
  pincode           VARCHAR(10),
  max_capacity      INT,
  base_rate_per_hour DECIMAL(10,2),
  amenities         VARCHAR(500),           -- e.g. 'WiFi, Parking, AC'
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES `Owner`(owner_id)
) ENGINE=InnoDB;

-- =====================
-- AMENITIES (Normalized reference)
-- =====================

CREATE TABLE `Amenity` (
  amenity_id INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE `VenueAmenity` (
  venue_id   INT,
  amenity_id INT,
  PRIMARY KEY (venue_id, amenity_id),
  FOREIGN KEY (venue_id)   REFERENCES `Venue`(venue_id)   ON DELETE CASCADE,
  FOREIGN KEY (amenity_id) REFERENCES `Amenity`(amenity_id) ON DELETE CASCADE
);

-- =====================
-- ROOMS
-- =====================

CREATE TABLE `Room` (
  room_id    INT AUTO_INCREMENT PRIMARY KEY,
  venue_id   INT NOT NULL,
  room_no    VARCHAR(20),
  room_name  VARCHAR(100),
  capacity   INT,
  hourly_rate DECIMAL(10,2),
  UNIQUE (venue_id, room_no),
  FOREIGN KEY (venue_id) REFERENCES `Venue`(venue_id) ON DELETE CASCADE
);

-- =====================
-- CUSTOMER
-- =====================

CREATE TABLE `Customer` (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name  VARCHAR(50),
  last_name   VARCHAR(50),
  email       VARCHAR(100) UNIQUE,
  phone       VARCHAR(15)  UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- EVENT
-- =====================

CREATE TABLE `Event` (
  event_id        INT AUTO_INCREMENT PRIMARY KEY,
  type_id         INT,
  title           VARCHAR(120),
  expected_guests INT,
  start_datetime  DATETIME,
  end_datetime    DATETIME,
  FOREIGN KEY (type_id) REFERENCES `EventType`(type_id)
);

-- =====================
-- BOOKING
-- =====================

CREATE TABLE `Booking` (
  booking_id   INT AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT,
  venue_id     INT,
  event_id     INT,
  status_id    INT,
  total_amount DECIMAL(12,2) DEFAULT 0,
  event_date   DATE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES `Customer`(customer_id),
  FOREIGN KEY (venue_id)    REFERENCES `Venue`(venue_id),
  FOREIGN KEY (event_id)    REFERENCES `Event`(event_id),
  FOREIGN KEY (status_id)   REFERENCES `BookingStatus`(status_id)
);

CREATE INDEX idx_booking_date   ON `Booking`(event_date);
CREATE INDEX idx_booking_status ON `Booking`(status_id);

-- =====================
-- PAYMENT
-- =====================

CREATE TABLE `Payment` (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT,
  amount     DECIMAL(12,2),
  payment_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  method     VARCHAR(50),
  status_id  INT,
  FOREIGN KEY (booking_id) REFERENCES `Booking`(booking_id) ON DELETE CASCADE,
  FOREIGN KEY (status_id)  REFERENCES `PaymentStatus`(status_id)
);

CREATE INDEX idx_payment_status ON `Payment`(status_id);

-- =====================
-- SERVICE VENDOR
-- =====================

CREATE TABLE `ServiceVendor` (
  vendor_id     INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120),
  contact_email VARCHAR(100) UNIQUE,
  contact_phone VARCHAR(15)  UNIQUE,
  avg_rating    DECIMAL(3,2)
);

CREATE TABLE `BookingService` (
  booking_service_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id         INT,
  vendor_id          INT,
  service_name       VARCHAR(100),
  unit_price         DECIMAL(10,2),
  quantity           INT,
  FOREIGN KEY (booking_id) REFERENCES `Booking`(booking_id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id)  REFERENCES `ServiceVendor`(vendor_id)
);

-- =====================
-- ROOM RESERVATION
-- =====================

CREATE TABLE `RoomReservation` (
  room_reservation_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id          INT,
  room_id             INT,
  reserved_from       DATETIME,
  reserved_to         DATETIME,
  reserved_rate       DECIMAL(10,2),
  FOREIGN KEY (booking_id) REFERENCES `Booking`(booking_id) ON DELETE CASCADE,
  FOREIGN KEY (room_id)    REFERENCES `Room`(room_id)
);

CREATE INDEX idx_rr_room_time
  ON `RoomReservation`(room_id, reserved_from, reserved_to);

-- =====================
-- SURVEY LEAD
-- Stores homepage enquiry form submissions
-- =====================

CREATE TABLE `SurveyLead` (
  lead_id        INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(100) UNIQUE NOT NULL,
  phone          VARCHAR(15)  UNIQUE NOT NULL,
  preferred_city VARCHAR(80),
  event_type     VARCHAR(50),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- TRIGGER: Prevent overlapping room reservations
-- =====================

DROP TRIGGER IF EXISTS trg_no_overlap;

DELIMITER $$

CREATE TRIGGER trg_no_overlap
BEFORE INSERT ON `RoomReservation`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM `RoomReservation`
    WHERE room_id = NEW.room_id
      AND NEW.reserved_from < reserved_to
      AND NEW.reserved_to   > reserved_from
  ) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Room already booked in this time slot';
  END IF;
END$$

DELIMITER ;

-- =============================================
-- SAMPLE DATA
-- =============================================

-- OWNER
INSERT INTO `Owner` (first_name, last_name, email, phone) VALUES
('Amit',  'Sharma', 'amit1@mail.com',  '9000000001'),
('Neha',  'Verma',  'neha2@mail.com',  '9000000002'),
('Raj',   'Singh',  'raj3@mail.com',   '9000000003'),
('Pooja', 'Mehta',  'pooja4@mail.com', '9000000004'),
('Karan', 'Patel',  'karan5@mail.com', '9000000005'),
('Sneha', 'Rao',    'sneha6@mail.com', '9000000006'),
('Vikas', 'Gupta',  'vikas7@mail.com', '9000000007'),
('Anita', 'Das',    'anita8@mail.com', '9000000008'),
('Rohit', 'Nair',   'rohit9@mail.com', '9000000009'),
('Divya', 'Iyer',   'divya10@mail.com','9000000010');

-- VENUE (amenities column filled as readable string)
INSERT INTO `Venue` (owner_id, name, city, state, pincode, max_capacity, base_rate_per_hour, amenities) VALUES
(1,  'Grand Hall',   'Chennai',   'TN', '600001', 500, 5000, 'WiFi, Parking, AC'),
(2,  'Elite Center', 'Bangalore', 'KA', '560001', 300, 4000, 'WiFi, Projector, Sound System'),
(3,  'Royal Palace', 'Hyderabad', 'TS', '500001', 600, 7000, 'Parking, Stage, Catering'),
(4,  'City Hub',     'Mumbai',    'MH', '400001', 200, 3000, 'AC, Security, Lighting'),
(5,  'Skyline',      'Delhi',     'DL', '110001', 450, 5500, 'WiFi, Parking, Decoration'),
(6,  'Green Park',   'Pune',      'MH', '411001', 350, 4500, 'AC, Projector'),
(7,  'Riverfront',   'Ahmedabad', 'GJ', '380001', 250, 3500, 'Sound System, Stage'),
(8,  'Ocean View',   'Goa',       'GA', '403001', 400, 6000, 'Catering, Security'),
(9,  'Hilltop',      'Shimla',    'HP', '171001', 150, 2500, 'Lighting, Decoration'),
(10, 'Metro Hall',   'Kolkata',   'WB', '700001', 500, 5000, 'WiFi, Parking');

-- AMENITY
INSERT INTO `Amenity` (name) VALUES
('WiFi'), ('Parking'), ('AC'), ('Projector'), ('Sound System'),
('Stage'), ('Catering'), ('Security'), ('Lighting'), ('Decoration');

-- VENUE AMENITY (normalized reference, mirrors the amenities column above)
INSERT INTO `VenueAmenity` VALUES
(1,1),(1,2),(1,3),
(2,1),(2,4),(2,5),
(3,2),(3,6),(3,7),
(4,3),(4,8),(4,9),
(5,1),(5,2),(5,10),
(6,3),(6,4),
(7,5),(7,6),
(8,7),(8,8),
(9,9),(9,10),
(10,1),(10,2);

-- ROOM
INSERT INTO `Room` (venue_id, room_no, room_name, capacity, hourly_rate) VALUES
(1,  '101', 'Main Hall',    300, 2500),
(1,  '102', 'VIP Lounge',   100, 1500),
(2,  '201', 'Conference A', 150, 1800),
(3,  '301', 'Banquet',      400, 3000),
(4,  '401', 'Mini Hall',    120, 1200),
(5,  '501', 'Deluxe',       250, 2200),
(6,  '601', 'Standard',     200, 2000),
(7,  '701', 'Hall A',       180, 1700),
(8,  '801', 'Beach Hall',   350, 2800),
(9,  '901', 'Hill Room',    100, 1000);

-- CUSTOMER
INSERT INTO `Customer` (first_name, last_name, email, phone) VALUES
('Rahul',  'Das',    'c1@mail.com',  '9100000001'),
('Priya',  'Nair',   'c2@mail.com',  '9100000002'),
('Arjun',  'Reddy',  'c3@mail.com',  '9100000003'),
('Meena',  'Kumari', 'c4@mail.com',  '9100000004'),
('Suresh', 'Yadav',  'c5@mail.com',  '9100000005'),
('Anil',   'Kapoor', 'c6@mail.com',  '9100000006'),
('Kavya',  'Menon',  'c7@mail.com',  '9100000007'),
('Deepak', 'Joshi',  'c8@mail.com',  '9100000008'),
('Ritu',   'Shah',   'c9@mail.com',  '9100000009'),
('Nikhil', 'Jain',   'c10@mail.com', '9100000010');

-- EVENT
INSERT INTO `Event` (type_id, title, expected_guests, start_datetime, end_datetime) VALUES
(1, 'Birthday Party',   100, '2026-05-01 18:00', '2026-05-01 22:00'),
(2, 'Wedding',          300, '2026-05-02 10:00', '2026-05-02 20:00'),
(3, 'Corporate Meet',    80, '2026-05-03 09:00', '2026-05-03 12:00'),
(4, 'Social Gathering', 120, '2026-05-04 17:00', '2026-05-04 21:00'),
(5, 'Concert',          400, '2026-05-05 18:00', '2026-05-05 23:00'),
(1, 'Birthday Bash',     90, '2026-05-06 18:00', '2026-05-06 22:00'),
(3, 'Office Meet',       70, '2026-05-07 09:00', '2026-05-07 12:00'),
(4, 'Friends Meetup',   110, '2026-05-08 17:00', '2026-05-08 21:00'),
(2, 'Reception',        250, '2026-05-09 10:00', '2026-05-09 20:00'),
(5, 'Music Night',      350, '2026-05-10 18:00', '2026-05-10 23:00');

-- BOOKING
INSERT INTO `Booking` (customer_id, venue_id, event_id, status_id, total_amount, event_date) VALUES
(1,  1,  1,  2, 15000, '2026-05-01'),
(2,  2,  2,  1, 30000, '2026-05-02'),
(3,  3,  3,  2,  8000, '2026-05-03'),
(4,  4,  4,  3, 10000, '2026-05-04'),
(5,  5,  5,  2, 20000, '2026-05-05'),
(6,  6,  6,  1,  7000, '2026-05-06'),
(7,  7,  7,  2,  6000, '2026-05-07'),
(8,  8,  8,  2, 25000, '2026-05-08'),
(9,  9,  9,  3,  5000, '2026-05-09'),
(10, 10, 10, 2,  9000, '2026-05-10');

-- PAYMENT
INSERT INTO `Payment` (booking_id, amount, method, status_id) VALUES
(1,  5000, 'upi',  2),
(1, 10000, 'card', 3),
(2, 30000, 'bank', 3),
(3,  8000, 'upi',  3),
(4,  5000, 'cash', 1),
(5, 20000, 'card', 3),
(6,  7000, 'upi',  3),
(7,  6000, 'upi',  3),
(8, 25000, 'bank', 3),
(9,  5000, 'cash', 4);

-- SERVICE VENDOR
INSERT INTO `ServiceVendor` (name, contact_email, contact_phone, avg_rating) VALUES
('Spice Catering', 'v1@mail.com',  '9200000001', 4.5),
('Bloom Decor',    'v2@mail.com',  '9200000002', 4.2),
('SoundPro',       'v3@mail.com',  '9200000003', 4.8),
('LightFX',        'v4@mail.com',  '9200000004', 4.1),
('SecureOps',      'v5@mail.com',  '9200000005', 4.0),
('Foodies',        'v6@mail.com',  '9200000006', 4.6),
('Eventify',       'v7@mail.com',  '9200000007', 4.3),
('StageCraft',     'v8@mail.com',  '9200000008', 4.7),
('CleanCo',        'v9@mail.com',  '9200000009', 4.0),
('DecorHub',       'v10@mail.com', '9200000010', 4.4);

-- BOOKING SERVICE
INSERT INTO `BookingService` (booking_id, vendor_id, service_name, unit_price, quantity) VALUES
(1, 1, 'Catering',   8000, 1),
(1, 2, 'Decoration', 2000, 1),
(2, 1, 'Catering',  15000, 1),
(3, 3, 'Sound',      3000, 1),
(4, 4, 'Lighting',   2000, 1),
(5, 5, 'Security',   4000, 1),
(6, 6, 'Food',       5000, 1),
(7, 7, 'Management', 3500, 1),
(8, 8, 'Stage',      6000, 1),
(9, 9, 'Cleaning',   2000, 1);

-- ROOM RESERVATION
INSERT INTO `RoomReservation` (booking_id, room_id, reserved_from, reserved_to, reserved_rate) VALUES
(1,  1, '2026-05-01 18:00', '2026-05-01 22:00', 2500),
(2,  3, '2026-05-02 10:00', '2026-05-02 20:00', 3000),
(3,  3, '2026-05-03 09:00', '2026-05-03 12:00', 1800),
(4,  5, '2026-05-04 17:00', '2026-05-04 21:00', 1200),
(5,  6, '2026-05-05 18:00', '2026-05-05 23:00', 2200),
(6,  7, '2026-05-06 10:00', '2026-05-06 13:00', 2000),
(7,  8, '2026-05-07 09:00', '2026-05-07 12:00', 1700),
(8,  9, '2026-05-08 12:00', '2026-05-08 22:00', 2800),
(9,  10,'2026-05-09 16:00', '2026-05-09 19:00', 1000),
(10, 2, '2026-05-10 14:00', '2026-05-10 18:00', 1500);
