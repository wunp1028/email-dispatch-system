import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSystemState, cleanR2Config } from '@/lib/storage';

export async function GET() {
  const conf = cleanR2Config();
  const envConfigured = !!conf;

  let r2Status: 'CONNECTED' | 'ERROR' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';
  let r2Error: string | null = null;
  let accountIdPreview = '';

  if (conf) {
    accountIdPreview =
      conf.accountId.length > 8
        ? `${conf.accountId.substring(0, 4)}...${conf.accountId.substring(conf.accountId.length - 4)} (長度: ${conf.accountId.length})`
        : conf.accountId;

    try {
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${conf.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: conf.accessKeyId,
          secretAccessKey: conf.secretAccessKey,
        },
      });

      // 測試連線讀取
      await client.send(
        new GetObjectCommand({
          Bucket: conf.bucket,
          Key: conf.key,
        })
      );
      r2Status = 'CONNECTED';
    } catch (err: any) {
      if (err.name === 'NoSuchKey') {
        // 檔案尚不存在，但連線認證與 TLS 握手是完全成功的！
        r2Status = 'CONNECTED';
      } else {
        r2Status = 'ERROR';
        if (err.message?.includes('SSL alert number 40') || err.message?.includes('EPROTO')) {
          r2Error = `Cloudflare 握手失敗 (SSL Alert 40)。請確認 CF_R2_ACCOUNT_ID 是否為正確的 32 碼帳戶識別碼 (目前辨識長度: ${conf.accountId.length}，不可填入 Access Key 或完整網址)。若帳號剛開通 R2，Cloudflare 邊緣憑證生成可能需數分鐘。`;
        } else {
          r2Error = err.message || 'R2 connection failed';
        }
      }
    }
  }

  // 取得當前狀態摘要
  try {
    const state = await getSystemState();
    return NextResponse.json({
      storageMode: envConfigured && r2Status === 'CONNECTED' ? 'CLOUDFLARE_R2' : 'LOCAL_FALLBACK',
      r2Configured: envConfigured,
      r2Status,
      r2Bucket: conf?.bucket || null,
      r2AccountIdPreview: accountIdPreview,
      r2Error,
      tasksCount: state.tasks.length,
      rosterCount: state.roster.length,
      whitelistCount: state.whitelist.length,
      lastUpdated: state.lastUpdated,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        storageMode: 'ERROR',
        error: err.message,
      },
      { status: 500 }
    );
  }
}
