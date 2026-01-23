# CURRENT ADMIN MESSAGING FLOW

## Overview
This document identifies where admins currently send messages to users, what message types exist, where admin message UI lives, and how messages are currently sent.

## 1. SUPPORT TICKET REPLIES

### Primary Location: Admin Support Inbox
**File:** `app/dashboard/admin/support/page.tsx`
**Route:** `/dashboard/admin/support`
**UI Location:** Lines 301-362 (Reply Dialog)

### Message Flow

**1. Admin Opens Ticket:**
- Admin clicks "Open" on a support ticket
- Dialog opens showing:
  - Original message from user
  - Reply textarea (editable)
  - Send button

**2. Admin Writes Reply:**
- Admin types message in textarea (`reply` state)
- Message is plain text (no formatting)
- Max length: 5000 characters (enforced by API)

**3. Admin Sends Reply:**
- Admin clicks "Send reply" button
- Calls `sendReply()` function (line 132)
- Sends POST to `/api/admin/support/tickets/[ticketId]/reply`

**4. Backend Processing:**
- **File:** `app/api/admin/support/tickets/[ticketId]/reply/route.ts`
- **Endpoint:** `POST /api/admin/support/tickets/[ticketId]/reply`
- **Access:** Admin-only (requires admin role verification)

**Backend Actions:**
1. Validates message (1-5000 chars)
2. Stores message in Firestore:
   - Collection: `supportTickets/{ticketId}/messages/{messageId}`
   - Fields: `kind: 'admin'`, `by: actorUid`, `body: message`, `createdAt: timestamp`
3. Updates ticket status:
   - Sets `status: 'open'`
   - Sets `adminLastRepliedAt`, `adminLastRepliedBy`
   - Sets `lastPublicReplyAt`, `lastPublicReplyBy: 'admin'`
4. Sends email to user:
   - Uses `getSupportTicketReplyEmail()` template
   - Sends via `sendEmailHtml()` (SendGrid/Brevo)
   - Email includes:
     - User's name
     - Admin's message
     - Link to view ticket
5. Creates audit log entry

**Email Template:**
- **File:** `lib/email/templates.ts` (lines 1396-1420)
- **Function:** `getSupportTicketReplyEmail()`
- **Subject:** `Support reply: {subjectLine} ({ticketId})`
- **Content:** Includes admin message in formatted box

---

## 2. DISPUTE RESOLUTION ADMIN NOTES

### Location: Dispute Resolution Dialogs
**Files:**
- `app/dashboard/admin/ops/page.tsx` (Resolve Dispute Dialog)
- `app/dashboard/admin/protected-transactions/page.tsx` (Resolve Dispute Dialog)

### Message Flow

**1. Admin Resolves Dispute:**
- Admin selects resolution type (release/refund/partial_refund)
- Admin enters "Admin Notes" (required field)
- Admin clicks "Resolve Dispute"

**2. Backend Processing:**
- **File:** `app/api/orders/[orderId]/disputes/resolve/route.ts`
- **Endpoint:** `POST /api/orders/[orderId]/disputes/resolve`
- **Access:** Admin-only

**Backend Actions:**
1. Validates resolution and admin notes
2. Processes resolution (release/refund)
3. Stores admin notes:
   - Adds to `adminActionNotes` array
   - Appends to `protectedDisputeNotes` field (with `[Admin]:` prefix)
4. Creates audit log entry

**Important:** Admin notes are **INTERNAL ONLY** - they are NOT sent to users as messages. They are stored for audit purposes and internal reference.

---

## 3. VERIFICATION EMAILS

### Location: User Dossier Page
**File:** `app/dashboard/admin/users/[uid]/page.tsx`
**Endpoint:** `POST /api/admin/users/[userId]/send-verification-email`

### Message Flow

**1. Admin Sends Verification Email:**
- Admin clicks "Send Verification Email" button
- Enters reason (required)
- Sends request

**2. Backend Processing:**
- **File:** `app/api/admin/users/[userId]/send-verification-email/route.ts`
- Generates Firebase verification link
- Uses email template (`verify_email`)
- Sends email via `sendEmailHtml()`

**Important:** This uses a **template**, not free-form messaging. Not suitable for AI drafts.

---

## 4. PASSWORD RESET LINKS

### Location: User Dossier Page
**File:** `app/dashboard/admin/users/[uid]/page.tsx`
**Endpoint:** `POST /api/admin/users/[userId]/password-reset-link`

### Message Flow

**1. Admin Generates Reset Link:**
- Admin clicks "Generate Password Reset Link"
- Enters reason (required)
- Receives link (not sent automatically)

**Important:** This generates a link but does NOT send it. Admin must manually send the link. Not suitable for AI drafts.

---

## 5. ADMIN ACTION NOTES (INTERNAL)

### Locations:
- Dispute resolution (`adminNotes` field)
- Admin hold placement (`adminActionNotes` array)
- Order admin actions

**Important:** These are **internal notes only** - not messages to users. They are stored for audit and reference.

---

## 6. MESSAGE THREADS (FLAGGED MESSAGES)

### Location: Admin Messages Page
**File:** `app/dashboard/admin/messages/page.tsx`
**Route:** `/dashboard/admin/messages`

### Message Flow

**1. Admin Reviews Flagged Messages:**
- Admin views flagged message threads
- Admin can add moderation notes (internal)
- Admin can mark as reviewed

**Important:** This is for **moderation**, not sending messages to users. Admins do not send messages through this interface.

---

## 7. DATA STRUCTURE

### Support Tickets
**Collection:** `supportTickets/{ticketId}`
**Subcollection:** `supportTickets/{ticketId}/messages/{messageId}`

**Ticket Fields:**
- `email: string` - User's email (recipient)
- `name: string` - User's name
- `subject: string` - Ticket subject
- `message: string` - Original message
- `status: 'open' | 'resolved'`
- `adminLastRepliedAt: Timestamp`
- `adminLastRepliedBy: string` (admin UID)

**Message Fields:**
- `kind: 'admin' | 'user'`
- `by: string` (UID)
- `body: string` (message text)
- `createdAt: Timestamp`

---

## 8. ASSUMPTIONS

1. **Support ticket replies are the primary admin-to-user messaging channel**
2. **Dispute admin notes are internal only** - not sent to users
3. **Verification emails use templates** - not suitable for AI drafts
4. **Password reset links are generated, not auto-sent** - admin must manually send
5. **All admin messages require explicit "Send" action** - no auto-sending
6. **Messages are sent via email** - not in-app messaging
7. **Admin messages are stored in Firestore** - for audit trail

---

## 9. FILE PATHS SUMMARY

### Admin Messaging Files:
- `app/dashboard/admin/support/page.tsx` - Support inbox UI (reply dialog)
- `app/api/admin/support/tickets/[ticketId]/reply/route.ts` - Send reply endpoint
- `lib/email/templates.ts` - Email templates (getSupportTicketReplyEmail)
- `lib/email/sender.ts` - Email sending function (sendEmailHtml)

### Dispute Resolution Files:
- `app/dashboard/admin/ops/page.tsx` - Resolve dispute dialog
- `app/dashboard/admin/protected-transactions/page.tsx` - Resolve dispute dialog
- `app/api/orders/[orderId]/disputes/resolve/route.ts` - Resolve endpoint (admin notes only)

### Other Admin Actions:
- `app/api/admin/users/[userId]/send-verification-email/route.ts` - Verification email (template-based)
- `app/api/admin/users/[userId]/password-reset-link/route.ts` - Password reset link (generates link only)

---

## 10. NEXT STEPS FOR AI IMPLEMENTATION

1. Add AI draft fields to support ticket schema (if storing drafts on tickets)
2. Create AI draft generation function for support ticket replies
3. Create API endpoint for generating drafts
4. Integrate AI draft component into support ticket reply dialog
5. Ensure drafts are editable and require explicit "Send" action
6. Consider dispute resolution context (if admins want to message users about disputes)

---

## 11. MESSAGE TYPES IDENTIFIED

### Type 1: Support Ticket Replies
- **Context:** User submitted support ticket
- **Recipient:** Ticket submitter (email)
- **Content:** Free-form text response
- **Delivery:** Email
- **Storage:** Firestore messages subcollection
- **Suitable for AI drafts:** ✅ YES

### Type 2: Dispute Resolution Messages (POTENTIAL)
- **Context:** Dispute resolved
- **Recipient:** Buyer or seller (depending on resolution)
- **Content:** Explanation of resolution
- **Delivery:** Email (if implemented)
- **Storage:** Order document or separate messages
- **Suitable for AI drafts:** ⚠️ MAYBE (if messaging is added)

### Type 3: Verification Requests (TEMPLATE-BASED)
- **Context:** Admin requests verification
- **Recipient:** User
- **Content:** Template-based email
- **Delivery:** Email
- **Suitable for AI drafts:** ❌ NO (uses template)

### Type 4: Internal Admin Notes
- **Context:** Various (disputes, orders, etc.)
- **Recipient:** None (internal only)
- **Content:** Free-form notes
- **Storage:** Order/ticket documents
- **Suitable for AI drafts:** ❌ NO (not messages to users)

---

## 12. RECOMMENDED IMPLEMENTATION SCOPE

**Primary Focus:**
- Support ticket replies (clear use case, existing UI, user-facing)

**Secondary Consideration:**
- Dispute resolution messages (if/when messaging to users is added for disputes)

**Out of Scope:**
- Template-based emails (verification, etc.)
- Internal admin notes
- Password reset links
