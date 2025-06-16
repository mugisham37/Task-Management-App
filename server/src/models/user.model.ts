import mongoose, { type Document, Schema, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import validator from 'validator';
import jwt from 'jsonwebtoken';
import config from '../config/environment';

// User roles enum
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

// User document interface
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isEmailVerified: boolean;
  verificationToken?: string;
  verificationTokenExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  refreshToken?: string;
  lastLoginAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// User methods interface
export interface IUserMethods {
  comparePassword(password: string): Promise<boolean>;
  createPasswordResetToken(): string;
  createEmailVerificationToken(): string;
  generateAuthToken(): string;
  generateRefreshToken(): string;
}

// User model interface
export interface IUserModel extends Model<IUser, Record<string, never>, IUserMethods> {
  findByEmail(email: string): Promise<IUser | null>;
}

// Combined document interface with methods
export interface IUserDocument extends IUser, IUserMethods {}

// User schema
const userSchema = new Schema<IUser, IUserModel, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name cannot be more than 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: validator.isEmail,
        message: 'Invalid email address',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Don't include password in queries by default
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    refreshToken: {
      type: String,
      select: false, // Don't include refreshToken in queries by default
    },
    lastLoginAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ lastLoginAt: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ verificationToken: 1 }, { sparse: true });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });

// Pre-save middleware to hash password
userSchema.pre<IUser>('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(10);
    // Hash the password with the salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: unknown) {
    // Pass the error to the next middleware
    next(error instanceof Error ? error : new Error('Password hashing failed'));
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function (): string {
  // Generate random token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Set token expiry (10 minutes)
  this.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);

  return resetToken;
};

// Method to create email verification token
userSchema.methods.createEmailVerificationToken = function (): string {
  // Generate random token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Hash token and set to verificationToken field
  this.verificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

  // Set token expiry (24 hours)
  this.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return verificationToken;
};

// Method to generate JWT auth token
userSchema.methods.generateAuthToken = function (): string {
  return jwt.sign({ id: this._id, role: this.role }, config.jwtSecret, {
    expiresIn: '15m',
  });
};

// Method to generate refresh token
userSchema.methods.generateRefreshToken = function (): string {
  const refreshToken = jwt.sign({ id: this._id, role: this.role }, config.jwtSecret, {
    expiresIn: '7d',
  });
  // Store refresh token in the user document
  this.refreshToken = refreshToken;
  return refreshToken;
};

// Static method to find user by email
userSchema.static('findByEmail', async function (email: string): Promise<IUser | null> {
  return this.findOne({ email });
});

// Create and export User model
const User = mongoose.model<IUser, IUserModel>('User', userSchema);

export default User;
