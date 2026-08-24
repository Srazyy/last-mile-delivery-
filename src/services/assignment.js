const { all, get, run } = require('../db');

function distanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => typeof v !== 'number')) return Number.MAX_SAFE_INTEGER;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function pickNearestAvailableAgent(zoneId, referenceLat, referenceLon) {
  const candidates = await all(
    `SELECT a.*, u.name as agent_name
     FROM agents a
     JOIN users u ON u.id = a.user_id
     WHERE a.available = 1
       AND (a.current_zone_id = ? OR a.home_zone_id = ? OR ? IS NULL)
     ORDER BY CASE WHEN a.current_zone_id = ? THEN 0 ELSE 1 END, a.id ASC`,
    [zoneId, zoneId, zoneId, zoneId]
  );

  if (!candidates.length) return null;

  let best = candidates[0];
  let bestDistance = distanceKm(referenceLat, referenceLon, best.latitude, best.longitude);

  for (const candidate of candidates.slice(1)) {
    const d = distanceKm(referenceLat, referenceLon, candidate.latitude, candidate.longitude);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }

  return best;
}

async function assignAgentToOrder(orderId, agentId) {
  const agent = await get('SELECT * FROM agents WHERE id = ? AND available = 1', [agentId]);
  if (!agent) {
    const err = new Error('Agent not available');
    err.status = 400;
    throw err;
  }

  await run('UPDATE orders SET assigned_agent_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [agentId, 'Assigned', orderId]);
  await run('UPDATE agents SET available = 0 WHERE id = ?', [agentId]);

  return agent;
}

module.exports = { pickNearestAvailableAgent, assignAgentToOrder };
