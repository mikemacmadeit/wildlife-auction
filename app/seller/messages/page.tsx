import { redirect } from 'next/navigation';

export default function SellerMessagesPage(props: { searchParams?: { threadId?: string } }) {
  const threadId = props?.searchParams?.threadId ? String(props.searchParams.threadId) : '';
  redirect(`/dashboard/messages${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`);
}

