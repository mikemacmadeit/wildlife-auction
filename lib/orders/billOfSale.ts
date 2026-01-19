import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import type { HorseAttributes, ListingCategory } from '@/lib/types';
import { getCategoryRequirements } from '@/lib/compliance/requirements';

export const BILL_OF_SALE_DOC_ID = 'bill_of_sale';
export const BILL_OF_SALE_VERSION = 'v1';

export function getBillOfSaleStoragePath(orderId: string) {
  return `orders/${orderId}/documents/bill_of_sale_${BILL_OF_SALE_VERSION}.pdf`;
}

function randomToken(bytes: number = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function buildFirebaseStorageDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

function sha256Hex(buf: Buffer | string) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function clean(s: any) {
  return String(s || '').trim();
}

export type BillOfSaleParty = {
  uid: string;
  fullName: string;
  email?: string | null;
  phoneNumber?: string | null;
  location: {
    address?: string | null;
    city: string;
    state: string;
    zip: string;
  };
};

export type BillOfSaleHorse = {
  listingId: string;
  listingTitle: string;
  registrationOrg?: string | null;
  registrationNumber?: string | null;
  sex: string;
  age?: number | string | null;
  identifiers: {
    microchip?: string | null;
    brand?: string | null;
    tattoo?: string | null;
    markings?: string | null;
  };
};

export type BillOfSaleData = {
  orderId: string;
  saleDateIso: string; // yyyy-mm-dd
  purchasePriceUsd: number;
  seller: BillOfSaleParty;
  buyer: BillOfSaleParty;
  horse: BillOfSaleHorse;
  lienDisclosureText: string;
  asIsDisclaimerText: string;
  possessionText: string;
};

export function validateBillOfSaleInputs(data: BillOfSaleData) {
  const missing: string[] = [];
  const requireNonEmpty = (key: string, value: any) => {
    if (!clean(value)) missing.push(key);
  };

  requireNonEmpty('seller.fullName', data.seller.fullName);
  requireNonEmpty('seller.location.city', data.seller.location.city);
  requireNonEmpty('seller.location.state', data.seller.location.state);
  requireNonEmpty('seller.location.zip', data.seller.location.zip);

  requireNonEmpty('buyer.fullName', data.buyer.fullName);
  requireNonEmpty('buyer.location.city', data.buyer.location.city);
  requireNonEmpty('buyer.location.state', data.buyer.location.state);
  requireNonEmpty('buyer.location.zip', data.buyer.location.zip);

  requireNonEmpty('horse.listingTitle', data.horse.listingTitle);
  requireNonEmpty('horse.sex', data.horse.sex);

  // At least one identifier OR registration number (so the written transfer is meaningful).
  const id = data.horse.identifiers || {};
  const hasAnyId =
    !!clean(data.horse.registrationNumber) ||
    !!clean(id.microchip) ||
    !!clean(id.brand) ||
    !!clean(id.tattoo) ||
    !!clean(id.markings);
  if (!hasAnyId) missing.push('horse.identifiers (microchip/brand/tattoo/markings) or registrationNumber');

  if (missing.length) {
    const err = new Error(`Bill of sale is missing required fields: ${missing.join(', ')}`) as any;
    err.code = 'BILL_OF_SALE_MISSING_FIELDS';
    err.missing = missing;
    throw err;
  }
}

export function renderBillOfSaleHtml(data: BillOfSaleData): string {
  // Deterministic output (no dynamic timestamps beyond saleDateIso).
  const esc = (s: string) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const line = (label: string, value: string) => `<tr><td style="padding:6px 10px;border:1px solid #ddd;"><strong>${esc(label)}</strong></td><td style="padding:6px 10px;border:1px solid #ddd;">${esc(value)}</td></tr>`;

  const sellerAddr = [data.seller.location.address, data.seller.location.city, data.seller.location.state, data.seller.location.zip]
    .filter((v) => clean(v))
    .join(', ');
  const buyerAddr = [data.buyer.location.address, data.buyer.location.city, data.buyer.location.state, data.buyer.location.zip]
    .filter((v) => clean(v))
    .join(', ');

  const id = data.horse.identifiers || {};
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bill of Sale</title>
  </head>
  <body style="font-family: Arial, Helvetica, sans-serif; color:#111; line-height:1.35;">
    <h1 style="margin:0 0 6px 0;">Bill of Sale / Written Transfer</h1>
    <div style="color:#555; margin-bottom:14px;">Order: ${esc(data.orderId)} · Date: ${esc(data.saleDateIso)}</div>

    <h2 style="margin:18px 0 6px 0;">Parties</h2>
    <table style="border-collapse:collapse; width:100%; font-size:14px;">
      ${line('Seller', `${data.seller.fullName}${data.seller.email ? ` (${data.seller.email})` : ''}`)}
      ${line('Seller address', sellerAddr || '—')}
      ${line('Buyer', `${data.buyer.fullName}${data.buyer.email ? ` (${data.buyer.email})` : ''}`)}
      ${line('Buyer address', buyerAddr || '—')}
    </table>

    <h2 style="margin:18px 0 6px 0;">Horse / Property</h2>
    <table style="border-collapse:collapse; width:100%; font-size:14px;">
      ${line('Listing', `${data.horse.listingTitle} (${data.horse.listingId})`)}
      ${line('Sex', data.horse.sex)}
      ${line('Age', data.horse.age !== undefined && data.horse.age !== null && String(data.horse.age).trim() ? String(data.horse.age) : '—')}
      ${line('Registration org', data.horse.registrationOrg || '—')}
      ${line('Registration number', data.horse.registrationNumber || '—')}
      ${line('Microchip', (id.microchip as any) || '—')}
      ${line('Brand', (id.brand as any) || '—')}
      ${line('Tattoo', (id.tattoo as any) || '—')}
      ${line('Markings', (id.markings as any) || '—')}
    </table>

    <h2 style="margin:18px 0 6px 0;">Purchase</h2>
    <table style="border-collapse:collapse; width:100%; font-size:14px;">
      ${line('Purchase price', `$${Number(data.purchasePriceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
      ${line('Delivery / possession', data.possessionText)}
      ${line('Liens / title', data.lienDisclosureText)}
      ${line('As-is', data.asIsDisclaimerText)}
    </table>

    <h2 style="margin:18px 0 6px 0;">Signatures</h2>
    <div style="font-size:14px;">
      <div style="margin:10px 0;">Seller signature: ________________________________ Date: __________</div>
      <div style="margin:10px 0;">Buyer signature: _________________________________ Date: __________</div>
    </div>
  </body>
</html>`;
}

export async function renderBillOfSalePdfBuffer(data: BillOfSaleData): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 54,
        info: {
          Title: 'Bill of Sale / Written Transfer',
          Author: 'Wildlife Exchange',
          Subject: `Order ${data.orderId}`,
          CreationDate: new Date(`${data.saleDateIso}T00:00:00Z`),
          ModDate: new Date(`${data.saleDateIso}T00:00:00Z`),
        } as any,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const h = (t: string) => doc.fontSize(16).font('Helvetica-Bold').text(t, { align: 'left' }).moveDown(0.25);
      const sh = (t: string) => doc.fontSize(12).font('Helvetica-Bold').text(t).moveDown(0.2);
      const kv = (k: string, v: string) => {
        doc.fontSize(10).font('Helvetica-Bold').text(`${k}: `, { continued: true });
        doc.font('Helvetica').text(v || '—');
      };

      h('Bill of Sale / Written Transfer');
      doc.fontSize(10).font('Helvetica').fillColor('#444').text(`Order: ${data.orderId}   Date: ${data.saleDateIso}`);
      doc.moveDown(0.75);
      doc.fillColor('#111');

      sh('Parties');
      kv('Seller', `${data.seller.fullName}${data.seller.email ? ` (${data.seller.email})` : ''}`);
      kv('Seller address', [data.seller.location.address, data.seller.location.city, data.seller.location.state, data.seller.location.zip].filter((v) => clean(v)).join(', ') || '—');
      doc.moveDown(0.25);
      kv('Buyer', `${data.buyer.fullName}${data.buyer.email ? ` (${data.buyer.email})` : ''}`);
      kv('Buyer address', [data.buyer.location.address, data.buyer.location.city, data.buyer.location.state, data.buyer.location.zip].filter((v) => clean(v)).join(', ') || '—');
      doc.moveDown(0.75);

      sh('Horse / Property');
      kv('Listing', `${data.horse.listingTitle} (${data.horse.listingId})`);
      kv('Sex', data.horse.sex);
      kv('Age', data.horse.age !== undefined && data.horse.age !== null && clean(data.horse.age) ? String(data.horse.age) : '—');
      kv('Registration org', data.horse.registrationOrg || '—');
      kv('Registration number', data.horse.registrationNumber || '—');
      kv('Microchip', clean(data.horse.identifiers?.microchip) || '—');
      kv('Brand', clean(data.horse.identifiers?.brand) || '—');
      kv('Tattoo', clean(data.horse.identifiers?.tattoo) || '—');
      kv('Markings', clean(data.horse.identifiers?.markings) || '—');
      doc.moveDown(0.75);

      sh('Purchase');
      kv('Purchase price', `$${Number(data.purchasePriceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      kv('Delivery / possession', data.possessionText);
      kv('Liens / title', data.lienDisclosureText);
      kv('As-is', data.asIsDisclaimerText);
      doc.moveDown(0.75);

      sh('Signatures');
      doc.fontSize(10).font('Helvetica').text('Seller signature: ________________________________   Date: __________');
      doc.moveDown(0.6);
      doc.text('Buyer signature:  _________________________________   Date: __________');

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export async function uploadPdfToFirebaseStorage(params: {
  bucket: Bucket;
  path: string;
  pdf: Buffer;
}): Promise<{ url: string; token: string; sha256: string }> {
  const token = randomToken(16);
  const sha = sha256Hex(params.pdf);
  await params.bucket.file(params.path).save(params.pdf, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        sha256: sha,
      },
    },
  } as any);
  const url = buildFirebaseStorageDownloadUrl(params.bucket.name, params.path, token);
  return { url, token, sha256: sha };
}

export async function ensureBillOfSaleForOrder(params: {
  db: Firestore;
  bucket: Bucket;
  orderId: string;
  listing: { id: string; title: string; category: ListingCategory; attributes: any };
  orderAmountUsd: number;
  buyer: BillOfSaleParty;
  seller: BillOfSaleParty;
  now: Timestamp;
}): Promise<{ ok: true; url: string; sha256: string; created: boolean } | { ok: false; code: string; message: string; missing?: string[] }> {
  const req = getCategoryRequirements(params.listing.category);
  if (!req.requireBillOfSaleAtCheckout) {
    return { ok: true, url: '', sha256: '', created: false };
  }

  const docRef = params.db.collection('orders').doc(params.orderId).collection('documents').doc(BILL_OF_SALE_DOC_ID);
  const existing = await docRef.get().catch(() => null as any);
  if (existing?.exists) {
    const data = existing.data() as any;
    const url = typeof data?.documentUrl === 'string' ? data.documentUrl : '';
    const sha = typeof data?.metadata?.sha256 === 'string' ? data.metadata.sha256 : '';
    if (url) return { ok: true, url, sha256: sha, created: false };
  }

  const attrs = params.listing.attributes as Partial<HorseAttributes>;
  const horse: BillOfSaleHorse = {
    listingId: params.listing.id,
    listingTitle: params.listing.title,
    registrationOrg: clean((attrs as any)?.registrationOrg) || null,
    registrationNumber: clean((attrs as any)?.registrationNumber) || null,
    sex: clean((attrs as any)?.sex),
    age: (attrs as any)?.age ?? null,
    identifiers: {
      microchip: clean((attrs as any)?.identification?.microchip) || null,
      brand: clean((attrs as any)?.identification?.brand) || null,
      tattoo: clean((attrs as any)?.identification?.tattoo) || null,
      markings: clean((attrs as any)?.identification?.markings) || null,
    },
  };

  const saleDateIso = new Date(params.now.toMillis()).toISOString().slice(0, 10);
  const data: BillOfSaleData = {
    orderId: params.orderId,
    saleDateIso,
    purchasePriceUsd: params.orderAmountUsd,
    seller: params.seller,
    buyer: params.buyer,
    horse,
    lienDisclosureText: 'Seller discloses any liens/encumbrances as stated in the listing and represents that transfer will be free of undisclosed liens.',
    asIsDisclaimerText: 'Buyer accepts the horse/property in “as-is” condition with no warranties except as expressly stated in writing.',
    possessionText: 'Possession transfers upon agreed delivery/pickup and completion of platform requirements.',
  };

  try {
    validateBillOfSaleInputs(data);
  } catch (e: any) {
    return { ok: false, code: e?.code || 'BILL_OF_SALE_INVALID', message: e?.message || 'Bill of sale missing required fields', missing: e?.missing };
  }

  const html = renderBillOfSaleHtml(data);
  const pdf = await renderBillOfSalePdfBuffer(data);
  const storagePath = getBillOfSaleStoragePath(params.orderId);
  const uploaded = await uploadPdfToFirebaseStorage({ bucket: params.bucket, path: storagePath, pdf });

  await docRef.set(
    {
      type: 'BILL_OF_SALE',
      documentUrl: uploaded.url,
      status: 'uploaded',
      uploadedBy: 'system',
      uploadedAt: params.now,
      metadata: {
        source: 'generated',
        version: BILL_OF_SALE_VERSION,
        storagePath,
        mimeType: 'application/pdf',
        sha256: uploaded.sha256,
        htmlSha256: sha256Hex(html),
      },
    },
    { merge: true }
  );

  // Also snapshot onto the order for quick rendering (non-authoritative; doc is source-of-truth).
  await params.db.collection('orders').doc(params.orderId).set(
    {
      billOfSaleGeneratedAt: params.now,
      updatedAt: params.now,
    },
    { merge: true }
  );

  return { ok: true, url: uploaded.url, sha256: uploaded.sha256, created: true };
}

