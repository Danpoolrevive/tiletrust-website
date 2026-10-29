// Run: node scripts/calc.test.js  (no dependencies)
'use strict';
const assert = require('assert');
const C = require('../calc.js');

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('ok  ' + name); }
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ', got ' + a);
const spec = (o) => Object.assign({ a: 600, b: 600, joint: 3, thick: 10, waste: 10, perBox: '', boxUnit: 'm2', adh: 'auto' }, o);

t('5 x 4 floor, 600x600, 3 mm joint, 10% waste', () => {
  const r = C.calculate({ rows: [{ name: 'Floor', type: 'floor', a: '5', b: '4', ded: '' }], floor: spec({ perBox: '1.44' }), wall: null, grout: 'cement' });
  assert.deepStrictEqual(r.errors, []);
  near(r.floor.net, 20, 'net');
  near(r.floor.waste, 22, 'with waste');
  // tile face inc. joint = 603 x 603 mm = 0.363609 m²; 22 / 0.363609 = 60.5 -> 61
  assert.strictEqual(r.floor.tiles, 61);
  // 22 m² / 1.44 m² per box = 15.28 -> 16
  assert.strictEqual(r.floor.boxes, 16);
  // adhesive: 600 longest side -> 4.5 kg/m² x 20 = 90 kg -> 5 x 20 kg bags
  near(r.floor.adhKg, 90, 'adhesive kg');
  assert.strictEqual(r.floor.adhBags, 5);
  // grout: (1200 / 360000) x 3 x 10 x 1.6 = 0.16 kg/m²; x 20 x 1.1 = 3.52 kg -> 1 x 5 kg
  near(r.floor.groutRate, 0.16, 'grout rate');
  near(r.floor.groutKg, 3.52, 'grout kg');
  assert.strictEqual(r.floor.groutBags, 1);
  near(r.total.net, 20, 'total');
  near(r.wall.net, 0, 'no walls');
});

t('wall with deductions, 300x600, 2 mm joint, brick 12%, epoxy', () => {
  const r = C.calculate({ rows: [{ name: 'Shower wall', type: 'wall', a: '3', b: '2.4', ded: '1.8' }],
    floor: spec({ a: 300, b: 600, joint: 2, waste: 12, perBox: '8', boxUnit: 'tiles' }), wall: null, grout: 'epoxy' });
  assert.deepStrictEqual(r.errors, []);
  near(r.wall.net, 5.4, 'net'); // 7.2 - 1.8
  near(r.wall.waste, 6.048, 'with waste');
  // face 302 x 602 = 0.181804 m²; 6.048 / 0.181804 = 33.27 -> 34 tiles; 34 / 8 = 4.25 -> 5 boxes
  assert.strictEqual(r.wall.tiles, 34);
  assert.strictEqual(r.wall.boxes, 5);
  near(r.wall.adhKg, 24.3, 'adhesive'); // 4.5 x 5.4
  assert.strictEqual(r.wall.adhBags, 2);
  // (900 / 180000) x 2 x 10 x 1.5 = 0.15 kg/m²; x 5.4 x 1.12 = 0.9072 kg
  near(r.wall.groutKg, 0.9072, 'grout');
  assert.strictEqual(r.wall.groutBags, 1);
});

t('adhesive tiers and override', () => {
  assert.strictEqual(C.adhesiveRate(300, 300, 'auto'), 3);
  assert.strictEqual(C.adhesiveRate(300, 600, 'auto'), 4.5);
  assert.strictEqual(C.adhesiveRate(1200, 600, 'auto'), 6);
  assert.strictEqual(C.adhesiveRate(300, 300, '6'), 6);
});

t('different floor and wall tiles combine adhesive and grout only', () => {
  const r = C.calculate({ rows: [{ type: 'floor', a: '5', b: '4' }, { type: 'wall', a: '3', b: '2.4', ded: '1.8' }],
    floor: spec(), wall: spec({ a: 300, b: 600, joint: 2, waste: 12 }), grout: 'cement' });
  assert.deepStrictEqual(r.errors, []);
  near(r.total.net, 25.4, 'net');
  assert.strictEqual(r.total.tiles, null);
  near(r.total.adhKg, 114.3, 'adhesive'); // 90 + 24.3
  assert.strictEqual(r.total.adhBags, 6);
});

t('invalid input gives plain-English errors and no numbers', () => {
  const r = C.calculate({ rows: [
    { name: 'Hall', type: 'floor', a: '-2', b: '3' },
    { name: 'Splashback', type: 'wall', a: '2', b: 'abc' },
    { name: 'WC', type: 'wall', a: '1', b: '1', ded: '2' },
    { name: 'Blank', type: 'floor', a: '', b: '', ded: '' }
  ], floor: spec({ a: NaN, joint: 50 }), wall: null, grout: 'cement' });
  assert.ok(r.errors.some((e) => /Hall: enter the length/.test(e)));
  assert.ok(r.errors.some((e) => /Splashback: enter the height/.test(e)));
  assert.ok(r.errors.some((e) => /WC: deductions/.test(e)));
  assert.ok(r.errors.some((e) => /tile size/.test(e)));
  assert.ok(r.errors.some((e) => /grout joint/.test(e)));
  assert.ok(!r.errors.some((e) => /Blank/.test(e)), 'untouched rows are ignored');
  assert.strictEqual(r.floor, undefined);
  assert.ok(!JSON.stringify(r).includes('NaN'));
});

t('comma decimals and float rounding', () => {
  assert.strictEqual(C.num('2,5'), 2.5);
  assert.strictEqual(C.up(22.000000000001), 22);
  const r = C.calculate({ rows: [{ type: 'floor', a: '2,5', b: '2' }], floor: spec({ a: 1000 - 3, b: 1000 - 3, waste: 0 }), wall: null, grout: 'cement' });
  assert.strictEqual(r.floor.tiles, 5); // 5 m² / exactly 1 m² face
});

console.log('\n' + pass + ' tests passed');
