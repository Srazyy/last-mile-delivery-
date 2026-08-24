const { get } = require('../db');

function volumetricWeight(length, width, height) {
  return Number(((length * width * height) / 5000).toFixed(2));
}

function billableWeight(actualWeight, volumetric) {
  return Number(Math.max(actualWeight, volumetric).toFixed(2));
}

async function detectZone(pincode) {
  return get(
    `SELECT z.id, z.name
     FROM zone_mappings zm
     JOIN zones z ON z.id = zm.zone_id
     WHERE ? LIKE (zm.pincode_prefix || '%')
     ORDER BY LENGTH(zm.pincode_prefix) DESC
     LIMIT 1`,
    [String(pincode)]
  );
}

async function calculateOrderPrice({
  pickupPincode,
  dropPincode,
  length,
  width,
  height,
  actualWeight,
  orderType,
  paymentType,
}) {
  const pickupZone = await detectZone(pickupPincode);
  const dropZone = await detectZone(dropPincode);

  if (!pickupZone || !dropZone) {
    const err = new Error('Unable to detect pickup or drop zone');
    err.status = 400;
    throw err;
  }

  const zoneRelation = pickupZone.id === dropZone.id ? 'INTRA' : 'INTER';
  const rateCard = await get(
    `SELECT * FROM rate_cards
     WHERE order_type = ? AND zone_relation = ? AND is_active = 1
     LIMIT 1`,
    [orderType, zoneRelation]
  );

  if (!rateCard) {
    const err = new Error(`Rate card not configured for ${orderType} ${zoneRelation}`);
    err.status = 400;
    throw err;
  }

  const volumetric = volumetricWeight(length, width, height);
  const billable = billableWeight(actualWeight, volumetric);
  const transportCharge = Math.max(rateCard.min_charge, rateCard.base_rate + billable * rateCard.per_kg_rate);

  let codSurcharge = 0;
  if (paymentType === 'COD') {
    const cod = await get(
      'SELECT * FROM cod_surcharges WHERE order_type = ? AND is_active = 1 LIMIT 1',
      [orderType]
    );
    if (cod) {
      codSurcharge = cod.surcharge_type === 'percent'
        ? (transportCharge * cod.surcharge_value) / 100
        : cod.surcharge_value;
    }
  }

  const totalPrice = Number((transportCharge + codSurcharge).toFixed(2));

  return {
    pickupZone,
    dropZone,
    rateCard,
    zoneRelation,
    volumetricWeightKg: volumetric,
    billableWeightKg: billable,
    codSurchargeAmount: Number(codSurcharge.toFixed(2)),
    totalPrice,
  };
}

module.exports = {
  volumetricWeight,
  billableWeight,
  detectZone,
  calculateOrderPrice,
};
