import { SentMessageInfo } from 'nodemailer';

/**
 * Email service response type
 * Extends the SentMessageInfo from nodemailer
 */
export type EmailResponse = SentMessageInfo;

/**
 * Email context type for templates
 * Defines the structure for template context data
 */
export interface EmailTemplateContext {
  [key: string]: string | number | boolean | Date | null | undefined | EmailTemplateContext;
}
