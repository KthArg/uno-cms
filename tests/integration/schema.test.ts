import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { CONTENT_STATUSES, USER_ROLES, contentEntries, getDb, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-40-1 a T-40-6: el esquema de SPEC §4 sobre Postgres real.
 *
 * No se comprueba que Drizzle "declare" las tablas —eso sería probar la librería— sino que
 * las **garantías de integridad** que la spec pide existen de verdad en la base de datos:
 * unicidad de clave, email sin distinguir mayúsculas, borrado que no arrastra contenido, y
 * enums que rechazan valores ajenos.
 */

describeIntegration('SPEC §4 — esquema y garantías de integridad', () => {
  it('T-40-2: existen las seis tablas de SPEC §4', async () => {
    const result = await getDb().execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);

    const names = (result.rows as { table_name: string }[]).map((row) => row.table_name);

    for (const table of [
      'users',
      'content_entries',
      'revisions',
      'media',
      'audit_log',
      'settings',
    ]) {
      expect(names).toContain(table);
    }
  });

  it('T-40-3: `content_entries.key` es único', async () => {
    const row = { key: 'hero', type: 'hero', draft: {} };
    await getDb().insert(contentEntries).values(row);

    await expect(getDb().insert(contentEntries).values(row)).rejects.toThrow();
  });

  it('T-40-4: el email es único sin distinguir mayúsculas (ADR-201)', async () => {
    await getDb().insert(users).values({
      email: 'Ana@Ejemplo.com',
      name: 'Ana',
      passwordHash: 'x',
    });

    // Sin el índice funcional sobre lower(email), Postgres aceptaría esta segunda fila y
    // habría dos cuentas para la misma persona: una podría iniciar sesión y la otra no.
    await expect(
      getDb().insert(users).values({ email: 'ana@ejemplo.com', name: 'Ana bis', passwordHash: 'y' })
    ).rejects.toThrow();
  });

  it('T-40-5: borrar un usuario no borra su contenido', async () => {
    const [author] = await getDb()
      .insert(users)
      .values({ email: 'editor@ejemplo.com', name: 'Editor', passwordHash: 'x' })
      .returning();

    await getDb()
      .insert(contentEntries)
      .values({ key: 'about', type: 'about', draft: { heading: 'Hola' }, updatedBy: author?.id });

    await getDb().delete(users);

    const rows = await getDb().select().from(contentEntries);
    expect(rows).toHaveLength(1);
    // `set null` y no `cascade`: el contenido sobrevive, huérfano pero intacto.
    expect(rows[0]?.updatedBy).toBeNull();
    expect(rows[0]?.draft).toEqual({ heading: 'Hola' });
  });

  it('ADR-203: el CHECK real de Postgres coincide con las constantes de TypeScript', async () => {
    // La lista de valores está escrita dos veces: en el `enum` de `text()` y en el literal
    // del `CHECK`. Derivar una de otra exigiría `sql.raw`, prohibido por SPEC §7.1. Este
    // test es lo que impide que diverjan, y falla en cuanto alguien toque solo una.
    const result = await getDb().execute(sql`
      select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname in ('users_role_check', 'content_status_check')
    `);

    const definitions = new Map(
      (result.rows as { conname: string; definition: string }[]).map((row) => [
        row.conname,
        row.definition,
      ])
    );

    for (const role of USER_ROLES) {
      expect(definitions.get('users_role_check')).toContain(`'${role}'`);
    }
    for (const status of CONTENT_STATUSES) {
      expect(definitions.get('content_status_check')).toContain(`'${status}'`);
    }

    // Y al revés: que el CHECK no permita nada que TypeScript no contemple.
    const roleValues = [...(definitions.get('users_role_check')?.matchAll(/'([^']+)'/g) ?? [])].map(
      (match) => match[1]
    );
    expect(new Set(roleValues)).toEqual(new Set(USER_ROLES));
  });

  it('T-40-6: el enum de `status` rechaza valores ajenos', async () => {
    await expect(
      getDb().execute(sql`
        insert into content_entries (key, type, draft, status)
        values ('x', 'x', '{}'::jsonb, 'publicado')
      `)
    ).rejects.toThrow();
  });

  it('T-40-6: el enum de `role` rechaza valores ajenos', async () => {
    await expect(
      getDb().execute(sql`
        insert into users (email, name, password_hash, role)
        values ('a@b.com', 'A', 'x', 'superadmin')
      `)
    ).rejects.toThrow();
  });

  it('los valores por defecto de SPEC §4 se aplican', async () => {
    const [entry] = await getDb()
      .insert(contentEntries)
      .values({ key: 'seo', type: 'seo', draft: {} })
      .returning();

    expect(entry?.status).toBe('draft');
    expect(entry?.version).toBe(0);
    expect(entry?.sortOrder).toBe(0);
    expect(entry?.published).toBeNull();
    expect(entry?.publishedAt).toBeNull();
  });

  it('el registro de auditoría sobrevive al borrado del usuario', async () => {
    // `audit_log.actor_id` NO lleva clave foránea a propósito (SPEC §4): el rastro tiene
    // que quedar aunque la cuenta desaparezca.
    const [author] = await getDb()
      .insert(users)
      .values({ email: 'quien@ejemplo.com', name: 'Quien', passwordHash: 'x' })
      .returning();

    await getDb().execute(sql`
      insert into audit_log (actor_id, actor_email, action)
      values (${author?.id}, 'quien@ejemplo.com', 'login.success')
    `);

    await getDb().delete(users);

    const result = await getDb().execute(sql`select actor_email from audit_log`);
    expect((result.rows as { actor_email: string }[])[0]?.actor_email).toBe('quien@ejemplo.com');
  });
});
