const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const base = process.env.TEST_URL || 'http://localhost:8080';
const output = path.join(__dirname, 'outputs');
const config = dotenv.parse(fs.readFileSync(path.join(__dirname, '../../src/backend/.env')));
fs.mkdirSync(output, { recursive: true });
const evidence = [];
let createdId;

function save(name, data) {
  fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(data, null, 2) + '\n');
}
async function api(name, method, route, expectedStatus, body) {
  const response = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  save(name, data);
  evidence.push({ name, method, url: base + route, status: response.status, request: body });
  console.log(name, method, route, 'HTTP', response.status);
  assert.equal(response.status, expectedStatus, JSON.stringify(data));
  return data;
}

(async () => {
  const db = await mysql.createConnection({
    host: config.MYSQL_HOST, port: Number(config.MYSQL_PORT),
    user: config.MYSQL_USER, password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE, dateStrings: true
  });
  try {
    const [server] = await db.query('SELECT VERSION() AS version, DATABASE() AS databaseName, CURRENT_USER() AS authenticatedUser');
    save('database-server', server);
    const [schemaBefore] = await db.query('SHOW CREATE TABLE flights');
    const [before] = await db.query('SELECT * FROM flights ORDER BY id');
    save('flight-schema', schemaBefore);
    const flight = {
      flightNumber: 'EXP05-' + Date.now(),
      airline: 'SkyBook Practical',
      origin: 'Mumbai (BOM)', destination: 'Delhi (DEL)',
      departureDate: '2026-12-15',
      departureTime: '09:00 AM', arrivalTime: '11:15 AM',
      price: 4500, status: 'On Time', active: true
    };
    const created = await api('C-post-create', 'POST', '/api/flights', 201, flight);
    createdId = created.flight.id;
    assert.ok(Number.isInteger(createdId));
    async function sqlStage(name, price, active) {
      const [rows] = await db.execute(
        'SELECT id, flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, isActive FROM flights WHERE id = ?',
        [createdId]);
      save(name, rows);
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].price), price);
      assert.equal(rows[0].isActive, active);
      assert.equal(rows[0].flightNumber, flight.flightNumber);
      assert.equal(rows[0].departureDate, flight.departureDate);
      console.log(name, JSON.stringify(rows));
    }
    await sqlStage('sql-after-post', 4500, 1);
    const all = await api('A-get-all', 'GET', '/api/flights', 200);
    assert.equal(all.flights.length, before.length + 1);
    assert.ok(all.flights.some(f => f.id === createdId));
    const one = await api('B-get-by-id', 'GET', '/api/flights/' + createdId, 200);
    assert.equal(one.flight.price, 4500);
    const updatedPayload = { ...flight, price: 4750, status: 'Delayed', departureTime: '09:30 AM' };
    const updated = await api('D-put-update', 'PUT', '/api/flights/' + createdId, 200, updatedPayload);
    assert.equal(updated.flight.price, 4750);
    await sqlStage('sql-after-put', 4750, 1);
    const [updatedRows] = await db.execute('SELECT status, departureTime FROM flights WHERE id = ?', [createdId]);
    assert.equal(updatedRows[0].status, 'Delayed');
    assert.equal(updatedRows[0].departureTime, '09:30 AM');
    const fetched = await api('B-get-updated', 'GET', '/api/flights/' + createdId, 200);
    assert.equal(fetched.flight.price, 4750);
    assert.equal(fetched.flight.status, 'Delayed');
    assert.equal(fetched.flight.departureTime, '09:30 AM');
    const route = await api('F-search-route', 'GET', '/api/flights/search?from=BOM&to=DEL', 200);
    assert.ok(route.flights.some(f => f.id === createdId));
    const dated = await api('F-search-date', 'GET', '/api/flights/search?from=BOM&to=DEL&departureDate=2026-12-15', 200);
    assert.ok(dated.flights.some(f => f.id === createdId));
    assert.ok(dated.flights.every(f => f.departureDate === flight.departureDate && f.active));
    await api('E-delete', 'DELETE', '/api/flights/' + createdId, 200);
    await sqlStage('sql-after-delete', 4750, 0);
    const inactive = await api('get-after-delete', 'GET', '/api/flights/' + createdId, 200);
    assert.equal(inactive.flight.active, false);
    const afterSearch = await api('search-after-delete', 'GET',
      '/api/flights/search?from=BOM&to=DEL&departureDate=2026-12-15', 200);
    assert.ok(!afterSearch.flights.some(f => f.id === createdId));
    const afterRoute = await api('route-after-delete', 'GET', '/api/flights/search?from=BOM&to=DEL', 200);
    assert.ok(!afterRoute.flights.some(f => f.id === createdId));
    await api('invalid-date', 'GET', '/api/flights/search?from=BOM&to=DEL&departureDate=not-a-date', 400);
    await api('missing-flight', 'GET', '/api/flights/9223372036854775807', 404);
    await api('invalid-create', 'POST', '/api/flights', 400, {});
    await api('client-id-rejected', 'POST', '/api/flights', 400, { ...flight, id: 1 });
    const [after] = await db.execute('SELECT * FROM flights WHERE id <> ? ORDER BY id', [createdId]);
    assert.deepEqual(after, before, 'Pre-existing flight records must be unchanged');
    const [schemaAfter] = await db.query('SHOW CREATE TABLE flights');
    const normalized = value => value.replace(/AUTO_INCREMENT=\d+/g, 'AUTO_INCREMENT');
    assert.equal(normalized(schemaAfter[0]['Create Table']), normalized(schemaBefore[0]['Create Table']));
    save('verification-summary', {
      passed: true, testFlightId: createdId, flightNumber: flight.flightNumber,
      server, originalFlightCount: before.length,
      preExistingFlightsUnchanged: true, schemaUnchanged: true,
      finalTestFlightActive: false, checks: evidence
    });
    console.log('PASS: REST CRUD and SQL verification; original flights and schema unchanged. Test ID:', createdId);
  } finally {
    await db.end();
    save('requests', evidence);
    if (createdId) console.log('Practical test flight ID:', createdId);
  }
})().catch(error => {
  console.error('VERIFICATION FAILED:', error);
  process.exitCode = 1;
});