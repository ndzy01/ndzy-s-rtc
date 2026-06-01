import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RtcEventType = 'user-joined' | 'user-leave' | 'signal';

@Entity('rtc_pending_event')
@Index(['targetUid', 'createdAt'])
export class RtcPendingEvent {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** 事件接收方 uid */
  @Column({ name: 'target_uid', length: 128 })
  declare targetUid: string;

  @Column({ length: 32 })
  declare type: RtcEventType;

  /** user-joined / user-leave 时携带的用户 ID */
  @Column({ name: 'user_id', type: 'varchar', length: 128, nullable: true, default: null })
  declare userId: string | null;

  /** signal 事件的发送方 uid */
  @Column({ name: 'from_uid', type: 'varchar', length: 128, nullable: true, default: null })
  declare fromUid: string | null;

  /** signal 的 SDP / ICE 数据 */
  @Column({ type: 'jsonb', nullable: true, default: null })
  declare payload: unknown;

  @CreateDateColumn({ name: 'created_at' })
  declare createdAt: Date;

  /** 软删除时间（已消费的事件），NULL 表示待消费 */
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  declare deletedAt: Date | null;
}
