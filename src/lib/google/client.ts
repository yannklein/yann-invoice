import { google, type drive_v3, type sheets_v4 } from 'googleapis';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export interface Google {
  drive: drive_v3.Drive;
  sheets: sheets_v4.Sheets;
  accessToken: string;
}

export function googleFromAccessToken(accessToken: string): Google {
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  return {
    drive: google.drive({ version: 'v3', auth: oauth }),
    sheets: google.sheets({ version: 'v4', auth: oauth }),
    accessToken,
  };
}

export async function getGoogle(): Promise<Google> {
  const session = await auth();
  if (!session?.accessToken || session.error) redirect('/api/auth/signin');
  return googleFromAccessToken(session.accessToken);
}
