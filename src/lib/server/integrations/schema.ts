import { getPool } from "@/lib/server/db";

let schemaPromise: Promise<void> | undefined;

export function ensureIntegrationSchema() {
  schemaPromise ??= createSchema().catch((error) => {
    schemaPromise = undefined;
    throw error;
  });
  return schemaPromise;
}

async function createSchema() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS integration_customers (
      id text PRIMARY KEY,
      storeganise_user_id text NOT NULL UNIQUE,
      email text,
      first_name text,
      last_name text,
      phone text,
      address text,
      city text,
      billing_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      disabled boolean NOT NULL DEFAULT false,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS integration_invoices (
      id text PRIMARY KEY,
      storeganise_invoice_id text NOT NULL UNIQUE,
      storeganise_user_id text,
      amount numeric(14,2) NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'HNL',
      storeganise_status text NOT NULL DEFAULT 'UNKNOWN',
      payment_status text NOT NULL DEFAULT 'PENDING',
      payment_method text,
      payment_id text,
      paid_at timestamptz,
      email_status text NOT NULL DEFAULT 'PENDING',
      email_sent_at timestamptz,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      deleted boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS customer_units (
      id text PRIMARY KEY,
      storeganise_unit_id text NOT NULL UNIQUE,
      storeganise_user_id text NOT NULL,
      unit_number text NOT NULL,
      map_zone text,
      status text NOT NULL DEFAULT 'ACTIVE',
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS integration_webhook_events (
      id text PRIMARY KEY,
      provider text NOT NULL,
      event_id text NOT NULL,
      event_type text NOT NULL,
      signature_valid boolean NOT NULL,
      status text NOT NULL DEFAULT 'RECEIVED',
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      error_message text,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz,
      UNIQUE(provider, event_id)
    );

    CREATE TABLE IF NOT EXISTS integration_payments (
      id text PRIMARY KEY,
      external_payment_id text NOT NULL UNIQUE,
      storeganise_invoice_id text NOT NULL,
      method text NOT NULL CHECK (method IN ('transfer','cash','card')),
      status text NOT NULL,
      amount numeric(14,2) NOT NULL,
      currency text NOT NULL DEFAULT 'HNL',
      reference text,
      paid_at timestamptz,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS service_catalog (
      id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      description text NOT NULL,
      category text NOT NULL CHECK (category IN ('INCLUDED','BILLABLE')),
      calculation_type text NOT NULL CHECK (calculation_type IN ('INCLUDED','FIXED','CONSUMPTION')),
      unit text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS service_charges (
      id text PRIMARY KEY,
      charge_number text NOT NULL UNIQUE,
      customer_id text NOT NULL REFERENCES integration_customers(id) ON DELETE RESTRICT,
      service_id text NOT NULL REFERENCES service_catalog(id) ON DELETE RESTRICT,
      billing_period text NOT NULL,
      previous_reading numeric(14,3),
      current_reading numeric(14,3),
      quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
      unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
      margin_percent numeric(8,3) NOT NULL CHECK (margin_percent >= 0),
      unit_price numeric(14,4) NOT NULL CHECK (unit_price >= unit_cost),
      subtotal numeric(14,2) NOT NULL,
      tax_rate numeric(8,3) NOT NULL DEFAULT 15,
      tax numeric(14,2) NOT NULL,
      total numeric(14,2) NOT NULL,
      estimated_cost numeric(14,2) NOT NULL,
      estimated_profit numeric(14,2) NOT NULL,
      status text NOT NULL DEFAULT 'PENDING_PAYMENT',
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE service_charges
      ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE service_charges
      ADD COLUMN IF NOT EXISTS paid_at timestamptz;
    ALTER TABLE service_charges
      ADD COLUMN IF NOT EXISTS unit_id text REFERENCES customer_units(id) ON DELETE SET NULL;
    ALTER TABLE service_charges
      ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
    UPDATE service_charges SET currency='USD' WHERE currency IS DISTINCT FROM 'USD';

    CREATE TABLE IF NOT EXISTS service_charge_items (
      id text PRIMARY KEY,
      service_charge_id text NOT NULL REFERENCES service_charges(id) ON DELETE CASCADE,
      service_id text REFERENCES service_catalog(id) ON DELETE SET NULL,
      charge_type text NOT NULL,
      description text NOT NULL,
      quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
      unit text NOT NULL,
      unit_cost numeric(14,4) NOT NULL DEFAULT 0,
      margin_percent numeric(8,3) NOT NULL DEFAULT 0,
      unit_price numeric(14,4) NOT NULL,
      subtotal numeric(14,2) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS service_charge_payments (
      id text PRIMARY KEY,
      service_charge_id text NOT NULL REFERENCES service_charges(id) ON DELETE CASCADE,
      amount numeric(14,2) NOT NULL CHECK (amount > 0),
      method text NOT NULL CHECK (method IN ('cash','transfer','card')),
      reference text,
      notes text,
      paid_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS billing_documents (
      id text PRIMARY KEY,
      document_number text NOT NULL UNIQUE,
      document_type text NOT NULL CHECK (document_type IN ('PROFORMA','INVOICE')),
      source text NOT NULL CHECK (source IN ('MANUAL','CASH','PROFORMA','SERVICE')),
      customer_id text REFERENCES integration_customers(id) ON DELETE SET NULL,
      unit_id text REFERENCES customer_units(id) ON DELETE SET NULL,
      customer_name text NOT NULL,
      customer_email text,
      customer_phone text,
      customer_rtn text,
      customer_address text,
      currency text NOT NULL DEFAULT 'USD',
      subtotal numeric(14,2) NOT NULL,
      discount numeric(14,2) NOT NULL DEFAULT 0,
      tax numeric(14,2) NOT NULL,
      total numeric(14,2) NOT NULL,
      amount_paid numeric(14,2) NOT NULL DEFAULT 0,
      status text NOT NULL,
      notes text,
      converted_invoice_id text REFERENCES billing_documents(id) ON DELETE SET NULL,
      sent_at timestamptz,
      paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS cai text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS fiscal_correlative integer;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS fiscal_range text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS fiscal_limit_date date;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS unit_label text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS cancellation_reason text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS cancellation_notes text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS cancelled_by text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6);
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS equivalent_currency text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS equivalent_total numeric(14,2);
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS exempt_purchase_order text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS exonerated_registry_number text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS sag_registry_number text;
    ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS credited_amount numeric(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE integration_invoices
      ADD COLUMN IF NOT EXISTS billing_document_id text REFERENCES billing_documents(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS credit_notes (
      id text PRIMARY KEY,
      credit_note_number text NOT NULL UNIQUE,
      invoice_id text NOT NULL REFERENCES billing_documents(id) ON DELETE RESTRICT,
      invoice_number text NOT NULL,
      customer_name text NOT NULL,
      customer_rtn text,
      customer_email text,
      currency text NOT NULL CHECK (currency IN ('USD','HNL')),
      reason_code text NOT NULL,
      reason text NOT NULL,
      resolution text NOT NULL CHECK (resolution IN ('ADJUST_BALANCE','CUSTOMER_CREDIT','BANK_REFUND')),
      subtotal numeric(14,2) NOT NULL,
      tax numeric(14,2) NOT NULL,
      total numeric(14,2) NOT NULL CHECK (total > 0),
      status text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','CANCELLED')),
      cai text NOT NULL,
      fiscal_correlative integer NOT NULL,
      fiscal_range text NOT NULL,
      fiscal_limit_date date NOT NULL,
      created_by text NOT NULL DEFAULT 'Usuario administrativo',
      created_at timestamptz NOT NULL DEFAULT now(),
      cancelled_at timestamptz,
      cancellation_reason text
    );

    CREATE TABLE IF NOT EXISTS credit_note_items (
      id text PRIMARY KEY,
      credit_note_id text NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
      description text NOT NULL,
      subtotal numeric(14,2) NOT NULL,
      tax_rate numeric(8,3) NOT NULL DEFAULT 0,
      tax numeric(14,2) NOT NULL,
      total numeric(14,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_note_events (
      id text PRIMARY KEY,
      credit_note_id text NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
      action text NOT NULL,
      notes text,
      performed_by text NOT NULL DEFAULT 'Usuario administrativo',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS billing_document_units (
      document_id text NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
      unit_id text REFERENCES customer_units(id) ON DELETE SET NULL,
      unit_label text NOT NULL,
      PRIMARY KEY (document_id,unit_label)
    );

    CREATE TABLE IF NOT EXISTS billing_document_cancellations (
      id text PRIMARY KEY,
      document_id text NOT NULL REFERENCES billing_documents(id) ON DELETE RESTRICT,
      document_number text NOT NULL,
      previous_status text NOT NULL,
      reason text NOT NULL,
      notes text,
      cancelled_by text NOT NULL,
      released_units boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO billing_document_units (document_id,unit_id,unit_label)
    SELECT d.id,d.unit_id,COALESCE(d.unit_label,u.unit_number)
    FROM billing_documents d LEFT JOIN customer_units u ON u.id=d.unit_id
    WHERE COALESCE(d.unit_label,u.unit_number) IS NOT NULL
    ON CONFLICT (document_id,unit_label) DO NOTHING;
    INSERT INTO billing_document_units (document_id,unit_id,unit_label)
    SELECT DISTINCT d.id,NULL,substring(di.description from '^Bodega ([^·]+) ·')
    FROM billing_documents d
    JOIN billing_document_items di ON di.document_id=d.id
    WHERE substring(di.description from '^Bodega ([^·]+) ·') IS NOT NULL
    ON CONFLICT (document_id,unit_label) DO NOTHING;

    CREATE TABLE IF NOT EXISTS storage_occupancies (
      id text PRIMARY KEY,
      unit_code text NOT NULL UNIQUE,
      unit_id text REFERENCES customer_units(id) ON DELETE SET NULL,
      customer_id text REFERENCES integration_customers(id) ON DELETE SET NULL,
      customer_key text NOT NULL,
      customer_name text NOT NULL,
      customer_email text,
      customer_phone text,
      customer_rtn text,
      status text NOT NULL DEFAULT 'ACTIVE',
      occupied_at timestamptz NOT NULL DEFAULT now(),
      next_due_date date NOT NULL,
      last_invoice_id text REFERENCES billing_documents(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO storage_occupancies
      (id,unit_code,unit_id,customer_id,customer_key,customer_name,customer_email,
       customer_phone,customer_rtn,status,occupied_at,next_due_date,last_invoice_id)
    SELECT DISTINCT ON (substring(di.description from '^Bodega ([^·]+) ·'))
      gen_random_uuid()::text,
      substring(di.description from '^Bodega ([^·]+) ·'),
      d.unit_id,d.customer_id,
      CASE WHEN d.customer_id IS NOT NULL THEN 'PORTAL:'||d.customer_id
           ELSE 'MANUAL:'||lower(COALESCE(NULLIF(d.customer_email,''),d.customer_name)) END,
      d.customer_name,d.customer_email,d.customer_phone,d.customer_rtn,'ACTIVE',
      d.created_at,(d.created_at AT TIME ZONE 'America/Tegucigalpa')::date+30,d.id
    FROM billing_documents d
    JOIN billing_document_items di ON di.document_id=d.id
    WHERE d.document_type='INVOICE' AND d.source='CASH'
      AND (di.catalog_code='RENTAL_30_DAYS' OR di.description ~* 'alquiler por 30 d[ií]as')
      AND substring(di.description from '^Bodega ([^·]+) ·') IS NOT NULL
    ORDER BY substring(di.description from '^Bodega ([^·]+) ·'),d.created_at DESC
    ON CONFLICT (unit_code) DO NOTHING;

    CREATE TABLE IF NOT EXISTS invoice_templates (
      id text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      logo_url text,
      trade_name text NOT NULL,
      legal_name text NOT NULL,
      rtn text NOT NULL,
      address text NOT NULL,
      phone text NOT NULL,
      email text NOT NULL,
      primary_color text NOT NULL DEFAULT '#004B13',
      header_design text NOT NULL DEFAULT 'moderno',
      legal_text text NOT NULL DEFAULT '',
      footer text NOT NULL DEFAULT '',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE invoice_templates ADD COLUMN IF NOT EXISTS head_office_address text;
    ALTER TABLE invoice_templates ADD COLUMN IF NOT EXISTS establishment_address text;
    UPDATE invoice_templates
    SET head_office_address=COALESCE(head_office_address,'COLONIA SAN CARLOS AVENIDA REPUBLICA DE COLOMBIA una cuadra atras de la embajada de los estados unidos. FRANCISCO MORAZÁN DISTRITO CENTRAL'),
        establishment_address=COALESCE(establishment_address,'COLONIA SAN CARLOS AVENIDA REPUBLICA DE COLOMBIA - REFERENCIA DEL DOMICILIO: una cuadra atras de la embajada de los estados unidos.');
    UPDATE invoice_templates
    SET primary_color='#004B13'
    WHERE lower(primary_color) IN ('#4188ef','#0ea5e9','#0369a1');
    UPDATE invoice_templates
    SET trade_name='BODEGAS SEGURAS ROATAN',
        legal_name='BODEGAS SEGURAS ROATAN SOCIEDAD DE RESPONSABILIDAD LIMITADA',
        rtn='08019024613041',
        address='República de Colombia, San Carlos, una cuadra atrás de la Embajada de los Estados Unidos, Francisco Morazán, Distrito Central',
        phone='98721324',email='bdesol@des.hn',primary_color='#004B13',updated_at=now()
    WHERE rtn='08019012345678';

    CREATE TABLE IF NOT EXISTS cai_ranges (
      id text PRIMARY KEY,
      cai text NOT NULL UNIQUE,
      range_start integer NOT NULL,
      range_end integer NOT NULL,
      current_number integer NOT NULL,
      expiration_date date NOT NULL,
      authorization_date date NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      document_type text NOT NULL,
      establishment text NOT NULL,
      emission_point text NOT NULL,
      branch text NOT NULL,
      created_by text NOT NULL DEFAULT 'system',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS billing_document_items (
      id text PRIMARY KEY,
      document_id text NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
      catalog_code text,
      description text NOT NULL,
      quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
      unit_price numeric(14,4) NOT NULL CHECK (unit_price >= 0),
      discount_percent numeric(8,3) NOT NULL DEFAULT 0,
      tax_rate numeric(8,3) NOT NULL DEFAULT 15,
      subtotal numeric(14,2) NOT NULL,
      discount numeric(14,2) NOT NULL,
      tax numeric(14,2) NOT NULL,
      total numeric(14,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_payments (
      id text PRIMARY KEY,
      document_id text NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
      amount numeric(14,2) NOT NULL CHECK (amount > 0),
      method text NOT NULL CHECK (method IN ('cash','transfer','card')),
      reference text,
      notes text,
      paid_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS integration_customers_email_idx
      ON integration_customers(email);
    CREATE INDEX IF NOT EXISTS integration_invoices_user_idx
      ON integration_invoices(storeganise_user_id);
    CREATE INDEX IF NOT EXISTS integration_invoices_payment_idx
      ON integration_invoices(payment_status);
    CREATE INDEX IF NOT EXISTS customer_units_user_idx
      ON customer_units(storeganise_user_id,status);
    CREATE INDEX IF NOT EXISTS service_charges_customer_idx
      ON service_charges(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS service_charges_status_idx
      ON service_charges(status);
    CREATE INDEX IF NOT EXISTS service_charge_payments_charge_idx
      ON service_charge_payments(service_charge_id, paid_at DESC);
    CREATE INDEX IF NOT EXISTS service_charge_items_charge_idx
      ON service_charge_items(service_charge_id);
    CREATE INDEX IF NOT EXISTS billing_documents_customer_idx
      ON billing_documents(customer_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS billing_documents_type_status_idx
      ON billing_documents(document_type,status);
    CREATE INDEX IF NOT EXISTS storage_occupancies_due_idx
      ON storage_occupancies(status,next_due_date);
    CREATE INDEX IF NOT EXISTS storage_occupancies_customer_idx
      ON storage_occupancies(customer_key,status);
    CREATE INDEX IF NOT EXISTS billing_document_units_unit_idx
      ON billing_document_units(unit_label,document_id);
    CREATE INDEX IF NOT EXISTS billing_cancellations_document_idx
      ON billing_document_cancellations(document_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx
      ON credit_notes(invoice_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS credit_notes_status_idx
      ON credit_notes(status,created_at DESC);

    INSERT INTO service_catalog
      (id, code, name, description, category, calculation_type, unit, sort_order)
    VALUES
      ('SVC-ELECTRICITY', 'ELECTRICITY', 'Electricidad de bodega',
       'Consumo eléctrico de la bodega medido en kWh.', 'BILLABLE', 'CONSUMPTION', 'kWh', 10),
      ('SVC-INDIVIDUAL-LIGHT', 'INDIVIDUAL_LIGHT', 'Luz individual bajo demanda',
       'Cargo mensual por iluminación individual solicitada por el cliente.', 'BILLABLE', 'FIXED', 'mes', 20),
      ('SVC-WIFI', 'WIFI', 'Wi-Fi opcional',
       'Acceso mensual a la red Wi-Fi para la unidad.', 'BILLABLE', 'FIXED', 'mes', 30),
      ('SVC-INTERNET', 'INTERNET', 'Internet',
       'Servicio de internet contratado para la bodega.', 'BILLABLE', 'FIXED', 'mes', 31),
      ('SVC-PARKING', 'PARKING', 'Parqueo',
       'Espacio de parqueo adicional contratado por el cliente.', 'BILLABLE', 'FIXED', 'espacio/mes', 40),
      ('SVC-OTHER-SERVICE', 'OTHER_SERVICE', 'Otros servicios',
       'Servicio adicional configurable.', 'BILLABLE', 'FIXED', 'unidad', 41),
      ('SVC-OTHER-CHARGE', 'OTHER_CHARGE', 'Otros cargos',
       'Cargo adicional configurable.', 'BILLABLE', 'FIXED', 'unidad', 42),
      ('SVC-CAMERAS', 'CAMERAS', 'Cámaras de vigilancia 24/7',
       'Característica de seguridad incluida con el alquiler.', 'INCLUDED', 'INCLUDED', 'incluido', 50),
      ('SVC-EXTINGUISHERS', 'EXTINGUISHERS', 'Extinguidores',
       'Característica de seguridad incluida con el alquiler.', 'INCLUDED', 'INCLUDED', 'incluido', 60),
      ('SVC-MOTION-LIGHT', 'MOTION_LIGHT', 'Iluminación con sensor de movimiento',
       'Iluminación de áreas comunes incluida.', 'INCLUDED', 'INCLUDED', 'incluido', 70)
    ON CONFLICT (code) DO UPDATE SET
      name=EXCLUDED.name, description=EXCLUDED.description,
      category=EXCLUDED.category, calculation_type=EXCLUDED.calculation_type,
      unit=EXCLUDED.unit, sort_order=EXCLUDED.sort_order, updated_at=now();

    INSERT INTO customer_units
      (id,storeganise_unit_id,storeganise_user_id,unit_number,map_zone,raw_payload)
    SELECT
      gen_random_uuid()::text,
      COALESCE(
        raw_payload #>> '{data,unit,id}',
        raw_payload #>> '{data,unit,_id}',
        raw_payload #>> '{data,unitId}'
      ),
      storeganise_user_id,
      COALESCE(
        raw_payload #>> '{data,unit,number}',
        raw_payload #>> '{data,unit,name}',
        raw_payload #>> '{data,unitNumber}'
      ),
      COALESCE(raw_payload #>> '{data,unit,zone}',raw_payload #>> '{data,unit,section}'),
      COALESCE(raw_payload #> '{data,unit}','{}'::jsonb)
    FROM integration_invoices
    WHERE storeganise_user_id IS NOT NULL
      AND COALESCE(
        raw_payload #>> '{data,unit,id}',
        raw_payload #>> '{data,unit,_id}',
        raw_payload #>> '{data,unitId}'
      ) IS NOT NULL
      AND COALESCE(
        raw_payload #>> '{data,unit,number}',
        raw_payload #>> '{data,unit,name}',
        raw_payload #>> '{data,unitNumber}'
      ) IS NOT NULL
    ON CONFLICT (storeganise_unit_id) DO NOTHING;
  `);
}
