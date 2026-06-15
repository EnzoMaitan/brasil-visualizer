import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * `geometries` collection — region polygons, decoupled from indicator data (CLAUDE.md §7).
 *
 * Currently EMPTY by decision: real-life borders are deferred (design reference §2), so the
 * IBGE worker collects indicators only. The schema exists so `/geometries` keeps a stable
 * contract — it returns an empty FeatureCollection until geometry is reintroduced.
 */
@Schema({ collection: 'geometries', strict: false })
export class Geometry {
  @Prop() country_code!: string;
  @Prop() level!: string;
  @Prop() code!: string;
  @Prop({ type: String, default: null }) parent_code!: string | null;
  @Prop() name!: string;
  @Prop({ type: String }) abbrev?: string;
  @Prop({ type: Object }) geometry!: Record<string, unknown>;
}

export type GeometryDocument = HydratedDocument<Geometry>;
export const GeometrySchema = SchemaFactory.createForClass(Geometry);
