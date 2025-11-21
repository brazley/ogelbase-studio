import {
  MongoClient,
  Db,
  Collection,
  Document,
  Filter,
  UpdateFilter,
  FindOptions,
  InsertOneResult,
  UpdateResult,
  DeleteResult,
  BulkWriteResult,
  AggregateOptions,
  CountDocumentsOptions,
  FindOneAndUpdateOptions,
  FindOneAndDeleteOptions,
  InsertManyResult,
} from 'mongodb'
import {
  DatabaseConnectionManager,
  DatabaseType,
  Tier,
  ConnectionPool,
  ConnectionOptions,
} from './connection-manager'

/**
 * MongoDB connection pool implementation
 */
export class MongoDBConnectionPool implements ConnectionPool<MongoClient> {
  private client: MongoClient | null = null
  private connectionString: string
  private config: { min?: number; max?: number }

  constructor(connectionString: string, config: { min?: number; max?: number } = {}) {
    this.connectionString = connectionString
    this.config = config
  }

  /**
   * Initialize MongoDB client with connection pooling
   */
  private async getClient(): Promise<MongoClient> {
    if (this.client) {
      try {
        // Try to ping to check if connection is alive
        await this.client.db('admin').admin().ping()
        return this.client
      } catch (error) {
        // Connection is dead, recreate it
        this.client = null
      }
    }

    this.client = new MongoClient(this.connectionString, {
      minPoolSize: this.config.min || 2,
      maxPoolSize: this.config.max || 10,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
    })

    await this.client.connect()
    return this.client
  }

  async acquire(): Promise<MongoClient> {
    return this.getClient()
  }

  release(connection: MongoClient): void {
    // MongoDB driver handles connection pooling internally
    // No need to manually release connections
  }

  async destroy(connection: MongoClient): Promise<void> {
    // MongoDB driver handles connection lifecycle
    // Manual destroy not needed for individual connections
  }

  async drain(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
  }

  get size(): number {
    // MongoDB doesn't expose pool size in the same way
    // Return configured max as approximation
    return this.config.max || 10
  }

  get available(): number {
    // MongoDB doesn't expose available connections
    // Return configured max as approximation
    return this.config.max || 10
  }

  get pending(): number {
    // MongoDB doesn't expose pending connections
    return 0
  }
}

/**
 * MongoDB client with circuit breaker protection
 */
export class MongoDBClientWrapper {
  private connectionManager: DatabaseConnectionManager
  private projectId: string
  private tier: Tier
  private pool: MongoDBConnectionPool
  private databaseName: string

  constructor(
    projectId: string,
    options: ConnectionOptions,
    connectionManager?: DatabaseConnectionManager
  ) {
    this.projectId = projectId
    this.tier = options.tier || Tier.FREE
    this.connectionManager =
      connectionManager ||
      (require('./connection-manager').connectionManager as DatabaseConnectionManager)

    // Parse database name from connection string
    this.databaseName = this.parseDatabaseName(options.connectionString)

    // Create MongoDB pool
    this.pool = new MongoDBConnectionPool(options.connectionString, {
      min: options.config?.minPoolSize || 2,
      max: options.config?.maxPoolSize || 10,
    })
  }

  /**
   * Parse database name from connection string
   */
  private parseDatabaseName(connectionString: string): string {
    try {
      const url = new URL(connectionString)
      const dbName = url.pathname.slice(1).split('?')[0]
      return dbName || 'test'
    } catch (error) {
      return 'test'
    }
  }

  /**
   * Execute MongoDB operation with circuit breaker protection
   */
  private async execute<T>(operation: string, action: (db: Db) => Promise<T>): Promise<T> {
    return this.connectionManager.executeWithCircuitBreaker(
      this.projectId,
      DatabaseType.MONGODB,
      this.tier,
      operation,
      async () => {
        const client = await this.pool.acquire()
        try {
          const db = client.db(this.databaseName)
          return await action(db)
        } finally {
          this.pool.release(client)
        }
      }
    )
  }

  /**
   * Get collection
   */
  private getCollection<T extends Document = Document>(
    db: Db,
    collectionName: string
  ): Collection<T> {
    return db.collection<T>(collectionName)
  }

  /**
   * Ping MongoDB server
   */
  async ping(): Promise<boolean> {
    return this.execute('ping', async (db) => {
      await db.admin().ping()
      return true
    })
  }

  /**
   * Find documents
   */
  async find<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T> = {},
    options?: FindOptions
  ): Promise<T[]> {
    return this.execute('find', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.find(filter, options).toArray() as Promise<T[]>
    })
  }

  /**
   * Find one document
   */
  async findOne<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>,
    options?: FindOptions
  ): Promise<T | null> {
    return this.execute('findOne', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.findOne(filter, options) as Promise<T | null>
    })
  }

  /**
   * Insert one document
   */
  async insertOne<T extends Document = Document>(
    collectionName: string,
    document: T
  ): Promise<InsertOneResult<T>> {
    return this.execute('insertOne', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.insertOne(document as any)
    })
  }

  /**
   * Insert multiple documents
   */
  async insertMany<T extends Document = Document>(
    collectionName: string,
    documents: T[]
  ): Promise<InsertManyResult<T>> {
    return this.execute('insertMany', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.insertMany(documents as any[])
    })
  }

  /**
   * Update one document
   */
  async updateOne<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>,
    update: UpdateFilter<T>
  ): Promise<UpdateResult<T>> {
    return this.execute('updateOne', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.updateOne(filter, update)
    })
  }

  /**
   * Update multiple documents
   */
  async updateMany<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>,
    update: UpdateFilter<T>
  ): Promise<UpdateResult<T>> {
    return this.execute('updateMany', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.updateMany(filter, update)
    })
  }

  /**
   * Delete one document
   */
  async deleteOne<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>
  ): Promise<DeleteResult> {
    return this.execute('deleteOne', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.deleteOne(filter)
    })
  }

  /**
   * Delete multiple documents
   */
  async deleteMany<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>
  ): Promise<DeleteResult> {
    return this.execute('deleteMany', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.deleteMany(filter)
    })
  }

  /**
   * Count documents
   */
  async countDocuments<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T> = {},
    options?: CountDocumentsOptions
  ): Promise<number> {
    return this.execute('countDocuments', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.countDocuments(filter, options)
    })
  }

  /**
   * Find and update one document
   */
  async findOneAndUpdate<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: FindOneAndUpdateOptions
  ): Promise<T | null> {
    return this.execute('findOneAndUpdate', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      const result = await collection.findOneAndUpdate(filter, update, {
        ...options,
        includeResultMetadata: false
      } as any)
      return (result as any) || null
    })
  }

  /**
   * Find and delete one document
   */
  async findOneAndDelete<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>,
    options?: FindOneAndDeleteOptions
  ): Promise<T | null> {
    return this.execute('findOneAndDelete', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      const result = await collection.findOneAndDelete(filter, {
        ...options,
        includeResultMetadata: false
      } as any)
      return (result as any) || null
    })
  }

  /**
   * Aggregate documents
   */
  async aggregate<T extends Document = Document>(
    collectionName: string,
    pipeline: Document[],
    options?: AggregateOptions
  ): Promise<T[]> {
    return this.execute('aggregate', async (db) => {
      const collection = this.getCollection(db, collectionName)
      return collection.aggregate<T>(pipeline, options).toArray()
    })
  }

  /**
   * Create index
   */
  async createIndex<T extends Document = Document>(
    collectionName: string,
    indexSpec: Record<string, 1 | -1 | 'text'>,
    options?: { unique?: boolean; sparse?: boolean; name?: string }
  ): Promise<string> {
    return this.execute('createIndex', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.createIndex(indexSpec, options)
    })
  }

  /**
   * Drop index
   */
  async dropIndex<T extends Document = Document>(
    collectionName: string,
    indexName: string
  ): Promise<Document> {
    return this.execute('dropIndex', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.dropIndex(indexName)
    })
  }

  /**
   * List indexes
   */
  async listIndexes<T extends Document = Document>(collectionName: string): Promise<Document[]> {
    return this.execute('listIndexes', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.listIndexes().toArray()
    })
  }

  /**
   * Create collection
   */
  async createCollection(
    collectionName: string,
    options?: { capped?: boolean; size?: number; max?: number }
  ): Promise<Collection> {
    return this.execute('createCollection', async (db) => {
      return db.createCollection(collectionName, options)
    })
  }

  /**
   * Drop collection
   */
  async dropCollection(collectionName: string): Promise<boolean> {
    return this.execute('dropCollection', async (db) => {
      return db.dropCollection(collectionName)
    })
  }

  /**
   * List collections
   */
  async listCollections(): Promise<Document[]> {
    return this.execute('listCollections', async (db) => {
      return db.listCollections().toArray()
    })
  }

  /**
   * Replace one document
   */
  async replaceOne<T extends Document = Document>(
    collectionName: string,
    filter: Filter<T>,
    replacement: T,
    options?: { upsert?: boolean }
  ): Promise<UpdateResult<T>> {
    return this.execute('replaceOne', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.replaceOne(filter, replacement, options)
    })
  }

  /**
   * Bulk write operations
   */
  async bulkWrite<T extends Document = Document>(
    collectionName: string,
    operations: any[]
  ): Promise<BulkWriteResult> {
    return this.execute('bulkWrite', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.bulkWrite(operations)
    })
  }

  /**
   * Distinct values
   */
  async distinct<T extends Document = Document>(
    collectionName: string,
    field: string,
    filter: Filter<T> = {}
  ): Promise<any[]> {
    return this.execute('distinct', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.distinct(field, filter)
    })
  }

  /**
   * Estimated document count (fast but approximate)
   */
  async estimatedDocumentCount<T extends Document = Document>(
    collectionName: string
  ): Promise<number> {
    return this.execute('estimatedDocumentCount', async (db) => {
      const collection = this.getCollection<T>(db, collectionName)
      return collection.estimatedDocumentCount()
    })
  }

  /**
   * Get database statistics
   */
  async stats(): Promise<Document> {
    return this.execute('stats', async (db) => {
      return db.stats()
    })
  }

  /**
   * Run database command
   */
  async runCommand(command: Document): Promise<Document> {
    return this.execute('runCommand', async (db) => {
      return db.command(command)
    })
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.drain()
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { size: number; available: number; pending: number } {
    return {
      size: this.pool.size,
      available: this.pool.available,
      pending: this.pool.pending,
    }
  }

  /**
   * Check connection health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ping()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get database name
   */
  getDatabaseName(): string {
    return this.databaseName
  }
}

/**
 * Create MongoDB client
 */
export function createMongoDBClient(
  projectId: string,
  options: ConnectionOptions,
  connectionManager?: DatabaseConnectionManager
): MongoDBClientWrapper {
  return new MongoDBClientWrapper(projectId, options, connectionManager)
}
