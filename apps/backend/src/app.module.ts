import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { CountriesModule } from './countries/countries.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URL', 'mongodb://localhost:27017/geodata'),
        // Read-only API: never let Mongoose try to build indexes on the seeded collections.
        autoIndex: false,
      }),
    }),
    CountriesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
