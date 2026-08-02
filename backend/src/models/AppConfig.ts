import mongoose, { Schema, Document } from 'mongoose';

export interface IRateHistory {
  value: number;
  changedBy: mongoose.Types.ObjectId | string;
  changedAt: Date;
}

export interface IAppConfig extends Document {
  key: string;
  value: number;
  label: string;
  description: string;
  updatedBy?: mongoose.Types.ObjectId | string;
  history?: IRateHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const rateHistorySchema = new Schema<IRateHistory>({
  value: { type: Number, required: true },
  changedBy: { type: Schema.Types.Mixed, required: true },
  changedAt: { type: Date, default: Date.now }
}, { _id: false });

const appConfigSchema = new Schema<IAppConfig>({
  key: { type: String, required: true, unique: true },
  value: { type: Number, required: true },
  label: { type: String, required: true },
  description: { type: String },
  updatedBy: { type: Schema.Types.Mixed },
  history: [rateHistorySchema]
}, { timestamps: true });

export default mongoose.model<IAppConfig>('AppConfig', appConfigSchema, 'app_configs');
