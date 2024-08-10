import bcrypt from 'bcrypt';
import { Client } from 'pg';
import { invoices, customers, revenue, users } from '../lib/placeholder-data';

// Configure your PostgreSQL client
const client = new Client({
  host: 'localhost',     // Your PostgreSQL host
  port: 5432,            // Default PostgreSQL port
  user: 'dashboard', // Your PostgreSQL username
  password: 'superstar', // Your PostgreSQL password
  database: 'dashboard'   // Your PostgreSQL database
});

await client.connect();

async function seedUsers(): Promise<void> {
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);

  await Promise.all(
    users.map(async (user) => {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      return client.query(`
        INSERT INTO users (id, name, email, password)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING;
      `, [user.id, user.name, user.email, hashedPassword]);
    }),
  );
}

async function seedInvoices(): Promise<void> {
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await client.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      customer_id UUID NOT NULL,
      amount INT NOT NULL,
      status VARCHAR(255) NOT NULL,
      date DATE NOT NULL
    );
  `);

  await Promise.all(
    invoices.map(
      (invoice) => client.query(`
        INSERT INTO invoices (customer_id, amount, status, date)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING;
      `, [invoice.customer_id, invoice.amount, invoice.status, invoice.date]),
    ),
  );
}

async function seedCustomers(): Promise<void> {
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await client.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      image_url VARCHAR(255) NOT NULL
    );
  `);

  await Promise.all(
    customers.map(
      (customer) => client.query(`
        INSERT INTO customers (id, name, email, image_url)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING;
      `, [customer.id, customer.name, customer.email, customer.image_url]),
    ),
  );
}

async function seedRevenue(): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS revenue (
      month VARCHAR(4) NOT NULL UNIQUE,
      revenue INT NOT NULL
    );
  `);

  await Promise.all(
    revenue.map(
      (rev) => client.query(`
        INSERT INTO revenue (month, revenue)
        VALUES ($1, $2)
        ON CONFLICT (month) DO NOTHING;
      `, [rev.month, rev.revenue]),
    ),
  );
}

export async function GET(): Promise<Response> {
  try {
    await client.query('BEGIN');
    await seedUsers();
    await seedCustomers();
    await seedInvoices();
    await seedRevenue();
    await client.query('COMMIT');

    return new Response(
      JSON.stringify({ message: 'Database seeded successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      await client.query('ROLLBACK');
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      await client.query('ROLLBACK');
      return new Response(
        JSON.stringify({ error: 'An unexpected error occurred' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } finally {
    await client.end();
  }
}
