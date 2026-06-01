import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('RTC e2e 全量功能测试', () => {
  let app: INestApplication<App>;
  let http: request.SuperTest<request.Test>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = request(app.getHttpServer());
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  // ═══════════════════ 1. join ═══════════════════

  describe('POST /api/rtc/join', () => {
    const ts = Date.now().toString(36);
    const r = `join-${ts}`;

    it('1.1 新用户加入空房间，返回空 existingUsers', async () => {
      const res = await http.post('/api/rtc/join').send({ roomId: r, uid: 'a1' + ts });
      expect(res.status).toBe(201);
      expect(res.body.existingUsers).toEqual([]);
    });

    it('1.2 第二个用户加入已有房间，返回已有用户，且已有用户 poll 收到 user-joined', async () => {
      const res = await http.post('/api/rtc/join').send({ roomId: r, uid: 'a2' + ts });
      expect(res.status).toBe(201);
      expect(res.body.existingUsers).toEqual(['a1' + ts]);

      const poll = await http.get(`/api/rtc/poll/a1${ts}`);
      expect(poll.body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'user-joined', userId: 'a2' + ts }),
        ]),
      );
    });

    it('1.3 同用户重连：旧会话清理，无残留事件', async () => {
      // 送一个 signal 给 a1 产生残留事件
      await http.post('/api/rtc/signal').send({ to: 'a1' + ts, from: 'a2' + ts, data: { t: 'stale' }, roomId: r });

      // a1 重连
      const res = await http.post('/api/rtc/join').send({ roomId: r, uid: 'a1' + ts });
      expect(res.status).toBe(201);

      // poll 不应包含 stale signal
      const poll = await http.get(`/api/rtc/poll/a1${ts}`);
      const stale = poll.body.events.filter((e: any) => e.data?.t === 'stale');
      expect(stale.length).toBe(0);
    });
  });

  // ═══════════════════ 2. signal ═══════════════════

  describe('POST /api/rtc/signal', () => {
    const ts = Date.now().toString(36);
    const r = `sig-${ts}`;

    beforeAll(async () => {
      await http.post('/api/rtc/join').send({ roomId: r, uid: 'sa' + ts });
      await http.post('/api/rtc/join').send({ roomId: r, uid: 'sb' + ts });
    });

    it('2.1 sb → sa 信令，sa poll 能收到，sb poll 收不到', async () => {
      await http.post('/api/rtc/signal').send({ to: 'sa' + ts, from: 'sb' + ts, data: { sdp: 'offer' }, roomId: r });

      const pollA = await http.get(`/api/rtc/poll/sa${ts}`);
      expect(pollA.body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'signal', from: 'sb' + ts, data: { sdp: 'offer' } }),
        ]),
      );

      const pollB = await http.get(`/api/rtc/poll/sb${ts}`);
      expect(pollB.body.events).toEqual([]);
    });

    it('2.2 向不存在的用户发信令不报错', async () => {
      const res = await http.post('/api/rtc/signal').send({ to: 'ghost', from: 'sa' + ts, data: {}, roomId: r });
      expect(res.status).toBe(201);
    });
  });

  // ═══════════════════ 3. heartbeat ═══════════════════

  describe('POST /api/rtc/heartbeat', () => {
    const ts = Date.now().toString(36);
    const r = `hb-${ts}`;

    beforeAll(async () => {
      await http.post('/api/rtc/join').send({ roomId: r, uid: 'ha' + ts });
    });

    it('3.1 在线用户心跳返回 ok', async () => {
      const res = await http.post('/api/rtc/heartbeat').send({ uid: 'ha' + ts, roomId: r });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('3.2 已离开用户心跳不报错', async () => {
      await http.post('/api/rtc/leave').send({ roomId: r, uid: 'ha' + ts });
      const res = await http.post('/api/rtc/heartbeat').send({ uid: 'ha' + ts, roomId: r });
      expect(res.status).toBe(201);
    });
  });

  // ═══════════════════ 4. leave ═══════════════════

  describe('POST /api/rtc/leave', () => {
    const ts = Date.now().toString(36);
    const r = `lv-${ts}`;

    beforeAll(async () => {
      await http.post('/api/rtc/join').send({ roomId: r, uid: 'la' + ts });
      await http.post('/api/rtc/join').send({ roomId: r, uid: 'lb' + ts });
    });

    it('4.1 lb 离开后，la poll 收到 user-leave 事件', async () => {
      await http.post('/api/rtc/leave').send({ roomId: r, uid: 'lb' + ts });

      const poll = await http.get(`/api/rtc/poll/la${ts}`);
      expect(poll.body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'user-leave', userId: 'lb' + ts }),
        ]),
      );
    });

    it('4.2 离开后该用户 poll 返回空事件', async () => {
      await http.post('/api/rtc/leave').send({ roomId: r, uid: 'la' + ts });

      const poll = await http.get(`/api/rtc/poll/la${ts}`);
      expect(poll.body.events).toEqual([]);
    });

    it('4.3 离开不存在的会话不报错', async () => {
      const res = await http.post('/api/rtc/leave').send({ roomId: r, uid: 'la' + ts });
      expect(res.status).toBe(201);
    });

    it('4.4 最后一人离开后无通知', async () => {
      // 重新加入后离开，此时房间只剩此一人
      await http.post('/api/rtc/join').send({ roomId: r, uid: 'la' + ts });
      const res = await http.post('/api/rtc/leave').send({ roomId: r, uid: 'la' + ts });
      expect(res.status).toBe(201);
    });
  });

  // ═══════════════════ 5. poll 边界 ═══════════════════

  describe('GET /api/rtc/poll', () => {
    const ts = Date.now().toString(36);

    it('5.1 不存在的用户 poll 返回空', async () => {
      const res = await http.get(`/api/rtc/poll/ghost-${ts}`);
      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
    });

    it('5.2 在线用户无待消费事件时返回空', async () => {
      const r = `pl-${ts}`;
      await http.post('/api/rtc/join').send({ roomId: r, uid: 'pa' + ts });
      const res = await http.get(`/api/rtc/poll/pa${ts}`);
      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
    });
  });
});