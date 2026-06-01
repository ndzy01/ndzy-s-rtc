import { Test, TestingModule } from '@nestjs/testing';
import { RtcController } from './rtc.controller';
import { RtcService } from './rtc.service';

describe('RtcController', () => {
  let controller: RtcController;
  let service: RtcService;

  const mockRtcService = {
    join: jest.fn(),
    leave: jest.fn(),
    signal: jest.fn(),
    poll: jest.fn(),
    heartbeat: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RtcController],
      providers: [{ provide: RtcService, useValue: mockRtcService }],
    }).compile();

    controller = module.get<RtcController>(RtcController);
    service = module.get<RtcService>(RtcService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /rtc/join', () => {
    it('调用 service.join 并返回已有用户列表', async () => {
      mockRtcService.join.mockResolvedValue(['u2', 'u3']);

      const result = await controller.join({ roomId: 'r1', uid: 'u1' });

      expect(service.join).toHaveBeenCalledWith('r1', 'u1');
      expect(result).toEqual({ existingUsers: ['u2', 'u3'] });
    });
  });

  describe('POST /rtc/leave', () => {
    it('调用 service.leave 并返回 ok', async () => {
      mockRtcService.leave.mockResolvedValue(undefined);

      const result = await controller.leave({ roomId: 'r1', uid: 'u1' });

      expect(service.leave).toHaveBeenCalledWith('r1', 'u1');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('POST /rtc/signal', () => {
    it('调用 service.signal 并返回 ok', async () => {
      mockRtcService.signal.mockResolvedValue(undefined);

      const result = await controller.signal({
        to: 'u2',
        from: 'u1',
        data: { sdp: 'xxx' },
        roomId: 'r1',
      });

      expect(service.signal).toHaveBeenCalledWith('u2', 'u1', { sdp: 'xxx' });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('GET /rtc/poll/:uid', () => {
    it('调用 service.poll 并返回事件列表', async () => {
      const events = [
        { type: 'user-joined', userId: 'u2' },
        { type: 'signal', from: 'u3', data: { sdp: 'sdp' } },
      ];
      mockRtcService.poll.mockResolvedValue(events);

      const result = await controller.poll('u1');

      expect(service.poll).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ events });
    });
  });

  describe('POST /rtc/heartbeat', () => {
    it('调用 service.heartbeat 并返回 ok', async () => {
      mockRtcService.heartbeat.mockResolvedValue(undefined);

      const result = await controller.heartbeat({ uid: 'u1', roomId: 'r1' });

      expect(service.heartbeat).toHaveBeenCalledWith('u1', 'r1');
      expect(result).toEqual({ ok: true });
    });
  });
});