import mongoose, { Document, Schema } from 'mongoose';

export interface ITicketBuyerReservation extends Document {
  partyId: mongoose.Types.ObjectId;
  tierId: string;
  buyerId: mongoose.Types.ObjectId;
  reservedQuantity: number;
  orderIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TicketBuyerReservationSchema = new Schema<ITicketBuyerReservation>(
  {
    partyId: { type: Schema.Types.ObjectId, required: true, ref: 'Party' },
    tierId: { type: String, required: true },
    buyerId: { type: Schema.Types.ObjectId, required: true, ref: 'AdultUser' },
    reservedQuantity: { type: Number, required: true, default: 0, min: 0 },
    orderIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { collection: 'ticket_buyer_reservations', timestamps: true }
);

TicketBuyerReservationSchema.index({ partyId: 1, tierId: 1, buyerId: 1 }, { unique: true });

export const TicketBuyerReservation = mongoose.model<ITicketBuyerReservation>(
  'TicketBuyerReservation',
  TicketBuyerReservationSchema
);

export default TicketBuyerReservation;
