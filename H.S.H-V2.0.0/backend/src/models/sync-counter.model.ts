import { Schema, model, type InferSchemaType } from "mongoose";

const syncCounterSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    revision: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    collection: "syncCounters",
    versionKey: false,
  },
);

export type SyncCounterDocument = InferSchemaType<typeof syncCounterSchema>;

export const SyncCounterModel = model<SyncCounterDocument>("SyncCounter", syncCounterSchema);
