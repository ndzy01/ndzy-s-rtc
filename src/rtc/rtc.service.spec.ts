import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RtcService } from './rtc.service';
import { RtcParticipant } from './entities/rtc-participant.entity';
import { RtcPendingEvent } from './entities/rtc-pending-event.entity';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockParticipantRepo = (): MockRepository<RtcParticipant> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
});

const mockEventRepo = (): MockRepository<RtcPendingEvent> => ({
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  softDelete: jest.fn(),
  softRemove: jest.fn(),
});

describe('RtcService', () => {
  let service: RtcService;
  let participantRepo: MockRepository<RtcParticipant>;
  let eventRepo: MockRepository<RtcPendingEvent>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RtcService,
        { provide: getRepositoryToken(RtcParticipant), useFactory: mockParticipantRepo },
        { provide: getRepositoryToken(RtcPendingEvent), useFactory: mockEventRepo },
      ],
    }).compile();

    service = module.get<RtcService>(RtcService);
    participantRepo = module.get(getRepositoryToken(RtcParticipant));
    eventRepo = module.get(getRepositoryToken(RtcPendingEvent));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---- join ----

  describe('join', () => {
    it('在新用户加入空房间时，返回空数组并创建参与者记录', async () => {
      participantRepo.findOne!.mockResolvedValue(null); // 无旧会话
      participantRepo.find!.mockResolvedValue([]); // 无在线用户
      participantRepo.create!.mockReturnValue({ uid: 'u1', roomId: 'r1' });
      participantRepo.save!.mockResolvedValue({});

      const result = await service.join('r1', 'u1');

      expect(result).toEqual([]);
      expect(participantRepo.save).toHaveBeenCalledTimes(1); // 只创建新记录，不通知其他人
    });

    it('当房间已有在线用户时，通知已在线用户有人加入', async () => {
      const existing = [{ uid: 'u2' }, { uid: 'u3' }];
      participantRepo.findOne!.mockResolvedValue(null);
      participantRepo.find!.mockResolvedValue(existing);

      const eventEntities = [{ targetUid: 'u2' }, { targetUid: 'u3' }];
      participantRepo.create!.mockReturnValue({ uid: 'u1', roomId: 'r1' });
      participantRepo.save!.mockResolvedValue({});
      eventRepo.create!.mockImplementation((input: any) => input);
      eventRepo.save!.mockResolvedValue(eventEntities);

      const result = await service.join('r1', 'u1');

      expect(result).toEqual(['u2', 'u3']);
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ targetUid: 'u2', type: 'user-joined', userId: 'u1' }),
          expect.objectContaining({ targetUid: 'u3', type: 'user-joined', userId: 'u1' }),
        ]),
      );
    });

    it('同用户重连时，软删除旧待消费事件并标记旧会话离开', async () => {
      const staleSession = { uid: 'u1', roomId: 'r1', leaveAt: null };
      participantRepo.findOne!.mockResolvedValueOnce(staleSession); // 旧会话
      participantRepo.findOne!.mockResolvedValueOnce(null); // 第二次 findOne 查询（实际上原代码只用了一次，但这里简化）
      // 实际上 stale session 查询后 set leaveAt 再 save
      participantRepo.find!.mockResolvedValue([]);
      participantRepo.create!.mockReturnValue({ uid: 'u1', roomId: 'r1' });
      participantRepo.save!.mockResolvedValue({});
      eventRepo.softDelete!.mockResolvedValue({});

      await service.join('r1', 'u1');

      expect(participantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'u1', leaveAt: expect.any(Date) }),
      );
      expect(eventRepo.softDelete).toHaveBeenCalledWith({ targetUid: 'u1' });
    });

    it('存在同名在线用户时返回去重后的列表', async () => {
      const active = [{ uid: 'u1' }, { uid: 'u2' }, { uid: 'u1' }]; // u1 重复
      participantRepo.findOne!.mockResolvedValue(null);
      participantRepo.find!.mockResolvedValue(active);
      participantRepo.create!.mockReturnValue({ uid: 'u3', roomId: 'r1' });
      participantRepo.save!.mockResolvedValue({});
      eventRepo.create!.mockImplementation((input: any) => input);
      eventRepo.save!.mockResolvedValue([]);

      const result = await service.join('r1', 'u3');

      expect(result).toEqual(['u1', 'u2']); // 去重
    });
  });

  // ---- leave ----

  describe('leave', () => {
    it('标记当前会话离开并通知剩余用户', async () => {
      const session = { uid: 'u1', roomId: 'r1', leaveAt: null };
      participantRepo.findOne!.mockResolvedValue(session);
      participantRepo.find!.mockResolvedValue([{ uid: 'u2' }]);
      participantRepo.save!.mockResolvedValue({});
      eventRepo.create!.mockImplementation((input: any) => input);
      eventRepo.save!.mockResolvedValue([]);
      eventRepo.softDelete!.mockResolvedValue({});

      await service.leave('r1', 'u1');

      expect(participantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'u1', leaveAt: expect.any(Date) }),
      );
      expect(eventRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ targetUid: 'u2', type: 'user-leave', userId: 'u1' }),
      ]);
      expect(eventRepo.softDelete).toHaveBeenCalledWith({ targetUid: 'u1' });
    });

    it('没有活跃会话时不做任何操作', async () => {
      participantRepo.findOne!.mockResolvedValue(null);
      participantRepo.find!.mockResolvedValue([]);

      await service.leave('r1', 'u1');

      expect(participantRepo.save).not.toHaveBeenCalled();
      expect(eventRepo.save).not.toHaveBeenCalled();
    });

    it('剩余用户为空时不发送通知', async () => {
      const session = { uid: 'u1', roomId: 'r1', leaveAt: null };
      participantRepo.findOne!.mockResolvedValue(session);
      participantRepo.find!.mockResolvedValue([]); // 没有剩余用户
      participantRepo.save!.mockResolvedValue({});
      eventRepo.softDelete!.mockResolvedValue({});

      await service.leave('r1', 'u1');

      expect(eventRepo.save).not.toHaveBeenCalled();
    });
  });

  // ---- signal ----

  describe('signal', () => {
    it('创建信号事件', async () => {
      eventRepo.create!.mockImplementation((input: any) => input);
      eventRepo.save!.mockResolvedValue({});

      await service.signal('toUid', 'fromUid', { sdp: 'xxx' });

      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUid: 'toUid',
          type: 'signal',
          fromUid: 'fromUid',
          payload: { sdp: 'xxx' },
        }),
      );
    });
  });

  // ---- heartbeat ----

  describe('heartbeat', () => {
    it('更新在线用户的心跳时间', async () => {
      participantRepo.update!.mockResolvedValue({ affected: 1 });

      await service.heartbeat('u1', 'r1');

      expect(participantRepo.update).toHaveBeenCalledTimes(1);
      const [whereArg, setArg] = participantRepo.update!.mock.calls[0];
      expect(whereArg).toEqual({ uid: 'u1', roomId: 'r1', leaveAt: expect.any(Object) });
      expect(whereArg.leaveAt).not.toBeNull();
      expect(setArg).toEqual({ lastHeartbeatAt: expect.any(Date) });
    });
  });

  // ---- checkInactiveUsers ----

  describe('checkInactiveUsers', () => {
    it('踢出心跳超时的用户（指定 roomId）', async () => {
      const inactive = [{ uid: 'u1', roomId: 'r1' }, { uid: 'u2', roomId: 'r1' }];
      // 第一次 find: checkInactiveUsers 查询超时用户
      participantRepo.find!.mockResolvedValueOnce(inactive);
      // leave 内部会再次调用 find (查剩余用户) × 2
      participantRepo.find!.mockResolvedValueOnce([]);
      participantRepo.find!.mockResolvedValueOnce([]);

      // leave 内部: findOne session
      participantRepo.findOne!.mockResolvedValueOnce({ uid: 'u1', roomId: 'r1', leaveAt: null });
      participantRepo.findOne!.mockResolvedValueOnce({ uid: 'u2', roomId: 'r1', leaveAt: null });
      participantRepo.save!.mockResolvedValue({});
      eventRepo.softDelete!.mockResolvedValue({});

      await service.checkInactiveUsers('r1');

      expect(participantRepo.save).toHaveBeenCalledTimes(2);
    });

    it('房间内无超时用户时不执行离开', async () => {
      participantRepo.find!.mockResolvedValue([]);

      await service.checkInactiveUsers('r1');

      expect(participantRepo.save).not.toHaveBeenCalled();
    });

    it('全局扫描时不传 roomId 条件', async () => {
      participantRepo.find!.mockResolvedValue([]);

      await service.checkInactiveUsers();

      expect(participantRepo.find).toHaveBeenCalledTimes(1);
      const callArg = participantRepo.find!.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
      expect(callArg.where.roomId).toBeUndefined();
      expect(callArg.where.leaveAt).not.toBeNull();
      expect(callArg.where.lastHeartbeatAt).not.toBeNull();
    });
  });

  // ---- poll ----

  describe('poll', () => {
    it('拉取待消费事件并软删除，返回格式化的事件', async () => {
      // 1. poll 内部: findOne 查活跃会话
      participantRepo.findOne!.mockResolvedValueOnce({ uid: 'u1', roomId: 'r1' });
      // 2. checkInactiveUsers: find 查超时用户 → 空（无超时）
      participantRepo.find!.mockResolvedValueOnce([]);

      const pendingEvents = [
        { type: 'user-joined', userId: 'u2', fromUid: null, payload: null },
        { type: 'signal', userId: null, fromUid: 'u3', payload: { sdp: 'sdp' } },
      ];
      eventRepo.find!.mockResolvedValue(pendingEvents);
      eventRepo.softRemove!.mockResolvedValue(pendingEvents);

      const result = await service.poll('u1');

      expect(eventRepo.softRemove).toHaveBeenCalledWith(pendingEvents);
      expect(result).toEqual([
        { type: 'user-joined', userId: 'u2', from: undefined, data: null },
        { type: 'signal', userId: undefined, from: 'u3', data: { sdp: 'sdp' } },
      ]);
    });

    it('无活跃会话时不调用 checkInactiveUsers 但仍拉取事件', async () => {
      participantRepo.findOne!.mockResolvedValue(null);
      eventRepo.find!.mockResolvedValue([]);

      const result = await service.poll('u1');

      expect(result).toEqual([]);
    });

    it('待消费事件为空时返回空数组', async () => {
      participantRepo.findOne!.mockResolvedValueOnce({ uid: 'u1', roomId: 'r1' });
      // checkInactiveUsers: find 查超时用户 → 空
      participantRepo.find!.mockResolvedValueOnce([]);
      eventRepo.find!.mockResolvedValue([]);

      const result = await service.poll('u1');

      expect(result).toEqual([]);
    });
  });
});