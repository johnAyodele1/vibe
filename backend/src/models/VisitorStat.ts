import mongoose, { Schema, Document } from 'mongoose';

export interface IVisitorStat extends Document {
  key: string;
  count: number;
}

const visitorStatSchema = new Schema<IVisitorStat>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
});

export default mongoose.model<IVisitorStat>('VisitorStat', visitorStatSchema);
