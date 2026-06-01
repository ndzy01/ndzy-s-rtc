import { Module } from '@nestjs/common';
import { RtcModule } from './rtc/rtc.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RtcParticipant } from './rtc/entities/rtc-participant.entity';
import { RtcPendingEvent } from './rtc/entities/rtc-pending-event.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      port: 5432,
      host: process.env.DB_HOST,
      username: 'neondb_owner',
      password: process.env.DB_PASSWORD,
      database: 'neondb',
      ssl: true,
      entities: [RtcParticipant, RtcPendingEvent],
      synchronize: true,
    }),
    RtcModule,
  ],
})
export class AppModule {}
