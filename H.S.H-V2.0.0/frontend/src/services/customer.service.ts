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
    const existing = await customerRepository.getByName(input.name);

    if (existing) {
      throw new Error("A customer with this name already exists.");
    }

    const now = Date.now();

    const customer: Customer = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: input.name,
      phone: input.phone,
      address: input.address,
      identificationNumber: input.identificationNumber,
      email: input.email,
      notes: input.notes,
      type: input.type,
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
