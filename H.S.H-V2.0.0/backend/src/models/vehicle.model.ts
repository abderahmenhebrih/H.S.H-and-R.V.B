import { Schema, model, type InferSchemaType } from "mongoose";

const vehicleSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    createdAt: {
      type: Number,
      required: true,
    },

    updatedAt: {
      type: Number,
      required: true,
    },

    syncStatus: {
      type: String,
      enum: ["synced", "pending", "failed"],
      required: true,
    },

    lastSyncedAt: {
      type: Number,
      required: false,
    },

    serverRevision: {
      type: Number,
      required: false,
    },

    name: {
      type: String,
      required: true,
      unique: true,
    },

    registrationNumber: {
      type: String,
      required: true,
      unique: true,
    },

    image: {
      type: String,
      required: false,
    },

    imageName: {
      type: String,
      required: false,
    },

    type: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
      required: false,
    },
  },
  {
    collection: "vehicles",
    versionKey: false,
  },
);

export type VehicleDocument = InferSchemaType<typeof vehicleSchema>;

export const VehicleModel = model<VehicleDocument>(
  "Vehicle",
  vehicleSchema,
);

