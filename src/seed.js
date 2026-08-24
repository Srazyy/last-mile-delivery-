const bcrypt = require('bcryptjs');
const { get, run } = require('./db');

async function seed() {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@lastmile.local';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';

  const admin = await get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (!admin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await run('INSERT INTO users(name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      'Admin',
      adminEmail,
      hash,
      'admin',
    ]);
    console.log(`Seeded admin: ${adminEmail}`);
  }

  const defaultZones = ['North', 'South'];
  for (const zone of defaultZones) {
    const existing = await get('SELECT id FROM zones WHERE name = ?', [zone]);
    if (!existing) {
      await run('INSERT INTO zones(name, description) VALUES (?, ?)', [zone, `${zone} default zone`]);
    }
  }

  const north = await get('SELECT id FROM zones WHERE name = ?', ['North']);
  const south = await get('SELECT id FROM zones WHERE name = ?', ['South']);

  const mappings = [
    ['11', north.id],
    ['22', south.id],
  ];

  for (const [prefix, zoneId] of mappings) {
    const existing = await get('SELECT id FROM zone_mappings WHERE pincode_prefix = ?', [prefix]);
    if (!existing) await run('INSERT INTO zone_mappings(pincode_prefix, zone_id) VALUES (?, ?)', [prefix, zoneId]);
  }

  const rateDefaults = [
    ['B2B', 'INTRA', 35, 9, 35],
    ['B2B', 'INTER', 45, 12, 45],
    ['B2C', 'INTRA', 30, 8, 30],
    ['B2C', 'INTER', 40, 11, 40],
  ];

  for (const [orderType, relation, base, perKg, min] of rateDefaults) {
    const existing = await get(
      'SELECT id FROM rate_cards WHERE order_type = ? AND zone_relation = ? AND is_active = 1',
      [orderType, relation]
    );
    if (!existing) {
      await run(
        'INSERT INTO rate_cards(order_type, zone_relation, base_rate, per_kg_rate, min_charge) VALUES (?, ?, ?, ?, ?)',
        [orderType, relation, base, perKg, min]
      );
    }
  }

  const codDefaults = [
    ['B2B', 'flat', 20],
    ['B2C', 'percent', 5],
  ];

  for (const [orderType, type, value] of codDefaults) {
    const existing = await get('SELECT id FROM cod_surcharges WHERE order_type = ? AND is_active = 1', [orderType]);
    if (!existing) {
      await run(
        'INSERT INTO cod_surcharges(order_type, surcharge_type, surcharge_value) VALUES (?, ?, ?)',
        [orderType, type, value]
      );
    }
  }

  console.log('Seeding complete');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
