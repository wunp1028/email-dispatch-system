import { NextRequest } from 'next/server';

export const DEFAULT_ADMIN_PIN = 'admin888';

/**
 * 驗證請求是否具有有效的管理員 PIN 碼
 */
export function verifyAdminRequest(req: NextRequest, configuredPin: string = DEFAULT_ADMIN_PIN): boolean {
  const pinHeader = req.headers.get('x-admin-pin');
  const pinQuery = req.nextUrl.searchParams.get('pin');
  const validPin = process.env.ADMIN_PIN || configuredPin || DEFAULT_ADMIN_PIN;

  if (pinHeader && pinHeader === validPin) return true;
  if (pinQuery && pinQuery === validPin) return true;
  return false;
}
