import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'sqlite:///home/user/chess-platform/data/test-suite.sqlite';
  const module = await import('./server');
  app = module.app;
});

describe('server api', () => {
  it('registers, authenticates and uploads a profile image', async () => {
    const email = `user${Date.now()}@example.com`;
    const register = await request(app).post('/api/auth/register').send({
      username: `player${Date.now()}`,
      email,
      password: 'StrongPass123',
    });
    expect(register.status).toBe(201);
    expect(register.body.token).toBeTruthy();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    const upload = await request(app)
      .post('/api/uploads/image')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({
        fileName: 'pixel.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn1lKsAAAAASUVORK5CYII=',
      });
    expect(upload.status).toBe(201);
    expect(upload.body.url).toMatch(/^\/uploads\//);
  });

  it('creates rooms, joins/leaves, searches and manages friends', async () => {
    const suffix = Date.now();
    const userOne = await request(app).post('/api/auth/register').send({
      username: `captain${suffix}`,
      email: `captain${suffix}@example.com`,
      password: 'StrongPass123',
    });
    const userTwo = await request(app).post('/api/auth/register').send({
      username: `guest${suffix}`,
      email: `guest${suffix}@example.com`,
      password: 'StrongPass123',
    });

    const tokenOne = userOne.body.token;
    const tokenTwo = userTwo.body.token;
    const userTwoId = userTwo.body.user.id;

    const room = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({ name: 'Rapid Arena', visibility: 'public', maxPlayers: 4, timeControl: 'rapid', incrementSeconds: 2 });
    expect(room.status).toBe(201);

    const rooms = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${tokenTwo}`);
    expect(rooms.status).toBe(200);
    expect(rooms.body.rooms.length).toBeGreaterThan(0);
    expect(rooms.body.rooms[0].is_member).toBe(false);

    const joined = await request(app)
      .post(`/api/rooms/${room.body.room.id}/join`)
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({});
    expect(joined.status).toBe(200);

    const members = await request(app)
      .get(`/api/rooms/${room.body.room.id}/members`)
      .set('Authorization', `Bearer ${tokenOne}`);
    expect(members.status).toBe(200);
    expect(members.body.members.some((member: any) => member.user_id === userTwoId)).toBe(true);

    const left = await request(app)
      .post(`/api/rooms/${room.body.room.id}/leave`)
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({});
    expect(left.status).toBe(200);

    const search = await request(app)
      .get(`/api/search?q=${encodeURIComponent(`guest${suffix}`)}`)
      .set('Authorization', `Bearer ${tokenOne}`);
    expect(search.status).toBe(200);
    expect(search.body.users.some((user: any) => user.id === userTwoId)).toBe(true);

    const requestFriend = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({ friendId: userTwoId });
    expect(requestFriend.status).toBe(201);

    const incoming = await request(app)
      .get('/api/friends')
      .set('Authorization', `Bearer ${tokenTwo}`);
    expect(incoming.status).toBe(200);
    expect(incoming.body.incoming.some((entry: any) => entry.requester_id === userOne.body.user.id)).toBe(true);

    const acceptFriend = await request(app)
      .post(`/api/friends/${userOne.body.user.id}/accept`)
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({});
    expect(acceptFriend.status).toBe(200);

    const friends = await request(app)
      .get('/api/friends')
      .set('Authorization', `Bearer ${tokenOne}`);
    expect(friends.status).toBe(200);
    expect(friends.body.friends.some((entry: any) => entry.friend_user_id === userTwoId)).toBe(true);

    const leaderboard = await request(app).get('/api/leaderboard');
    expect(leaderboard.status).toBe(200);
  });
});
