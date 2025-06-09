import mongoose from 'mongoose';
import config from './environment';
import logger from './logger';

/**
 * Connect to MongoDB
 * @returns Mongoose connection
 */
export const connectToDatabase = async (): Promise<typeof mongoose> => {
  try {
    // Configure Mongoose options
    const options: mongoose.ConnectOptions = {
      autoIndex: config.nodeEnv !== 'production', // Don't build indexes in production
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5, // Maintain at least 5 socket connections
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      heartbeatFrequencyMS: 10000, // Check connection every 10 seconds
    };

    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri, options);

    // Log connection events
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connection established');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.info('MongoDB connection disconnected');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed due to app termination');
      process.exit(0);
    });

    return mongoose;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectFromDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    throw error;
  }
};

/**
 * Check database connection
 * @returns Connection status
 */
export const checkDatabaseConnection = (): boolean => {
  return mongoose.connection.readyState === 1;
};
