import { db } from "../../lib/database/db";
import { customerRepository } from "../../repositories/customer.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class CustomerEditOperation {
  async edit(input: {
    customerId: string;
    name: string;
    phone: string;
    address?: string;
    identificationNumber?: string;
    email?: string;
    notes?: string;
    type: string;
    invoiceCustomerType?: "consumer" | "business";
    legalName?: string;
    commercialName?: string;
    legalForm?: string;
    activity?: string;
    billingAddress?: string;
    rc?: string;
    nif?: string;
    nis?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (!input.name.trim()) {
        throw new Error("Customer name is required.");
      }

      if (!input.phone.trim()) {
        throw new Error("Customer phone is required.");
      }

      if (!input.type.trim()) {
        throw new Error("Customer type is required.");
      }

      const customer = await customerRepository.getById(input.customerId);

      if (!customer) {
        throw new Error("Customer not found.");
      }

      const existing = await customerRepository.getByName(input.name);

      if (existing && existing.id !== input.customerId) {
        throw new Error("A customer with this name already exists.");
      }

      // Normalize invoice identity fields: empty -> undefined (cleared), but preserve business data when switching consumer->business via explicit null handling
      // Per spec #9: Business → Consumer must NOT destroy existing Business legal data unless explicitly cleared.
      // Therefore, if invoiceCustomerType is consumer and no new business values provided, we preserve existing stored values.
      // We achieve this by only overwriting business fields when they are explicitly provided (including empty string to clear) — undefined means keep existing.
      const existingCustomer: any = customer;
      const shouldPreserveBusinessData = input.invoiceCustomerType === "consumer" && existingCustomer.invoiceCustomerType === "business";
      // Build changes: include invoice fields, using undefined for keep? But our BaseRepository $set will only update provided keys, so undefined -> still included? We use null for explicit clear, but undefined means omitted via JSON -> preserve old.
      // To preserve when switching Business->Consumer without explicit clear, we must NOT send undefined/null for business fields if they were previously present and input didn't explicitly clear.
      // Simpler: For Business->Consumer, if input business fields are undefined, keep existing values (do not overwrite).
      // For normal Business edit, empty string => clear (null/undefined)
      const buildField = (key: string, inputVal: string | undefined, existingVal: string | undefined) => {
        if (inputVal === undefined) {
          // Not provided -> preserve existing when switching to consumer, otherwise leave undefined (no change? but we need to decide)
          if (shouldPreserveBusinessData) return existingVal;
          return undefined;
        }
        const trimmed = inputVal.trim();
        if (trimmed === "") {
          // Explicit empty => for Business->Consumer preserve to avoid data loss, otherwise clear
          if (shouldPreserveBusinessData) return existingVal;
          return null;
        }
        return trimmed;
      };
      const changes: any = {
        name: input.name,
        phone: input.phone,
        address: input.address?.trim() ? input.address.trim() : null,
        identificationNumber: input.identificationNumber?.trim() ? input.identificationNumber.trim() : null,
        email: input.email?.trim() ? input.email.trim() : null,
        notes: input.notes?.trim() ? input.notes.trim() : null,
        type: input.type,
        invoiceCustomerType: input.invoiceCustomerType || existingCustomer.invoiceCustomerType || "consumer",
        legalName: buildField("legalName", input.legalName, existingCustomer.legalName),
        commercialName: buildField("commercialName", input.commercialName, existingCustomer.commercialName),
        legalForm: buildField("legalForm", input.legalForm, existingCustomer.legalForm),
        activity: buildField("activity", input.activity, existingCustomer.activity),
        billingAddress: buildField("billingAddress", input.billingAddress, existingCustomer.billingAddress),
        rc: buildField("rc", input.rc, existingCustomer.rc),
        nif: buildField("nif", input.nif, existingCustomer.nif),
        nis: buildField("nis", input.nis, existingCustomer.nis),
        updatedAt: Date.now(),
        syncStatus: "pending",
      };
      // Remove keys that are undefined to preserve existing (not send in $set)
      Object.keys(changes).forEach((k) => {
        if (changes[k] === undefined) delete changes[k];
      });
      // Convert null -> will be sent as null and $set to null on server (clears). Alternatively we could use $unset but null is compatible with model (optional field)
      await customerRepository.update(input.customerId, changes);

      return db.customers.get(input.customerId);
    });
  }
}

export const customerEditOperation = new CustomerEditOperation();
