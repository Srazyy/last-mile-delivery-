const { get, run } = require('../db');
const { sendEmail } = require('./notifications');

const statusFlow = ['Pending', 'Assigned', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'];

function canTransition(current, next, actorRole) {
  if (next === 'Failed') return ['agent', 'admin'].includes(actorRole);
  if (actorRole === 'admin') return true;
  const currentIdx = statusFlow.indexOf(current);
  const nextIdx = statusFlow.indexOf(next);
  return currentIdx !== -1 && nextIdx === currentIdx + 1;
}

async function appendTrackingHistory(orderId, status, actorUserId, actorRole, note) {
  await run(
    `INSERT INTO tracking_history(order_id, status, actor_user_id, actor_role, note)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, status, actorUserId, actorRole, note || null]
  );
}

async function updateOrderStatus(orderId, nextStatus, actor, note) {
  const order = await get(
    `SELECT o.*, u.email as customer_email, u.name as customer_name
     FROM orders o JOIN users u ON u.id = o.customer_id
     WHERE o.id = ?`,
    [orderId]
  );

  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  if (!canTransition(order.status, nextStatus, actor.role)) {
    const err = new Error(`Invalid status transition from ${order.status} to ${nextStatus}`);
    err.status = 400;
    throw err;
  }

  await run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextStatus, orderId]);
  await appendTrackingHistory(orderId, nextStatus, actor.id, actor.role, note);

  if (nextStatus === 'Delivered' && order.assigned_agent_id) {
    await run('UPDATE agents SET available = 1 WHERE id = ?', [order.assigned_agent_id]);
  }

  await sendEmail(
    order.customer_email,
    `Order #${orderId} status updated to ${nextStatus}`,
    `Hi ${order.customer_name},\n\nYour order #${orderId} is now: ${nextStatus}.\n${note ? `Note: ${note}\n` : ''}\nThanks.`
  );

  return { ...order, status: nextStatus };
}

module.exports = { updateOrderStatus, appendTrackingHistory };
