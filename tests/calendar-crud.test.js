const assert = require('node:assert/strict');
const app = require('../api/server.js');
const { initDb, executeQuery } = require('../api/db.js');
const crypto = require('node:crypto');

const runTest = async () => {
  await initDb();

  const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || 'sss-local-dev-secret-change-me';
  const signAppToken = (payload) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'sss-rbac' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', APP_SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  };

  const adminUser = await executeQuery("SELECT id FROM users WHERE LOWER(username) = 'admin'");
  const adminId = adminUser?.rows?.[0]?.id || '1';

  const token = signAppToken({
    userId: adminId,
    username: 'admin',
    role: 'Admin',
    expiresAt: Date.now() + 3600000,
  });

  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Create a test event on a specific date
    const postRes = await fetch(`${baseUrl}/api/calendar-events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Operations Review Meeting',
        date: '2026-09-18',
        description: 'Monthly operations audit',
      }),
    });

    assert.equal(postRes.status, 201, `POST status was ${postRes.status}`);
    const createdEvent = await postRes.json();
    assert.ok(createdEvent.id, 'Event should have an ID');
    assert.equal(createdEvent.title, 'Operations Review Meeting');
    assert.equal(createdEvent.event_date, '2026-09-18');
    const createdId = createdEvent.id;

    // 2. Update the event (PUT)
    const putRes = await fetch(`${baseUrl}/api/calendar-events/${createdId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        title: 'Operations Review Meeting - Updated',
        date: '2026-09-22',
        description: 'Updated description for operations audit',
      }),
    });

    assert.equal(putRes.status, 200, `PUT status was ${putRes.status}`);
    const updatedEvent = await putRes.json();
    assert.equal(updatedEvent.title, 'Operations Review Meeting - Updated');
    assert.equal(updatedEvent.event_date, '2026-09-22');
    assert.equal(updatedEvent.description, 'Updated description for operations audit');

    // 3. Delete the event (DELETE)
    const deleteRes = await fetch(`${baseUrl}/api/calendar-events/${createdId}`, {
      method: 'DELETE',
      headers,
    });

    assert.equal(deleteRes.status, 204, `DELETE status was ${deleteRes.status}`);

    console.log('Calendar HTTP CRUD test passed successfully!');
  } finally {
    server.close();
  }
};

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
