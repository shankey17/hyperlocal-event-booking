DROP DATABASE IF EXISTS hyperlocal_event_booking;
CREATE DATABASE hyperlocal_event_booking;
USE hyperlocal_event_booking;

CREATE TABLE Owner (
  owner_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(15) NOT NULL UNIQUE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE Venue (
  venue_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  street VARCHAR(150) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  max_capacity INT NOT NULL,
  base_rate_per_hour DECIMAL(10,2) NOT NULL,
  amenities VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_venue_owner FOREIGN KEY (owner_id) REFERENCES Owner(owner_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_venue_capacity CHECK (max_capacity > 0),
  CONSTRAINT chk_venue_rate CHECK (base_rate_per_hour >= 0)
) ENGINE=InnoDB;

CREATE TABLE Room (
  room_id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  room_no VARCHAR(20) NOT NULL,
  room_name VARCHAR(100) NOT NULL,
  capacity INT NOT NULL,
  hourly_rate DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_room_venue FOREIGN KEY (venue_id) REFERENCES Venue(venue_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT uq_room_no_per_venue UNIQUE (venue_id, room_no),
  CONSTRAINT chk_room_capacity CHECK (capacity > 0),
  CONSTRAINT chk_room_rate CHECK (hourly_rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE Customer (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(15) NOT NULL UNIQUE,
  dob DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE `Event` (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  event_type ENUM('birthday', 'wedding', 'corporate', 'social', 'other') NOT NULL,
  expected_guests INT NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  CONSTRAINT chk_event_guests CHECK (expected_guests > 0),
  CONSTRAINT chk_event_time CHECK (end_datetime > start_datetime)
) ENGINE=InnoDB;

CREATE TABLE Booking (
  booking_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  venue_id INT NOT NULL,
  event_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_date DATE NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT fk_booking_customer FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_booking_venue FOREIGN KEY (venue_id) REFERENCES Venue(venue_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_booking_event FOREIGN KEY (event_id) REFERENCES `Event`(event_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_booking_total_amount CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE Payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  method ENUM('cash', 'upi', 'card', 'bank_transfer') NOT NULL,
  payment_status ENUM('pending', 'partially_paid', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES Booking(booking_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE ServiceVendor (
  vendor_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  contact_email VARCHAR(100) NOT NULL UNIQUE,
  contact_phone VARCHAR(15) NOT NULL UNIQUE,
  avg_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_vendor_rating CHECK (avg_rating >= 0 AND avg_rating <= 5)
) ENGINE=InnoDB;

CREATE TABLE BookingService (
  booking_service_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  vendor_id INT NOT NULL,
  service_name VARCHAR(100) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT fk_bs_booking FOREIGN KEY (booking_id) REFERENCES Booking(booking_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_bs_vendor FOREIGN KEY (vendor_id) REFERENCES ServiceVendor(vendor_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_bs_unit_price CHECK (unit_price >= 0),
  CONSTRAINT chk_bs_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE RoomReservation (
  room_reservation_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  room_id INT NOT NULL,
  reserved_from DATETIME NOT NULL,
  reserved_to DATETIME NOT NULL,
  reserved_rate DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_rr_booking FOREIGN KEY (booking_id) REFERENCES Booking(booking_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_rr_room FOREIGN KEY (room_id) REFERENCES Room(room_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_rr_time CHECK (reserved_to > reserved_from),
  CONSTRAINT chk_rr_rate CHECK (reserved_rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE SurveyLead (
  lead_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(15) NOT NULL UNIQUE,
  preferred_city VARCHAR(80) NOT NULL,
  event_type ENUM('birthday', 'wedding', 'corporate', 'social', 'other') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_venue_city ON Venue(city);
CREATE INDEX idx_venue_capacity ON Venue(max_capacity);
CREATE INDEX idx_room_venue ON Room(venue_id);
CREATE INDEX idx_rr_room_time ON RoomReservation(room_id, reserved_from, reserved_to);
CREATE INDEX idx_booking_venue ON Booking(venue_id);
CREATE INDEX idx_booking_customer ON Booking(customer_id);

DELIMITER $$

CREATE TRIGGER trg_rr_no_overlap_insert
BEFORE INSERT ON RoomReservation
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM RoomReservation rr
    WHERE rr.room_id = NEW.room_id
      AND NEW.reserved_from < rr.reserved_to
      AND NEW.reserved_to > rr.reserved_from
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Overlapping room reservation is not allowed';
  END IF;
END$$

CREATE TRIGGER trg_rr_no_overlap_update
BEFORE UPDATE ON RoomReservation
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM RoomReservation rr
    WHERE rr.room_id = NEW.room_id
      AND rr.room_reservation_id <> OLD.room_reservation_id
      AND NEW.reserved_from < rr.reserved_to
      AND NEW.reserved_to > rr.reserved_from
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Overlapping room reservation is not allowed';
  END IF;
END$$

DELIMITER ;

INSERT INTO Owner (first_name, last_name, email, phone, is_verified)
VALUES
('Amit', 'Sharma', 'amit.owner@example.com', '9000000001', TRUE),
('Neha', 'Verma', 'neha.owner@example.com', '9000000002', TRUE);

INSERT INTO Venue (owner_id, name, street, city, state, pincode, max_capacity, base_rate_per_hour, amenities)
VALUES
(1, 'Grand Orchid Hall', '12 Park Street', 'Kolkata', 'West Bengal', '700016', 500, 5000.00, 'Parking, AC, Wi-Fi, Stage, Sound System'),
(1, 'City Conference Center', '55 Salt Lake Road', 'Kolkata', 'West Bengal', '700091', 200, 3000.00, 'Projector, AC, Wi-Fi, Whiteboard'),
(2, 'River View Banquet', '21 MG Road', 'Howrah', 'West Bengal', '711101', 300, 4000.00, 'Parking, AC, Lift, Catering Area');

INSERT INTO Room (venue_id, room_no, room_name, capacity, hourly_rate)
VALUES
(1, '101', 'Banquet Hall', 300, 2500.00),
(1, '102', 'VIP Lounge', 80, 1200.00),
(2, '201', 'Conference Room A', 120, 1500.00),
(3, '301', 'Main Hall', 200, 1800.00),
(3, '302', 'Side Hall', 100, 1100.00);

INSERT INTO Customer (first_name, last_name, email, phone, dob)
VALUES
('Rahul', 'Das', 'rahul.customer@example.com', '9000000101', '1998-04-15'),
('Priya', 'Nair', 'priya.customer@example.com', '9000000102', '2000-09-20');

INSERT INTO `Event` (title, event_type, expected_guests, start_datetime, end_datetime)
VALUES
('Rahul Birthday Party', 'birthday', 120, '2026-05-10 18:00:00', '2026-05-10 22:00:00'),
('Priya Corporate Meet', 'corporate', 80, '2026-05-12 10:00:00', '2026-05-12 13:00:00');

INSERT INTO Booking (customer_id, venue_id, event_id, event_date, status, total_amount)
VALUES
(1, 1, 1, '2026-05-10', 'confirmed', 15000.00),
(2, 2, 2, '2026-05-12', 'pending', 8000.00);

INSERT INTO Payment (booking_id, amount, payment_at, method, payment_status)
VALUES
(1, 5000.00, '2026-04-15 11:00:00', 'upi', 'partially_paid'),
(1, 3000.00, '2026-04-20 16:30:00', 'card', 'partially_paid'),
(2, 8000.00, '2026-04-18 12:15:00', 'bank_transfer', 'paid');

INSERT INTO ServiceVendor (name, contact_email, contact_phone, avg_rating)
VALUES
('Spice Catering', 'spice.catering@example.com', '9000000201', 4.70),
('Bloom Decorations', 'bloom.decor@example.com', '9000000202', 4.50);

INSERT INTO BookingService (booking_id, vendor_id, service_name, unit_price, quantity)
VALUES
(1, 1, 'Catering for 120 guests', 8000.00, 1),
(1, 2, 'Decoration Package', 2000.00, 1),
(2, 1, 'Catering for 80 guests', 5000.00, 1);

INSERT INTO RoomReservation (booking_id, room_id, reserved_from, reserved_to, reserved_rate)
VALUES
(1, 1, '2026-05-10 18:00:00', '2026-05-10 22:00:00', 2500.00),
(1, 2, '2026-05-10 18:00:00', '2026-05-10 22:00:00', 1200.00),
(2, 3, '2026-05-12 10:00:00', '2026-05-12 13:00:00', 1500.00);

INSERT INTO SurveyLead (full_name, email, phone, preferred_city, event_type)
VALUES
('Demo Lead', 'demo.lead@example.com', '9000000999', 'Kolkata', 'corporate');
