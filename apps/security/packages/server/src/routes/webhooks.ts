import type { Ogelfy } from '../../packages/ogelfy/src/index';
import { env } from '../config/env';
import { logRequest } from '../middleware/logging';
import { upsertPlatformUser, deletePlatformUser } from '../clients/platform';
import { createHmac } from 'crypto';

/**
 * GoTrue Webhook routes
 * Receives auth events and syncs to platform.users
 */

// GoTrue webhook event types
type WebhookEvent = 'signup' | 'login' | 'validate' | 'user.deleted';

interface GoTrueWebhookPayload {
  event: WebhookEvent;
  instance_id?: string;
  user: {
    id: string;
    aud: string;
    role: string;
    email: string;
    email_confirmed_at?: string;
    phone?: string;
    confirmed_at?: string;
    last_sign_in_at?: string;
    app_metadata: Record<string, any>;
    user_metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
  };
}

/**
 * Verify webhook signature from GoTrue
 * GoTrue signs webhooks with JWT containing SHA256 of payload
 */
function verifyWebhookSignature(
  signature: string | null,
  payload: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    // If no secret configured, skip verification (dev mode)
    return !secret;
  }

  try {
    // GoTrue uses JWT for webhook signatures
    // The JWT contains a sha256 claim with the hash of the payload
    const [header, payloadB64, sig] = signature.split('.');
    if (!header || !payloadB64 || !sig) {
      return false;
    }

    // Verify the JWT signature
    const expectedSig = createHmac('sha256', secret)
      .update(`${header}.${payloadB64}`)
      .digest('base64url');

    if (sig !== expectedSig) {
      return false;
    }

    // Decode and verify the payload hash
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const payloadHash = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // GoTrue puts the sha256 in the claims
    return claims.sha256 === payloadHash;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

export function registerWebhookRoutes(app: Ogelfy) {
  /**
   * POST /webhooks/gotrue
   * Receives auth events from GoTrue
   */
  app.post('/webhooks/gotrue', async (req) => {
    const start = Date.now();

    try {
      const signature = req.headers.get('x-webhook-signature');
      const rawBody = await req.text();

      // Verify signature if secret is configured
      if (env.GOTRUE_WEBHOOK_SECRET) {
        const isValid = verifyWebhookSignature(
          signature,
          rawBody,
          env.GOTRUE_WEBHOOK_SECRET
        );

        if (!isValid) {
          logRequest(req, 401, Date.now() - start);
          throw new Error('Invalid webhook signature');
        }
      }

      const payload: GoTrueWebhookPayload = JSON.parse(rawBody);

      console.log(`[Webhook] Received ${payload.event} event for user ${payload.user.email}`);

      // Handle different event types
      switch (payload.event) {
        case 'signup':
        case 'login':
        case 'validate': {
          // Sync user to platform.users
          const platformUser = await upsertPlatformUser({
            id: payload.user.id,
            email: payload.user.email,
            user_metadata: payload.user.user_metadata,
            app_metadata: payload.user.app_metadata,
            last_sign_in_at: payload.user.last_sign_in_at,
            created_at: payload.user.created_at,
          });

          console.log(`[Webhook] Synced user ${platformUser.email} to platform.users`);

          logRequest(req, 200, Date.now() - start);

          // Can return metadata updates that GoTrue will apply
          return {
            app_metadata: {
              platform_synced: true,
              platform_synced_at: new Date().toISOString(),
            },
          };
        }

        case 'user.deleted': {
          // Remove from platform.users
          const deleted = await deletePlatformUser(payload.user.id);
          console.log(`[Webhook] Deleted user ${payload.user.email} from platform.users: ${deleted}`);

          logRequest(req, 200, Date.now() - start);
          return { success: true };
        }

        default:
          console.log(`[Webhook] Unhandled event type: ${payload.event}`);
          logRequest(req, 200, Date.now() - start);
          return { success: true };
      }
    } catch (error) {
      const status = error instanceof Error && error.message.includes('signature') ? 401 : 500;
      logRequest(req, status, Date.now() - start);
      throw error;
    }
  });

  /**
   * GET /webhooks/health
   * Health check for webhook endpoint
   */
  app.get('/webhooks/health', async (req) => {
    const start = Date.now();
    logRequest(req, 200, Date.now() - start);

    return {
      status: 'ok',
      endpoint: '/webhooks/gotrue',
      events: ['signup', 'login', 'validate', 'user.deleted'],
    };
  });
}
