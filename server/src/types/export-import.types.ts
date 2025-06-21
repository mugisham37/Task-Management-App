import type mongoose from 'mongoose';

// Base document interface for all MongoDB documents
export interface BaseDocument {
  _id?: string | mongoose.Types.ObjectId | unknown;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

// Export formats
export type ExportFormat = 'csv' | 'json';

// Import modes
export type ImportMode = 'insert' | 'update' | 'upsert';

// Import options interface
export interface ImportOptions {
  mode: ImportMode;
  identifierField?: string;
}

// Import result interface
export interface ImportResult {
  inserted: number;
  updated: number;
  errors: mongoose.Error[];
}

// Bulk write error interface
export interface BulkWriteError extends Error {
  writeErrors?: mongoose.Error[];
  insertedDocs?: BaseDocument[];
}

// CSV row data interface
export interface CSVRowData {
  [key: string]: string | number | boolean | null | undefined;
}

// Model mapping type
export type ModelMapping = Record<string, mongoose.Model<any>>;
