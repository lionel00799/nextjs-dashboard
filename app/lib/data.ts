import { Client } from 'pg';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

// Configure your PostgreSQL client
const client = new Client({
  host: 'localhost',     // Your PostgreSQL host
  port: 5432,            // Default PostgreSQL port
  user: 'dashboard', // Your PostgreSQL username
  password: 'superstar', // Your PostgreSQL password
  database: 'dashboard'   // Your PostgreSQL database
});

await client.connect();

export async function fetchRevenue(): Promise<Revenue[]> {
  try {
    console.log('Fetching revenue data...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const result = await client.query<Revenue>('SELECT * FROM revenue');
    console.log('Data fetch completed after 3 seconds.');
    return result.rows;
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const result = await client.query<LatestInvoiceRaw>(`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5
    `);

    const latestInvoices = result.rows.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    const invoiceCountPromise = client.query('SELECT COUNT(*) FROM invoices');
    const customerCountPromise = client.query('SELECT COUNT(*) FROM customers');
    const invoiceStatusPromise = client.query(`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
      FROM invoices
    `);

    const [invoiceCountResult, customerCountResult, invoiceStatusResult] = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(invoiceCountResult.rows[0].count ?? '0');
    const numberOfCustomers = Number(customerCountResult.rows[0].count ?? '0');
    const totalPaidInvoices = formatCurrency(invoiceStatusResult.rows[0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(invoiceStatusResult.rows[0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
): Promise<InvoicesTable[]> {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const result = await client.query<InvoicesTable>(`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `);

    return result.rows;
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string): Promise<number> {
  try {
    const result = await client.query(`
      SELECT COUNT(*)
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
    `);

    const totalPages = Math.ceil(Number(result.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string): Promise<InvoiceForm | null> {
  try {
    const result = await client.query<InvoiceForm>(`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `);

    const invoice = result.rows.map((invoice) => ({
      ...invoice,
      amount: invoice.amount / 100, // Convert amount from cents to dollars
    }));

    return invoice[0] || null;
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers(): Promise<CustomerField[]> {
  try {
    const result = await client.query<CustomerField>(`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `);

    return result.rows;
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string): Promise<CustomersTableType[]> {
  try {
    const result = await client.query<CustomersTableType>(`
        SELECT
          customers.id,
          customers.name,
          customers.email,
          customers.image_url,
          COUNT(invoices.id) AS total_invoices,
          SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
          SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
        FROM customers
        LEFT JOIN invoices ON customers.id = invoices.customer_id
        WHERE
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`}
        GROUP BY customers.id, customers.name, customers.email, customers.image_url
        ORDER BY customers.name ASC
      `);

    const customers = result.rows.map((customer) => ({
      ...customer,
      total_pending: Number(formatCurrency(customer.total_pending)),
      total_paid: Number(formatCurrency(customer.total_paid)),
    }));

    return customers;
  } catch (error: unknown) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer table.');
  }
}
