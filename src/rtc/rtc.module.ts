import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RtcController } from './rtc.controller';
import { RtcService } from './rtc.service';
import { RtcParticipant } from './entities/rtc-participant.entity';
import { RtcPendingEvent } from './entities/rtc-pending-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RtcParticipant, RtcPendingEvent])],
  controllers: [RtcController],
  providers: [RtcService],
})
export class RtcModule {}
