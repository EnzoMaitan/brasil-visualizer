import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`Backend listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
