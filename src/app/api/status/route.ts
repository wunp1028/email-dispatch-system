import { NextResponse } from 'next/server';
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSystemState } from '@/lib/storage';

export async function GET() {
  const accountId = process.env.CF_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CF_R2_BUCKET;
  const key = process.env.CF_R2_KEY || 'system_state.json';

  const envConfigured = !!(accountId && accessKeyId && secretAccessKey && bucket);

  let r2Status: 'CONNECTED' | 'ERROR' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';
  let r2Error: string | null = null;

  if (envConfigured) {
    try {
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
        },
      });

      // 測試連線讀取
      await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      r2Status = 'CONNECTED';
    } catch (err: any) {
      if (err.name === 'NoSuchKey') {
        // 檔案尚不存在，但連線認證是通的
        r2Status = 'CONNECTED';
      } else {
        r2Status = 'ERROR';
        r2Error = err.message || 'R2 connection failed';
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
      r2Bucket: bucket || null,
      r2Error,
      tasksCount: state.tasks.length,
      rosterCount: state.roster.length,
      whitelistCount: state.whitelist.length,
      lastUpdated: state.lastUpdated,
    });
  } catch (err: any) {
    return NextResponse.json({
      storageMode: 'ERROR',
      error: err.message,
    }, { status: 500 });
  }
}
