import { getGoogle } from '@/lib/google/client';

export default async function Home() {
  const g = await getGoogle();
  const about = await g.drive.about.get({ fields: 'user(emailAddress)' });
  return <p>Drive connected as {about.data.user?.emailAddress}</p>;
}
