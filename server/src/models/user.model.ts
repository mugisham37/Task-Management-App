import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import config from '../config/environment';
import { JWTExpiresIn } from '../types/jwt.types';

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  isEmailVerified: boolean;
  avatar?: string;
  bio?: string;
  lastLogin?: Date;
  refreshToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
}

export interface IUserDocument extends IUser, Document {
  comparePassword(password: string): Promise<boolean>;
  generateAuthToken(): string;
  generateRefreshToken(): string;
}

const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Don't include password in query results by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: [200, 'Bio cannot exceed 200 characters'],
    },
    lastLogin: {
      type: Date,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(10);
    // Hash the password along with the new salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: unknown) {
    next(error instanceof Error ? error : new Error('Password hashing failed'));
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function (): string {
  const payload = { id: this._id, role: this.role };
  const options: SignOptions = {
    expiresIn: config.jwtAccessExpiration as JWTExpiresIn,
  };
  return jwt.sign(payload, config.jwtSecret as Secret, options);
};

// Generate refresh token
userSchema.methods.generateRefreshToken = function (): string {
  const payload = { id: this._id };
  const options: SignOptions = {
    expiresIn: config.jwtRefreshExpiration as JWTExpiresIn,
  };
  const refreshToken = jwt.sign(payload, config.jwtSecret as Secret, options);

  // Save refresh token to user
  this.refreshToken = refreshToken;
  return refreshToken;
};

// Create and export the User model
const User = mongoose.model<IUserDocument>('User', userSchema);

export default User;
