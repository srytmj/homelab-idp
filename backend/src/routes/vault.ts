import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../db/index.js';
import { encryptAesGcm, decryptAesGcm } from '../crypto/aes.js';
import { config } from '../config/env.js';
import { requireAdmin } from '../middleware/auth.js';

const vaultItemSchema = z.object({
  service_name: z.string().min(1, 'Service name is required'),
  category: z.string().default('General'),
  service_url: z.string().optional().default(''),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  notes: z.string().optional().default(''),
});

const updateVaultItemSchema = z.object({
  service_name: z.string().min(1, 'Service name is required'),
  category: z.string().default('General'),
  service_url: z.string().optional().default(''),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  notes: z.string().optional().default(''),
});

export async function vaultRoutes(fastify: FastifyInstance) {
  // All vault routes require admin privileges
  fastify.addHook('preHandler', requireAdmin);

  // GET /api/vault
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, category } = request.query as { q?: string; category?: string };

    const res = await query('SELECT * FROM vault_credentials ORDER BY updated_at DESC');

    let items = res.rows.map((row) => {
      let password = '';
      let notes = '';

      try {
        if (row.encrypted_password) {
          password = decryptAesGcm(row.encrypted_password, config.vaultSecretKey);
        }
      } catch (err: any) {
        console.error(`Failed to decrypt password for item ${row.id}:`, err.message);
        password = '[DECRYPTION ERROR]';
      }

      try {
        if (row.encrypted_notes) {
          notes = decryptAesGcm(row.encrypted_notes, config.vaultSecretKey);
        }
      } catch (err: any) {
        console.error(`Failed to decrypt notes for item ${row.id}:`, err.message);
        notes = '[DECRYPTION ERROR]';
      }

      return {
        id: row.id,
        service_name: row.service_name,
        category: row.category,
        service_url: row.service_url,
        username: row.username,
        password,
        notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    // Apply filtering if provided
    if (category && category !== 'All') {
      items = items.filter((item) => item.category.toLowerCase() === category.toLowerCase());
    }

    if (q && q.trim()) {
      const search = q.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.service_name.toLowerCase().includes(search) ||
          item.username.toLowerCase().includes(search) ||
          item.service_url.toLowerCase().includes(search) ||
          item.category.toLowerCase().includes(search) ||
          item.notes.toLowerCase().includes(search)
      );
    }

    return reply.send({ credentials: items });
  });

  // POST /api/vault
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = vaultItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: parsed.error.issues,
      });
    }

    const { service_name, category, service_url, username, password, notes } = parsed.data;

    // Encrypt password & notes with AES-256-GCM
    const encryptedPassword = encryptAesGcm(password, config.vaultSecretKey);
    const encryptedNotes = notes ? encryptAesGcm(notes, config.vaultSecretKey) : '';

    const res = await query(
      `INSERT INTO vault_credentials (service_name, category, service_url, username, encrypted_password, encrypted_notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [service_name, category, service_url, username, encryptedPassword, encryptedNotes]
    );

    const row = res.rows[0];
    return reply.status(201).send({
      id: row.id,
      service_name: row.service_name,
      category: row.category,
      service_url: row.service_url,
      username: row.username,
      password,
      notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  });

  // PUT /api/vault/:id
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateVaultItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: parsed.error.issues,
      });
    }

    const { service_name, category, service_url, username, password, notes } = parsed.data;

    const encryptedPassword = encryptAesGcm(password, config.vaultSecretKey);
    const encryptedNotes = notes ? encryptAesGcm(notes, config.vaultSecretKey) : '';

    const res = await query(
      `UPDATE vault_credentials
       SET service_name = $1, category = $2, service_url = $3, username = $4,
           encrypted_password = $5, encrypted_notes = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [service_name, category, service_url, username, encryptedPassword, encryptedNotes, id]
    );

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Item not found' });
    }

    const row = res.rows[0];
    return reply.send({
      id: row.id,
      service_name: row.service_name,
      category: row.category,
      service_url: row.service_url,
      username: row.username,
      password,
      notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  });

  // DELETE /api/vault/:id
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await query('DELETE FROM vault_credentials WHERE id = $1 RETURNING id', [id]);

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Item not found' });
    }

    return reply.send({ success: true, message: 'Credential deleted successfully' });
  });
}
