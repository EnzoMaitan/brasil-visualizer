import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * `snapshots` collection — one document per region per period (CLAUDE.md §7).
 *
 * `indicators` is an opaque, theme-keyed object (`{ <theme>: { <key>: IndicatorValue } }`);
 * the backend stores and returns it verbatim and never branches on its contents, keeping
 * the API country/indicator-agnostic. `strict: false` tolerates documents written by the
 * worker/loader (e.g. extra fields) without the API needing to model every key.
 */
@Schema({ collection: 'snapshots', strict: false })
export class Snapshot {
  @Prop() country_code!: string;
  @Prop() level!: string;
  @Prop() code!: string;
  @Prop({ type: String, default: null }) parent_code!: string | null;
  @Prop() period!: string;
  @Prop({ type: String }) abbrev?: string;
  @Prop({ type: String }) name?: string;
  @Prop({ type: String }) fetched_at?: string;
  @Prop({ type: Object, default: {} }) indicators!: Record<string, Record<string, unknown>>;
}

export type SnapshotDocument = HydratedDocument<Snapshot>;
export const SnapshotSchema = SchemaFactory.createForClass(Snapshot);
