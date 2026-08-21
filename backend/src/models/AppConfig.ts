import mongoose, { Schema, Document } from 'mongoose';

export interface IRateHistory {
  value: number;
  changedBy: mongoose.Types.ObjectId | string;
  changedAt: Date;
}

export interface IAppConfig extends Document {
  key: string;
  value: any;
  label?: string;
  description?: string;
  updatedBy?: mongoose.Types.ObjectId | string;
  history?: IRateHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const rateHistorySchema = new Schema<IRateHistory>({
  value: { type: Schema.Types.Mixed, required: true },
  changedBy: { type: Schema.Types.Mixed, required: true },
  changedAt: { type: Date, default: Date.now }
}, { _id: false });

const appConfigSchema = new Schema<IAppConfig>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  label: { type: String },
  description: { type: String },
  updatedBy: { type: Schema.Types.Mixed },
  history: [rateHistorySchema]
}, { timestamps: true });

export default mongoose.model<IAppConfig>('AppConfig', appConfigSchema, 'app_configs');
