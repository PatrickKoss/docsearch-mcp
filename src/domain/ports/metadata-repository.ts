export interface MetadataRepository {
  getValue(key: string): Promise<string | null>;
  setValue(key: string, value: string): Promise<void>;
}
