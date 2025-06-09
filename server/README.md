# Task Management API

A comprehensive task management backend API built with Node.js, Express, TypeScript, and MongoDB.

## Features

- **User Management**: Authentication, authorization, and user profiles
- **Task Management**: Create, read, update, delete tasks with advanced filtering
- **Project Management**: Organize tasks into projects
- **Team Collaboration**: Share projects and tasks with team members
- **Workspaces**: Separate work environments for different contexts
- **Comments**: Discuss tasks with team members
- **Notifications**: Real-time notifications for task updates
- **Analytics**: Track productivity and project progress
- **Internationalization**: Support for multiple languages
- **API Documentation**: Comprehensive Swagger documentation

## Tech Stack

- **Node.js**: JavaScript runtime
- **Express**: Web framework
- **TypeScript**: Type-safe JavaScript
- **MongoDB**: NoSQL database
- **Mongoose**: MongoDB object modeling
- **JWT**: Authentication
- **Winston**: Logging
- **Jest**: Testing
- **Swagger**: API documentation
- **i18next**: Internationalization
- **ESLint & Prettier**: Code quality
- **Husky & lint-staged**: Git hooks

## Project Structure

```
task-management-api/
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Express middleware
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── utils/          # Utility functions
│   ├── validations/    # Request validation schemas
│   ├── types/          # TypeScript type definitions
│   ├── jobs/           # Scheduled jobs
│   ├── locales/        # Internationalization files
│   ├── app.ts          # Express app setup
│   └── server.ts       # Server entry point
├── tests/
│   ├── integration/    # Integration tests
│   └── unit/           # Unit tests
├── .env                # Environment variables
├── .env.example        # Example environment variables
├── .eslintrc.js        # ESLint configuration
├── .prettierrc         # Prettier configuration
├── jest.config.js      # Jest configuration
├── nodemon.json        # Nodemon configuration
├── package.json        # Dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4 or higher)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/task-management-api.git
   cd task-management-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   npm start
   ```

### API Documentation

Once the server is running, you can access the Swagger documentation at:
```
http://localhost:3000/api-docs
```

## Testing

Run tests:
```bash
npm test
```

Run integration tests:
```bash
npm run test:integration
```

## Code Quality

Run linting:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

Format code:
```bash
npm run format
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
