import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * `countries` collection — the registry the frontend reads to discover what exists
 * (levels, themes, indicators, periods) without hardcoding anything (CLAUDE.md §7).
 */
@Schema({ collection: 'countries', strict: false })
export class Country {
  @Prop() country_code!: string;
  @Prop() country_name!: string;
  @Prop({ type: [String], default: [] }) levels!: string[];
  @Prop({ type: [String], default: [] }) themes!: string[];
  @Prop({ type: Object, default: {} }) available_indicators!: Record<string, string[]>;
  @Prop({ type: [String], default: [] }) periods!: string[];
  @Prop({ type: [String], default: [] }) workers!: string[];
  @Prop({ type: String }) last_scraped?: string;
}

export type CountryDocument = HydratedDocument<Country>;
export const CountrySchema = SchemaFactory.createForClass(Country);
