import { env } from '../config/env';

/**
 * Supabase Storage client
 * Proxies requests to supabase-storage.railway.internal
 */

interface StorageRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  token?: string; // User JWT token
  useServiceRole?: boolean;
}

async function storageRequest(
  endpoint: string,
  options: StorageRequestOptions = {}
): Promise<Response> {
  const url = `${env.STORAGE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'apikey': env.SUPABASE_SERVICE_KEY,
    ...options.headers,
  };

  // Add authorization header
  if (options.useServiceRole) {
    headers['Authorization'] = `Bearer ${env.SUPABASE_SERVICE_KEY}`;
  } else if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    });

    return response;
  } catch (error) {
    throw new Error(
      `Storage API request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Upload a file to storage
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
  token: string
) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await storageRequest(`/object/${bucket}/${path}`, {
    method: 'POST',
    token,
    headers: {
      // Don't set Content-Type - let fetch set it with boundary for multipart
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Upload failed');
  }

  return await response.json();
}

/**
 * Download a file from storage
 */
export async function downloadFile(bucket: string, path: string, token: string) {
  const response = await storageRequest(`/object/${bucket}/${path}`, {
    method: 'GET',
    token,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Download failed');
  }

  return response;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(bucket: string, path: string, token: string) {
  const response = await storageRequest(`/object/${bucket}/${path}`, {
    method: 'DELETE',
    token,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Delete failed');
  }

  return { success: true };
}

/**
 * List files in a bucket
 */
export async function listFiles(
  bucket: string,
  token: string,
  options?: { prefix?: string; limit?: number; offset?: number }
) {
  const queryParams = new URLSearchParams();
  if (options?.prefix) queryParams.set('prefix', options.prefix);
  if (options?.limit) queryParams.set('limit', options.limit.toString());
  if (options?.offset) queryParams.set('offset', options.offset.toString());

  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const response = await storageRequest(`/object/list/${bucket}${query}`, {
    method: 'GET',
    token,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'List files failed');
  }

  return await response.json();
}

/**
 * Create a storage bucket
 */
export async function createBucket(
  name: string,
  options?: { public?: boolean }
) {
  const response = await storageRequest(`/bucket`, {
    method: 'POST',
    useServiceRole: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      public: options?.public || false,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Create bucket failed');
  }

  return await response.json();
}

/**
 * List all buckets
 */
export async function listBuckets() {
  const response = await storageRequest(`/bucket`, {
    method: 'GET',
    useServiceRole: true,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'List buckets failed');
  }

  return await response.json();
}

/**
 * Check Storage service health
 */
export async function checkHealth() {
  try {
    const startTime = Date.now();
    const response = await storageRequest('/status');
    const latency = Date.now() - startTime;

    return {
      connected: response.ok,
      latency,
    };
  } catch (error) {
    return {
      connected: false,
      latency: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
