import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Country } from './schemas/country.schema';
import { Geometry } from './schemas/geometry.schema';
import { Snapshot } from './schemas/snapshot.schema';

/** Strip Mongo bookkeeping fields from any lean result. */
const STRIP = { _id: 0, __v: 0 } as const;

@Injectable()
export class CountriesService {
  constructor(
    @InjectModel(Country.name) private readonly countries: Model<Country>,
    @InjectModel(Snapshot.name) private readonly snapshots: Model<Snapshot>,
    @InjectModel(Geometry.name) private readonly geometries: Model<Geometry>,
  ) {}

  // ------------------------------------------------------------------ //
  // Registry
  // ------------------------------------------------------------------ //

  listCountries() {
    return this.countries.find({}, STRIP).lean().exec();
  }

  async getCountry(code: string) {
    const country = await this.countries.findOne({ country_code: code }, STRIP).lean().exec();
    if (!country) {
      throw new NotFoundException(`Unknown country '${code}'`);
    }
    return country;
  }

  /**
   * Themes + indicators + per-level availability, computed from the stored snapshots so it
   * reflects what is actually queryable (never a hardcoded list). Drives which map modes the
   * frontend enables at each zoom level.
   */
  async getThemes(code: string) {
    const country = await this.getCountry(code);

    const rows = await this.snapshots.aggregate<{
      _id: { level: string; theme: string };
      indicators: string[];
    }>([
      { $match: { country_code: code } },
      { $project: { level: 1, themes: { $objectToArray: '$indicators' } } },
      { $unwind: '$themes' },
      {
        $project: {
          level: 1,
          theme: '$themes.k',
          keys: {
            $map: { input: { $objectToArray: '$themes.v' }, as: 'i', in: '$$i.k' },
          },
        },
      },
      { $unwind: '$keys' },
      { $group: { _id: { level: '$level', theme: '$theme' }, indicators: { $addToSet: '$keys' } } },
    ]);

    const availability: Record<string, Record<string, string[]>> = {};
    for (const row of rows) {
      const { level, theme } = row._id;
      (availability[level] ??= {})[theme] = row.indicators.sort();
    }

    return {
      country_code: code,
      themes: country.themes ?? [],
      indicators: country.available_indicators ?? {},
      availability,
    };
  }

  // ------------------------------------------------------------------ //
  // Level & period resolution
  // ------------------------------------------------------------------ //

  /** Default to the country's first registered level when the caller omits `level`. */
  private async resolveLevel(code: string, level?: string): Promise<string> {
    if (level) return level;
    const country = await this.getCountry(code);
    const first = country.levels?.[0];
    if (!first) {
      throw new NotFoundException(`Country '${code}' has no levels`);
    }
    return first;
  }

  /** Resolve `period`, or `null` when the scope has no stored data (list endpoints → []). */
  private async resolvePeriodOrNull(
    code: string,
    level: string,
    period?: string,
  ): Promise<string | null> {
    if (period && period !== 'latest') return period;
    const periods = await this.periods(code, level);
    return periods[0] ?? null; // periods() returns newest-first
  }

  /** Like {@link resolvePeriodOrNull} but 404s — for single-resource lookups. */
  private async resolvePeriod(code: string, level: string, period?: string): Promise<string> {
    const resolved = await this.resolvePeriodOrNull(code, level, period);
    if (resolved === null) {
      throw new NotFoundException(`No periods for country '${code}' at level '${level}'`);
    }
    return resolved;
  }

  // ------------------------------------------------------------------ //
  // Geometry (currently empty by decision — returns an empty FeatureCollection)
  // ------------------------------------------------------------------ //

  async getGeometries(code: string, level?: string) {
    const resolvedLevel = await this.resolveLevel(code, level);
    const docs = await this.geometries
      .find({ country_code: code, level: resolvedLevel }, STRIP)
      .lean()
      .exec();

    return {
      type: 'FeatureCollection',
      features: docs.map((doc) => ({
        type: 'Feature',
        properties: {
          code: doc.code,
          name: doc.name,
          abbrev: doc.abbrev ?? null,
          parent_code: doc.parent_code ?? null,
        },
        geometry: doc.geometry,
      })),
    };
  }

  // ------------------------------------------------------------------ //
  // Periods & regions (indicator data)
  // ------------------------------------------------------------------ //

  async periods(code: string, level?: string): Promise<string[]> {
    const resolvedLevel = await this.resolveLevel(code, level);
    const periods: string[] = await this.snapshots.distinct('period', {
      country_code: code,
      level: resolvedLevel,
    });
    // Newest first (string sort handles "2022", "2023-P1", "2023-06" correctly).
    return periods.sort((a, b) => b.localeCompare(a));
  }

  async getRegions(code: string, level?: string, period?: string) {
    const resolvedLevel = await this.resolveLevel(code, level);
    const resolvedPeriod = await this.resolvePeriodOrNull(code, resolvedLevel, period);
    if (resolvedPeriod === null) return [];
    return this.snapshots
      .find({ country_code: code, level: resolvedLevel, period: resolvedPeriod }, STRIP)
      .sort({ code: 1 })
      .lean()
      .exec();
  }

  async getRegion(code: string, region: string, level?: string, period?: string) {
    const resolvedLevel = await this.resolveLevel(code, level);
    const resolvedPeriod = await this.resolvePeriod(code, resolvedLevel, period);
    const doc = await this.snapshots
      .findOne(
        { country_code: code, level: resolvedLevel, code: region, period: resolvedPeriod },
        STRIP,
      )
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException(
        `No region '${region}' for '${code}' at level '${resolvedLevel}', period '${resolvedPeriod}'`,
      );
    }
    return doc;
  }

  async getRegionChildren(code: string, region: string, level?: string, period?: string) {
    const resolvedLevel = await this.resolveLevel(code, level);
    const resolvedPeriod = await this.resolvePeriodOrNull(code, resolvedLevel, period);
    if (resolvedPeriod === null) return [];
    return this.snapshots
      .find(
        {
          country_code: code,
          level: resolvedLevel,
          parent_code: region,
          period: resolvedPeriod,
        },
        STRIP,
      )
      .sort({ code: 1 })
      .lean()
      .exec();
  }
}
