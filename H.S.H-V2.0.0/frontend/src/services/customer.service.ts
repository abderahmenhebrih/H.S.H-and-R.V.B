import { generateId } from "../lib/id";
import { customerRepository } from "../repositories/customer.repository";
import type { Customer } from "../types/entities/customer";
import { BaseService } from "./base.service";

export class CustomerService extends BaseService {
  async create(input: {
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
  }): Promise<Customer> {
    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      throw new Error("Customer name is required.");
    }
    const trimmedPhone = input.phone?.trim();
    if (!trimmedPhone) {
      throw new Error("Customer phone is required.");
    }
    // Preserve raw value (+, spaces, dashes allowed) — do not strip silently
    if (!/^\+?[0-9\s\-]+$/.test(trimmedPhone)) {
      throw new Error("Invalid phone number. Phone may contain +, digits, spaces and dashes only.");
    }
    const trimmedType = input.type?.trim();
    if (!trimmedType) {
      throw new Error("Customer type is required.");
    }

    const existing = await customerRepository.getByName(trimmedName);

    if (existing) {
      throw new Error("A customer with this name already exists.");
    }

    const now = Date.now();

    const customer: Customer = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: trimmedName,
      phone: trimmedPhone,
      address: input.address?.trim() || undefined,
      identificationNumber: input.identificationNumber?.trim() || undefined,
      email: input.email?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      type: trimmedType,
      balance: 0,
      invoiceCustomerType: input.invoiceCustomerType || "consumer",
      legalName: input.legalName?.trim() || undefined,
      commercialName: input.commercialName?.trim() || undefined,
      legalForm: input.legalForm?.trim() || undefined,
      activity: input.activity?.trim() || undefined,
      billingAddress: input.billingAddress?.trim() || undefined,
      rc: input.rc?.trim() || undefined,
      nif: input.nif?.trim() || undefined,
      nis: input.nis?.trim() || undefined,
    };

    await customerRepository.create(customer);

    return customer;
  }

  async getById(id: string): Promise<Customer | undefined> {
    this.assertValidId(id, "Customer");
    return customerRepository.getById(id);
  }

  async getAll(): Promise<Customer[]> {
    return customerRepository.getAll();
  }
}

export const customerService = new CustomerService();
