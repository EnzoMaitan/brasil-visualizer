import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { Country, CountrySchema } from './schemas/country.schema';
import { Geometry, GeometrySchema } from './schemas/geometry.schema';
import { Snapshot, SnapshotSchema } from './schemas/snapshot.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: Snapshot.name, schema: SnapshotSchema },
      { name: Geometry.name, schema: GeometrySchema },
    ]),
  ],
  controllers: [CountriesController],
  providers: [CountriesService],
})
export class CountriesModule {}
