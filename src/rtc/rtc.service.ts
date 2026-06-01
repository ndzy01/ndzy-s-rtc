import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { RtcParticipant } from './entities/rtc-participant.entity';
import { RtcPendingEvent } from './entities/rtc-pending-event.entity';

export interface RtcEvent {
  type: 'user-joined' | 'user-leave' | 'signal';
  userId?: string;
  from?: string;
  data?: unknown;
}

@Injectable()
export class RtcService {
  private readonly logger = new Logger(RtcService.name);

  constructor(
    @InjectRepository(RtcParticipant)
    private readonly participantRepo: Repository<RtcParticipant>,
    @InjectRepository(RtcPendingEvent)
    private readonly eventRepo: Repository<RtcPendingEvent>,
  ) {}

  async join(roomId: string, uid: string): Promise<string[]> {
    // 同一用户重连时，先将旧记录标记为已离开并清理残留事件
    const staleSession = await this.participantRepo.findOne({
      where: { uid, roomId, leaveAt: IsNull() },
    });
    if (staleSession) {
      staleSession.leaveAt = new Date();
      await this.participantRepo.save(staleSession);
      await this.eventRepo.softDelete({ targetUid: uid });
    }

    // 取得当前在线用户列表（去重）
    const active = await this.participantRepo.find({
      where: { roomId, leaveAt: IsNull() },
      select: { uid: true },
    });
    const existingUids = [...new Set(active.map((p) => p.uid))];

    // 通知已在线用户有新人加入
    if (existingUids.length > 0) {
      await this.eventRepo.save(
        existingUids.map((targetUid) =>
          this.eventRepo.create({ targetUid, type: 'user-joined', userId: uid }),
        ),
      );
    }

    // 创建新的参与者记录
    await this.participantRepo.save(
      this.participantRepo.create({ uid, roomId }),
    );

    return existingUids;
  }

  async leave(roomId: string, uid: string): Promise<void> {
    // 标记用户已离开
    const session = await this.participantRepo.findOne({
      where: { uid, roomId, leaveAt: IsNull() },
    });
    if (session) {
      session.leaveAt = new Date();
      await this.participantRepo.save(session);
    }

    // 通知房间内剩余用户
    const remaining = await this.participantRepo.find({
      where: { roomId, leaveAt: IsNull() },
      select: { uid: true },
    });
    if (remaining.length > 0) {
      await this.eventRepo.save(
        remaining.map((p) =>
          this.eventRepo.create({ targetUid: p.uid, type: 'user-leave', userId: uid }),
        ),
      );
    }

    // 清理该用户的待消费事件
    await this.eventRepo.softDelete({ targetUid: uid });
  }

  async signal(to: string, from: string, data: unknown): Promise<void> {
    await this.eventRepo.save(
      this.eventRepo.create({ targetUid: to, type: 'signal', fromUid: from, payload: data }),
    );
  }

  async heartbeat(uid: string, roomId: string): Promise<void> {
    await this.participantRepo.update(
      { uid, roomId, leaveAt: IsNull() },
      { lastHeartbeatAt: new Date() },
    );
  }

  /**
   * 超过 45s 未上报心跳的在线用户视为掉线。
   * - roomId 传入时只扫描该房间（poll 搭载调用）
   * - roomId 不传时全局扫描（Vercel Cron 每日兜底调用）
   */
  async checkInactiveUsers(roomId?: string): Promise<void> {
    const threshold = new Date(Date.now() - 45_000);
    const inactive = await this.participantRepo.find({
      where: {
        ...(roomId ? { roomId } : {}),
        leaveAt: IsNull(),
        lastHeartbeatAt: LessThan(threshold),
      },
      select: { uid: true, roomId: true },
    });
    if (inactive.length === 0) return;
    this.logger.log(`心跳超时，强制离开: ${inactive.map((p) => p.uid).join(', ')}`);
    for (const p of inactive) {
      await this.leave(p.roomId, p.uid);
    }
  }

  async poll(uid: string): Promise<RtcEvent[]> {
    // 搭载掉线检测：活跃用户轮询时顺带踢出同房间超时用户
    const session = await this.participantRepo.findOne({
      where: { uid, leaveAt: IsNull() },
      select: { roomId: true },
    });
    if (session) {
      await this.checkInactiveUsers(session.roomId);
    }

    const pending = await this.eventRepo.find({
      where: { targetUid: uid },
      order: { createdAt: 'ASC' },
    });
    if (pending.length > 0) {
      await this.eventRepo.softRemove(pending);
    }
    return pending.map((e) => ({
      type: e.type,
      userId: e.userId ?? undefined,
      from: e.fromUid ?? undefined,
      data: e.payload,
    }));
  }
}
