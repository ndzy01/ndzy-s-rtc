import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rtc_participant')
@Index(['roomId', 'leaveAt'])
export class RtcParticipant {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ length: 128 })
  declare uid: string;

  @Column({ name: 'room_id', length: 128 })
  declare roomId: string;

  @CreateDateColumn({ name: 'joined_at' })
  declare joinedAt: Date;

  @Column({ name: 'leave_at', type: 'timestamptz', nullable: true, default: null })
  declare leaveAt: Date | null;

  /** 最近一次心跳时间，NULL 表示从未上报（旧数据兼容） */
  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true, default: null })
  declare lastHeartbeatAt: Date | null;
}
