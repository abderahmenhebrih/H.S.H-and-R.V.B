export class BaseService {
  protected assertValidId(id: string, entityName: string): void {
    if (!id.trim()) {
      throw new Error(`${entityName} id is required.`);
    }
  }
}
