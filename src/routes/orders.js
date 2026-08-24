const express = require('express');
const Joi = require('joi');
const { all, get, run, transaction } = require('../db');
const { auth } = require('../middleware/auth');
const { calculateOrderPrice } = require('../services/pricing');
const { updateOrderStatus, appendTrackingHistory } = require('../services/tracking');
const { pickNearestAvailableAgent, assignAgentToOrder } = require('../services/assignment');
const { sendEmail } = require('../services/notifications');

const router = express.Router();

const orderInputSchema = Joi.object({
  pickupAddress: Joi.string().required(),
  pickupPincode: Joi.string().required(),
  dropAddress: Joi.string().required(),
  dropPincode: Joi.string().required(),
  packageLengthCm: Joi.number().positive().required(),
  packageWidthCm: Joi.number().positive().required(),
  packageHeightCm: Joi.number().positive().required(),
  actualWeightKg: Joi.number().positive().required(),
  orderType: Joi.string().valid('B2B', 'B2C').required(),
  paymentType: Joi.string().valid('Prepaid', 'COD').required(),
  scheduledDeliveryDate: Joi.string().optional().allow(null, ''),
});

router.post('/price-preview', auth(['customer']), async (req, res, next) => {
  try {
    const payload = await orderInputSchema.validateAsync(req.body);
    const pricing = await calculateOrderPrice({
      pickupPincode: payload.pickupPincode,
      dropPincode: payload.dropPincode,
      length: payload.packageLengthCm,
      width: payload.packageWidthCm,
      height: payload.packageHeightCm,
      actualWeight: payload.actualWeightKg,
      orderType: payload.orderType,
      paymentType: payload.paymentType,
    });
    res.json(pricing);
  } catch (error) {
    next(error);
  }
});

router.post('/', auth(['customer']), async (req, res, next) => {
  try {
    const payload = await orderInputSchema.validateAsync(req.body);
    const pricing = await calculateOrderPrice({
      pickupPincode: payload.pickupPincode,
      dropPincode: payload.dropPincode,
      length: payload.packageLengthCm,
      width: payload.packageWidthCm,
      height: payload.packageHeightCm,
      actualWeight: payload.actualWeightKg,
      orderType: payload.orderType,
      paymentType: payload.paymentType,
    });

    const order = await transaction(async () => {
      const created = await run(
        `INSERT INTO orders(
          customer_id, pickup_address, pickup_pincode, pickup_zone_id,
          drop_address, drop_pincode, drop_zone_id,
          package_length_cm, package_width_cm, package_height_cm,
          actual_weight_kg, volumetric_weight_kg, billable_weight_kg,
          order_type, payment_type, rate_card_id, cod_surcharge_amount,
          total_price, scheduled_delivery_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          payload.pickupAddress,
          payload.pickupPincode,
          pricing.pickupZone.id,
          payload.dropAddress,
          payload.dropPincode,
          pricing.dropZone.id,
          payload.packageLengthCm,
          payload.packageWidthCm,
          payload.packageHeightCm,
          payload.actualWeightKg,
          pricing.volumetricWeightKg,
          pricing.billableWeightKg,
          payload.orderType,
          payload.paymentType,
          pricing.rateCard.id,
          pricing.codSurchargeAmount,
          pricing.totalPrice,
          payload.scheduledDeliveryDate || null,
        ]
      );

      await appendTrackingHistory(created.id, 'Pending', req.user.id, req.user.role, 'Order created');
      return get('SELECT * FROM orders WHERE id = ?', [created.id]);
    });

    return res.status(201).json({ order, pricing });
  } catch (error) {
    return next(error);
  }
});

router.get('/mine', auth(['customer']), async (req, res, next) => {
  try {
    const orders = await all('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/tracking', auth(['customer', 'admin', 'agent']), async (req, res, next) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (req.user.role === 'customer' && order.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const timeline = await all(
      `SELECT th.*, u.name as actor_name
       FROM tracking_history th
       JOIN users u ON u.id = th.actor_user_id
       WHERE th.order_id = ?
       ORDER BY th.id ASC`,
      [req.params.id]
    );

    res.json({ order, timeline });
  } catch (error) {
    next(error);
  }
});

const statusSchema = Joi.object({
  status: Joi.string().valid('Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Failed').required(),
  note: Joi.string().allow('', null),
});

router.post('/:id/status', auth(['agent', 'admin']), async (req, res, next) => {
  try {
    const payload = await statusSchema.validateAsync(req.body);
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (req.user.role === 'agent') {
      const agentRecord = await get('SELECT * FROM agents WHERE user_id = ?', [req.user.id]);
      if (!agentRecord || order.assigned_agent_id !== agentRecord.id) {
        return res.status(403).json({ error: 'Not assigned to this order' });
      }
    }

    const updated = await updateOrderStatus(Number(req.params.id), payload.status, req.user, payload.note || null);

    if (payload.status === 'Failed') {
      await sendEmail(
        req.user.email,
        `Delivery failed for Order #${req.params.id}`,
        'Please ask customer to reschedule delivery date from tracking page.'
      );
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

const rescheduleSchema = Joi.object({
  newDeliveryDate: Joi.string().required(),
  reason: Joi.string().allow('', null),
});

router.post('/:id/reschedule', auth(['customer']), async (req, res, next) => {
  try {
    const payload = await rescheduleSchema.validateAsync(req.body);
    const order = await get('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [req.params.id, req.user.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'Failed') return res.status(400).json({ error: 'Only failed orders can be rescheduled' });

    const agent = await pickNearestAvailableAgent(order.pickup_zone_id, null, null);

    await transaction(async () => {
      await run(
        `INSERT INTO failed_delivery_reschedules(order_id, previous_attempt, reason, new_delivery_date, requested_by_customer_id, reassigned_agent_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [order.id, order.attempt_number, payload.reason || null, payload.newDeliveryDate, req.user.id, agent ? agent.id : null]
      );

      await run(
        `UPDATE orders
         SET status = ?, scheduled_delivery_date = ?, attempt_number = attempt_number + 1, assigned_agent_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [agent ? 'Assigned' : 'Pending', payload.newDeliveryDate, agent ? agent.id : null, order.id]
      );

      if (agent) {
        await run('UPDATE agents SET available = 0 WHERE id = ?', [agent.id]);
      }

      await appendTrackingHistory(order.id, agent ? 'Assigned' : 'Pending', req.user.id, req.user.role, 'Rescheduled after failed delivery');
    });

    await sendEmail(req.user.email, `Order #${order.id} rescheduled`, `Your new delivery date is ${payload.newDeliveryDate}.`);
    res.json({ message: 'Rescheduled successfully', reassignedAgentId: agent ? agent.id : null });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/auto-assign', auth(['admin']), async (req, res, next) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const agent = await pickNearestAvailableAgent(order.pickup_zone_id, null, null);
    if (!agent) return res.status(404).json({ error: 'No available agent found' });

    await assignAgentToOrder(order.id, agent.id);
    await appendTrackingHistory(order.id, 'Assigned', req.user.id, req.user.role, 'Auto-assigned nearest available agent');

    res.json({ message: 'Agent assigned', agent });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
