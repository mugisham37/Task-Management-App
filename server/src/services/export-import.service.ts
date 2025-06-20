import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Parser } from 'json2csv';
import type mongoose from 'mongoose';
import * as models from '../models';
import logger from '../config/logger';
import config from '../config/environment';
import { BadRequestError, NotFoundError } from '../utils/app-error';

// Define export formats
type ExportFormat = 'csv' | 'json';

// Define model mapping
const modelMapping: Record<string, mongoose.Model<any>> = {
  users: models.User,
  tasks: models.Task,
  projects: models.Project,
  teams: models.Team,
  workspaces: models.Workspace,
  comments: models.Comment,
  notifications: models.Notification,
  activities: models.Activity,
  invitations: models.Invitation,
  recurringTasks: models.RecurringTask,
  taskTemplates: models.TaskTemplate,
  calendarEvents: models.CalendarEvent,
  feedback: models.Feedback,
};

/**
 * Export data to file
 * @param modelName Model name
 * @param format Export format
 * @param query Query to filter data
 * @param userId User ID
 * @returns File path
 */
export const exportData = async (
  modelName: string,
  format: ExportFormat,
  query: any = {},
  userId: string,
): Promise<string> => {
  try {
    // Check if model exists
    const Model = modelMapping[modelName];
    if (!Model) {
      throw new NotFoundError(`Model ${modelName} not found`);
    }

    // Create export directory if it doesn't exist
    const exportDir = path.join(config.uploadDir, 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    // Generate file name
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const fileName = `${modelName}_${timestamp}_${userId}.${format}`;
    const filePath = path.join(exportDir, fileName);

    // Get data
    const data = await Model.find(query).lean();

    // Export data based on format
    if (format === 'csv') {
      // Convert data to CSV
      const fields = Object.keys(data[0] || {});
      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(data);

      // Write CSV to file
      fs.writeFileSync(filePath, csv);
    } else if (format === 'json') {
      // Write JSON to file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } else {
      throw new BadRequestError(`Unsupported format: ${format}`);
    }

    return filePath;
  } catch (error) {
    logger.error(`Error exporting ${modelName} data:`, error);
    throw error;
  }
};

/**
 * Import data from file
 * @param modelName Model name
 * @param filePath File path
 * @param options Import options
 * @returns Import result
 */
export const importData = async (
  modelName: string,
  filePath: string,
  options: {
    mode: 'insert' | 'update' | 'upsert';
    identifierField?: string;
  } = { mode: 'insert' },
): Promise<{ inserted: number; updated: number; errors: any[] }> => {
  try {
    // Check if model exists
    const Model = modelMapping[modelName];
    if (!Model) {
      throw new NotFoundError(`Model ${modelName} not found`);
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(`File not found: ${filePath}`);
    }

    // Get file extension
    const fileExt = path.extname(filePath).toLowerCase();

    // Parse file based on extension
    let data: any[] = [];
    if (fileExt === '.csv') {
      // Parse CSV file
      data = await new Promise((resolve, reject) => {
        const results: any[] = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data: any) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', (error: any) => reject(error));
      });
    } else if (fileExt === '.json') {
      // Parse JSON file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(fileContent);
    } else {
      throw new BadRequestError(`Unsupported file extension: ${fileExt}`);
    }

    // Import data based on mode
    const result = {
      inserted: 0,
      updated: 0,
      errors: [] as any[],
    };

    if (options.mode === 'insert') {
      // Insert data
      try {
        const inserted = await Model.insertMany(data, { ordered: false });
        result.inserted = inserted.length;
      } catch (error: any) {
        if (error.writeErrors) {
          result.inserted = error.insertedDocs?.length || 0;
          result.errors = error.writeErrors;
        } else {
          throw error;
        }
      }
    } else if (options.mode === 'update' || options.mode === 'upsert') {
      // Update or upsert data
      const identifierField = options.identifierField || '_id';
      const bulkOps = data.map((item) => {
        const filter = { [identifierField]: item[identifierField] };
        const update = { $set: item };
        return {
          updateOne: {
            filter,
            update,
            upsert: options.mode === 'upsert',
          },
        };
      });

      if (bulkOps.length > 0) {
        const bulkResult = await Model.bulkWrite(bulkOps);
        result.inserted = bulkResult.upsertedCount || 0;
        result.updated = bulkResult.modifiedCount || 0;
      }
    } else {
      throw new BadRequestError(`Unsupported import mode: ${options.mode}`);
    }

    return result;
  } catch (error) {
    logger.error(`Error importing ${modelName} data:`, error);
    throw error;
  }
};

/**
 * Get available models for export/import
 * @returns List of available models
 */
export const getAvailableModels = (): string[] => {
  return Object.keys(modelMapping);
};

/**
 * Clean up old export files
 * @param maxAge Maximum age in milliseconds
 * @returns Number of files deleted
 */
export const cleanupExportFiles = async (
  maxAge: number = 7 * 24 * 60 * 60 * 1000,
): Promise<number> => {
  try {
    // Get export directory
    const exportDir = path.join(config.uploadDir, 'exports');
    if (!fs.existsSync(exportDir)) {
      return 0;
    }

    // Get all files in export directory
    const files = fs.readdirSync(exportDir);
    let deletedCount = 0;

    // Delete old files
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(exportDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;

      if (fileAge > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    return deletedCount;
  } catch (error) {
    logger.error('Error cleaning up export files:', error);
    throw error;
  }
};
