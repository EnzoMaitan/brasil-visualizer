import { Controller, Get, Param, Query } from '@nestjs/common';

import { CountriesService } from './countries.service';

/**
 * Country-agnostic read API (CLAUDE.md §9). `:code`, `level`, and `period` drive everything;
 * no route, controller, or service contains a country name or a hardcoded region list.
 * `period=latest` (or omitted) resolves to the newest stored period; `level` defaults to the
 * country's first registered level.
 */
@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  list() {
    return this.countries.listCountries();
  }

  @Get(':code')
  getCountry(@Param('code') code: string) {
    return this.countries.getCountry(code);
  }

  @Get(':code/themes')
  getThemes(@Param('code') code: string) {
    return this.countries.getThemes(code);
  }

  @Get(':code/geometries')
  getGeometries(@Param('code') code: string, @Query('level') level?: string) {
    return this.countries.getGeometries(code, level);
  }

  @Get(':code/periods')
  getPeriods(@Param('code') code: string, @Query('level') level?: string) {
    return this.countries.periods(code, level);
  }

  @Get(':code/regions')
  getRegions(
    @Param('code') code: string,
    @Query('level') level?: string,
    @Query('period') period?: string,
  ) {
    return this.countries.getRegions(code, level, period);
  }

  @Get(':code/regions/:region')
  getRegion(
    @Param('code') code: string,
    @Param('region') region: string,
    @Query('level') level?: string,
    @Query('period') period?: string,
  ) {
    return this.countries.getRegion(code, region, level, period);
  }

  @Get(':code/regions/:region/children')
  getRegionChildren(
    @Param('code') code: string,
    @Param('region') region: string,
    @Query('level') level?: string,
    @Query('period') period?: string,
  ) {
    return this.countries.getRegionChildren(code, region, level, period);
  }
}
