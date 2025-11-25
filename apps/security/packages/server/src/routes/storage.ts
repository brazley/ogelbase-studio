import type { Ogelfy } from '../../packages/ogelfy/src/index';
import { extractToken } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { logRequest } from '../middleware/logging';
import * as storage from '../clients/storage';

/**
 * Storage routes
 * Proxies to Supabase Storage service
 */

export function registerStorageRoutes(app: Ogelfy) {
  /**
   * POST /api/storage/upload/:bucket/*
   * Upload a file to storage
   */
  app.post('/api/storage/upload/:bucket/*', async (req, context) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(50, 60000)(req); // 50 uploads per minute

      const token = extractToken(req);
      if (!token) {
        throw new Error('Unauthorized: Token required');
      }

      const bucket = context?.params?.bucket;
      if (!bucket) {
        throw new Error('Bucket name required');
      }

      // Get the rest of the path after bucket
      const url = new URL(req.url);
      const pathMatch = url.pathname.match(/^\/api\/storage\/upload\/[^/]+\/(.+)$/);
      const path = pathMatch ? pathMatch[1] : '';

      if (!path) {
        throw new Error('File path required');
      }

      // Parse multipart form data
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        throw new Error('File required');
      }

      const result = await storage.uploadFile(bucket, path, file, token);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('required') ? 400 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Upload failed');
    }
  });

  /**
   * GET /api/storage/download/:bucket/*
   * Download a file from storage
   */
  app.get('/api/storage/download/:bucket/*', async (req, context) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(100, 60000)(req); // 100 downloads per minute

      const token = extractToken(req);
      if (!token) {
        throw new Error('Unauthorized: Token required');
      }

      const bucket = context?.params?.bucket;
      if (!bucket) {
        throw new Error('Bucket name required');
      }

      // Get the rest of the path after bucket
      const url = new URL(req.url);
      const pathMatch = url.pathname.match(/^\/api\/storage\/download\/[^/]+\/(.+)$/);
      const path = pathMatch ? pathMatch[1] : '';

      if (!path) {
        throw new Error('File path required');
      }

      const response = await storage.downloadFile(bucket, path, token);

      logRequest(req, 200, Date.now() - start);

      // Return the response directly (stream the file)
      return response;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('required') ? 400 :
        error instanceof Error && error.message.includes('not found') ? 404 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Download failed');
    }
  });

  /**
   * DELETE /api/storage/delete/:bucket/*
   * Delete a file from storage
   */
  app.delete('/api/storage/delete/:bucket/*', async (req, context) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(50, 60000)(req); // 50 deletions per minute

      const token = extractToken(req);
      if (!token) {
        throw new Error('Unauthorized: Token required');
      }

      const bucket = context?.params?.bucket;
      if (!bucket) {
        throw new Error('Bucket name required');
      }

      // Get the rest of the path after bucket
      const url = new URL(req.url);
      const pathMatch = url.pathname.match(/^\/api\/storage\/delete\/[^/]+\/(.+)$/);
      const path = pathMatch ? pathMatch[1] : '';

      if (!path) {
        throw new Error('File path required');
      }

      const result = await storage.deleteFile(bucket, path, token);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('required') ? 400 :
        error instanceof Error && error.message.includes('not found') ? 404 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Delete failed');
    }
  });

  /**
   * GET /api/storage/list/:bucket
   * List files in a bucket
   */
  app.get('/api/storage/list/:bucket', async (req, context) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(100, 60000)(req); // 100 requests per minute

      const token = extractToken(req);
      if (!token) {
        throw new Error('Unauthorized: Token required');
      }

      const bucket = context?.params?.bucket;
      if (!bucket) {
        throw new Error('Bucket name required');
      }

      const url = new URL(req.url);
      const prefix = url.searchParams.get('prefix') || undefined;
      const limit = url.searchParams.get('limit');
      const offset = url.searchParams.get('offset');

      const result = await storage.listFiles(bucket, token, {
        prefix,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('required') ? 400 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'List files failed');
    }
  });

  /**
   * GET /api/storage/buckets
   * List all buckets
   */
  app.get('/api/storage/buckets', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(50, 60000)(req); // 50 requests per minute

      const token = extractToken(req);
      if (!token) {
        throw new Error('Unauthorized: Token required');
      }

      const result = await storage.listBuckets();

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'List buckets failed');
    }
  });
}
