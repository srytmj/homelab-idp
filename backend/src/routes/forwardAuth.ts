import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuthenticatedUser } from '../middleware/auth.js';

export async function forwardAuthRoutes(fastify: FastifyInstance) {
  /**
   * Forward Auth verification endpoint for Nginx Proxy Manager / Traefik / Caddy.
   * Responds 200 OK with Remote-* headers if authenticated, else 401 Unauthorized.
   */
  fastify.get('/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      // Return 401 with informative header
      return reply
        .status(401)
        .header('WWW-Authenticate', 'Bearer realm="Homelab IDP"')
        .send({
          error: 'Unauthorized',
          message: 'Forward auth validation failed. Please log in.',
        });
    }

    // Set Forward Auth injection headers for reverse proxy
    reply
      .header('Remote-User', user.username)
      .header('Remote-Email', user.email)
      .header('Remote-Name', user.displayName)
      .header('Remote-Groups', user.role)
      .status(200)
      .send('OK');
  });
}
