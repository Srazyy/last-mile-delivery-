const test = require('node:test');
const assert = require('node:assert/strict');
const { volumetricWeight, billableWeight } = require('../src/services/pricing');

test('calculates volumetric weight using L*B*H/5000', () => {
  assert.equal(volumetricWeight(50, 40, 30), 12);
});

test('billable weight is max(actual, volumetric)', () => {
  assert.equal(billableWeight(10, 12), 12);
  assert.equal(billableWeight(13, 12), 13);
});
