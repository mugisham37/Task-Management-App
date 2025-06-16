import { Query } from 'mongoose';

/**
 * API Features class for handling filtering, sorting, field limiting, and pagination
 */
export class APIFeatures<T> {
  private query: Query<T[], T>;
  private queryString: Record<string, any>;

  /**
   * Create an APIFeatures instance
   * @param query Mongoose query
   * @param queryString Query parameters from request
   */
  constructor(query: Query<T[], T>, queryString: Record<string, any>) {
    this.query = query;
    this.queryString = { ...queryString };
  }

  /**
   * Filter the query based on query parameters
   * @returns APIFeatures instance for chaining
   */
  filter(): APIFeatures<T> {
    // Create a copy of the query string
    const queryObj = { ...this.queryString };

    // Fields to exclude from filtering
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search', 'q'];
    excludedFields.forEach((field) => delete queryObj[field]);

    // Advanced filtering for operators like gt, gte, lt, lte
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  /**
   * Add search functionality to the query
   * @param fields Fields to search in
   * @returns APIFeatures instance for chaining
   */
  search(fields: string[]): APIFeatures<T> {
    const searchTerm = this.queryString.search || this.queryString.q;

    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      const searchQuery = fields.map((field) => ({ [field]: searchRegex }));
      this.query = this.query.find({ $or: searchQuery });
    }

    return this;
  }

  /**
   * Sort the query results
   * @param defaultSort Default sort string (e.g., '-createdAt')
   * @returns APIFeatures instance for chaining
   */
  sort(defaultSort = '-createdAt'): APIFeatures<T> {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort(defaultSort);
    }

    return this;
  }

  /**
   * Limit the fields returned in the query results
   * @returns APIFeatures instance for chaining
   */
  limitFields(): APIFeatures<T> {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }

    return this;
  }

  /**
   * Add pagination to the query
   * @returns APIFeatures instance for chaining
   */
  paginate(): APIFeatures<T> {
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 10;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);

    return this;
  }

  /**
   * Execute the query and return results with pagination metadata
   * @returns Query results with pagination metadata
   */
  async execute(): Promise<{
    data: T[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    // Get the total count for pagination
    const countQuery = this.query.model.find(this.query.getFilter());
    const total = await countQuery.countDocuments();

    // Execute the query
    const data = await this.query;

    // Calculate pagination metadata
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 10;
    const pages = Math.ceil(total / limit) || 1;

    return {
      data,
      total,
      page,
      limit,
      pages,
    };
  }
}
