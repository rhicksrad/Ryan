import { stat } from 'fs/promises';
import path from 'path';

const screenshotPath = path.resolve('artifacts/dev-home.png');

async function main() {
  try {
    const info = await stat(screenshotPath);
    const sizeKb = info.size / 1024;
    if (sizeKb <= 40) {
      console.error(`❌ Screenshot too small (${sizeKb.toFixed(2)} KB). Minimum is 40 KB.`);
      process.exitCode = 1;
      return;
    }
    console.log(`✅ Screenshot verified at ${screenshotPath} (${sizeKb.toFixed(2)} KB)`);
  } catch (error) {
    console.error('❌ Screenshot verification failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

await main();
