import { Controller, Get } from '@nestjs/common';

/** Root + health endpoints — handy for `docker compose` healthchecks and smoke tests. */
@Controller()
export class AppController {
  @Get()
  root() {
    return {
      name: 'brasil-visualizer backend',
      status: 'ok',
      docs: 'country-agnostic read API — see GET /countries',
    };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
