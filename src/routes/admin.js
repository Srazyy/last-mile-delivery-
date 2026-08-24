const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { auth } = require('../middleware/auth');
const { assignAgentToOrder } = require('../services/assignment');
const { appendTrackingHistory, updateOrderStatus } = require('../services/tracking');

const router = express.Router();
router.use(auth(['admin']));

router.get('/dashboard/orders', async (req, res, next) => {
  try {
    const { status, zoneId, agentId } = req.query;
    const filters = [];
    const params = [];

    if (status) {
      filters.push('o.status = ?');
      params.push(status);
    }
    if (zoneId) {
      filters.push('(o.pickup_zone_id = ? OR o.drop_zone_id = ?)');
      params.push(zoneId, zoneId);
    }
    if (agentId) {
      filters.push('o.assigned_agent_id = ?');
      params.push(agentId);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const orders = await all(
      `SELECT o.*, c.name as customer_name, c.email as customer_email, u.name as agent_name
       FROM orders o
       JOIN users c ON c.id = o.customer_id
       LEFT JOIN agents a ON a.id = o.assigned_agent_id
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.post('/zones', async (req, res, next) => {
  try {
    const payload = await Joi.object({ name: Joi.string().required(), description: Joi.string().allow('', null) }).validateAsync(req.body);
    const result = await run('INSERT INTO zones(name, description) VALUES (?, ?)', [payload.name, payload.description || null]);
    res.status(201).json(await get('SELECT * FROM zones WHERE id = ?', [result.id]));
  } catch (error) {
    next(error);
  }
});

router.get('/zones', async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM zones ORDER BY id ASC'));
  } catch (error) {
    next(error);
  }
});

router.post('/zone-mappings', async (req, res, next) => {
  try {
    const payload = await Joi.object({ pincodePrefix: Joi.string().required(), zoneId: Joi.number().required() }).validateAsync(req.body);
    const result = await run('INSERT INTO zone_mappings(pincode_prefix, zone_id) VALUES (?, ?)', [payload.pincodePrefix, payload.zoneId]);
    res.status(201).json(await get('SELECT * FROM zone_mappings WHERE id = ?', [result.id]));
  } catch (error) {
    next(error);
  }
});

router.get('/zone-mappings', async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM zone_mappings ORDER BY id ASC'));
  } catch (error) {
    next(error);
  }
});

router.post('/rate-cards', async (req, res, next) => {
  try {
    const payload = await Joi.object({
      orderType: Joi.string().valid('B2B', 'B2C').required(),
      zoneRelation: Joi.string().valid('INTRA', 'INTER').required(),
      baseRate: Joi.number().min(0).required(),
      perKgRate: Joi.number().min(0).required(),
      minCharge: Joi.number().min(0).required(),
    }).validateAsync(req.body);
    const result = await run(
      `INSERT INTO rate_cards(order_type, zone_relation, base_rate, per_kg_rate, min_charge)
       VALUES (?, ?, ?, ?, ?)`,
      [payload.orderType, payload.zoneRelation, payload.baseRate, payload.perKgRate, payload.minCharge]
    );
    res.status(201).json(await get('SELECT * FROM rate_cards WHERE id = ?', [result.id]));
  } catch (error) {
    next(error);
  }
});

router.get('/rate-cards', async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM rate_cards ORDER BY id ASC'));
  } catch (error) {
    next(error);
  }
});

router.post('/cod-surcharges', async (req, res, next) => {
  try {
    const payload = await Joi.object({
      orderType: Joi.string().valid('B2B', 'B2C').required(),
      surchargeType: Joi.string().valid('flat', 'percent').required(),
      surchargeValue: Joi.number().min(0).required(),
    }).validateAsync(req.body);
    const result = await run(
      `INSERT INTO cod_surcharges(order_type, surcharge_type, surcharge_value)
       VALUES (?, ?, ?)`,
      [payload.orderType, payload.surchargeType, payload.surchargeValue]
    );
    res.status(201).json(await get('SELECT * FROM cod_surcharges WHERE id = ?', [result.id]));
  } catch (error) {
    next(error);
  }
});

router.get('/cod-surcharges', async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM cod_surcharges ORDER BY id ASC'));
  } catch (error) {
    next(error);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const payload = await Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email({ tlds: { allow: false } }).required(),
      password: Joi.string().min(6).required(),
      role: Joi.string().valid('admin', 'agent', 'customer').required(),
    }).validateAsync(req.body);

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const result = await run(
      'INSERT INTO users(name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [payload.name, payload.email.toLowerCase(), passwordHash, payload.role]
    );

    if (payload.role === 'agent') {
      await run('INSERT INTO agents(user_id) VALUES (?)', [result.id]);
    }

    res.status(201).json(await get('SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?', [result.id]));
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    res.json(await all('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id ASC'));
  } catch (error) {
    next(error);
  }
});

router.get('/agents', async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT a.*, u.name, u.email
       FROM agents a JOIN users u ON u.id = a.user_id
       ORDER BY a.id ASC`
    ));
  } catch (error) {
    next(error);
  }
});

router.patch('/agents/:id', async (req, res, next) => {
  try {
    const payload = await Joi.object({
      homeZoneId: Joi.number().allow(null),
      currentZoneId: Joi.number().allow(null),
      latitude: Joi.number().allow(null),
      longitude: Joi.number().allow(null),
      available: Joi.boolean().allow(null),
    }).validateAsync(req.body);

    await run(
      `UPDATE agents
       SET home_zone_id = COALESCE(?, home_zone_id),
           current_zone_id = COALESCE(?, current_zone_id),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           available = COALESCE(?, available)
       WHERE id = ?`,
      [
        payload.homeZoneId === undefined ? null : payload.homeZoneId,
        payload.currentZoneId === undefined ? null : payload.currentZoneId,
        payload.latitude === undefined ? null : payload.latitude,
        payload.longitude === undefined ? null : payload.longitude,
        payload.available === undefined ? null : Number(payload.available),
        req.params.id,
      ]
    );

    res.json(await get('SELECT * FROM agents WHERE id = ?', [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/assign', async (req, res, next) => {
  try {
    const payload = await Joi.object({ agentId: Joi.number().required() }).validateAsync(req.body);
    await assignAgentToOrder(Number(req.params.id), payload.agentId);
    await appendTrackingHistory(Number(req.params.id), 'Assigned', req.user.id, req.user.role, 'Manually assigned by admin');
    res.json({ message: 'Assigned successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/override-status', async (req, res, next) => {
  try {
    const payload = await Joi.object({
      status: Joi.string().valid('Pending', 'Assigned', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Failed').required(),
      note: Joi.string().allow('', null),
    }).validateAsync(req.body);

    const updated = await updateOrderStatus(Number(req.params.id), payload.status, req.user, payload.note || 'Overridden by admin');
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
