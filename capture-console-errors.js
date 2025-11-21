const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Launching browser to capture console errors...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleMessages = [];
  const errors = [];

  // Capture all console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });

    if (type === 'error' || type === 'warning') {
      console.log(`[${type.toUpperCase()}] ${text}`);
      errors.push({ type, text });
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
    errors.push({ type: 'pageerror', text: error.message, stack: error.stack });
  });

  // Capture failed requests
  page.on('requestfailed', request => {
    const failure = request.failure();
    console.log(`[REQUEST FAILED] ${request.url()}: ${failure ? failure.errorText : 'unknown'}`);
    errors.push({ type: 'requestfailed', url: request.url(), error: failure ? failure.errorText : 'unknown' });
  });

  try {
    const url = process.argv[2] || 'http://localhost:8082';
    console.log(`📍 Navigating to: ${url}\n`);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    console.log('\n✅ Page loaded\n');

    // Wait a bit for any async errors
    await page.waitForTimeout(5000);

    console.log('\n📊 Summary:');
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Errors/warnings: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors/Warnings found:\n');
      errors.forEach((err, i) => {
        console.log(`${i + 1}. [${err.type}]`);
        console.log(`   ${err.text || err.error}`);
        if (err.url) console.log(`   URL: ${err.url}`);
        if (err.stack) console.log(`   Stack: ${err.stack}`);
        console.log('');
      });
    } else {
      console.log('\n✅ No errors or warnings found!');
    }

    // Take a screenshot
    await page.screenshot({ path: '/tmp/console-errors-screenshot.png', fullPage: true });
    console.log('\n📸 Screenshot saved to /tmp/console-errors-screenshot.png');

  } catch (error) {
    console.error('\n💥 Error during testing:', error.message);
  } finally {
    await browser.close();
  }
})();
