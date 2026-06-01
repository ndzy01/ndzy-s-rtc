import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RtcService } from './rtc.service';

@Controller('rtc')
export class RtcController {
  constructor(private readonly rtcService: RtcService) {}

  @Post('join')
  async join(@Body() body: { roomId: string; uid: string }) {
    const existingUsers = await this.rtcService.join(body.roomId, body.uid);
    return { existingUsers };
  }

  @Post('leave')
  async leave(@Body() body: { roomId: string; uid: string }) {
    await this.rtcService.leave(body.roomId, body.uid);
    return { ok: true };
  }

  @Post('signal')
  async signal(@Body() body: { to: string; from: string; data: unknown; roomId: string }) {
    await this.rtcService.signal(body.to, body.from, body.data);
    return { ok: true };
  }

  @Get('poll/:uid')
  async poll(@Param('uid') uid: string) {
    const events = await this.rtcService.poll(uid);
    return { events };
  }

  @Post('heartbeat')
  async heartbeat(@Body() body: { uid: string; roomId: string }) {
    await this.rtcService.heartbeat(body.uid, body.roomId);
    return { ok: true };
  }
}
