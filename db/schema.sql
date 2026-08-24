PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('customer','agent','admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zone_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pincode_prefix TEXT NOT NULL UNIQUE,
  zone_id INTEGER NOT NULL,
  FOREIGN KEY(zone_id) REFERENCES zones(id)
);

CREATE TABLE IF NOT EXISTS cod_surcharges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_type TEXT NOT NULL CHECK(order_type IN ('B2B','B2C')),
  surcharge_type TEXT NOT NULL CHECK(surcharge_type IN ('flat','percent')),
  surcharge_value REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(order_type, is_active)
);

CREATE TABLE IF NOT EXISTS rate_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_type TEXT NOT NULL CHECK(order_type IN ('B2B','B2C')),
  zone_relation TEXT NOT NULL CHECK(zone_relation IN ('INTRA','INTER')),
  base_rate REAL NOT NULL,
  per_kg_rate REAL NOT NULL,
  min_charge REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(order_type, zone_relation, is_active)
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  home_zone_id INTEGER,
  current_zone_id INTEGER,
  latitude REAL,
  longitude REAL,
  available INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(home_zone_id) REFERENCES zones(id),
  FOREIGN KEY(current_zone_id) REFERENCES zones(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_pincode TEXT NOT NULL,
  pickup_zone_id INTEGER,
  drop_address TEXT NOT NULL,
  drop_pincode TEXT NOT NULL,
  drop_zone_id INTEGER,
  package_length_cm REAL NOT NULL,
  package_width_cm REAL NOT NULL,
  package_height_cm REAL NOT NULL,
  actual_weight_kg REAL NOT NULL,
  volumetric_weight_kg REAL NOT NULL,
  billable_weight_kg REAL NOT NULL,
  order_type TEXT NOT NULL CHECK(order_type IN ('B2B','B2C')),
  payment_type TEXT NOT NULL CHECK(payment_type IN ('Prepaid','COD')),
  rate_card_id INTEGER,
  cod_surcharge_amount REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL,
  assigned_agent_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('Pending','Assigned','Picked Up','In Transit','Out for Delivery','Delivered','Failed')) DEFAULT 'Pending',
  scheduled_delivery_date TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES users(id),
  FOREIGN KEY(pickup_zone_id) REFERENCES zones(id),
  FOREIGN KEY(drop_zone_id) REFERENCES zones(id),
  FOREIGN KEY(rate_card_id) REFERENCES rate_cards(id),
  FOREIGN KEY(assigned_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS failed_delivery_reschedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  previous_attempt INTEGER NOT NULL,
  reason TEXT,
  new_delivery_date TEXT NOT NULL,
  requested_by_customer_id INTEGER NOT NULL,
  reassigned_agent_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(requested_by_customer_id) REFERENCES users(id),
  FOREIGN KEY(reassigned_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS tracking_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_zone ON orders(pickup_zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_drop_zone ON orders(drop_zone_id);
CREATE INDEX IF NOT EXISTS idx_tracking_order ON tracking_history(order_id);
