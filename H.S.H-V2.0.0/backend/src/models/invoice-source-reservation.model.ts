import { Schema, model, type InferSchemaType } from "mongoose";

const invoiceSourceReservationSchema = new Schema(
  {
    saleId: {
      type: String,
      required: true,
      unique: true,
    },
    invoiceId: {
      type: String,
      required: true,
    },
    sellerProfileId: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Number,
      required: true,
    },
  },
  {
    collection: "invoiceSourceReservations",
    versionKey: false,
  }
);

export type InvoiceSourceReservationDocument = InferSchemaType<typeof invoiceSourceReservationSchema>;

export const InvoiceSourceReservationModel = model<InvoiceSourceReservationDocument>(
  "InvoiceSourceReservation",
  invoiceSourceReservationSchema
);
