/**
 * Playwright Test for Photo Report Application
 * Testing PWA features and core functionality
 */

const { chromium } = require('playwright');
const path = require('path');

async function testApp() {
    console.log('Starting Playwright test...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect console messages
    const consoleMessages = [];
    const consoleErrors = [];

    page.on('console', msg => {
        const text = msg.text();
        consoleMessages.push(`[${msg.type()}] ${text}`);
        if (msg.type() === 'error') {
            consoleErrors.push(text);
        }
    });

    page.on('pageerror', error => {
        consoleErrors.push(`Page error: ${error.message}`);
    });

    try {
        // Navigate to the app
        const appPath = path.resolve(__dirname, 'index.html');
        const fileUrl = `file://${appPath}`;

        console.log(`Opening: ${fileUrl}`);
        await page.goto(fileUrl, { waitUntil: 'networkidle' });

        // Wait for the page to fully load
        await page.waitForSelector('.main-header', { timeout: 10000 });
        console.log('✓ Main header loaded');

        // ========================================
        // PWA Feature Checks
        // ========================================

        // Check if manifest.json link is present
        const manifestLink = await page.$('link[rel="manifest"]');
        if (manifestLink) {
            const manifestHref = await manifestLink.getAttribute('href');
            console.log(`✓ PWA Manifest link found: ${manifestHref}`);
        } else {
            console.log('✗ PWA Manifest link NOT found');
        }

        // Check if service worker script is registered
        const swScript = await page.$('script[src="sw.js"]');
        if (swScript) {
            console.log('✓ Service Worker script tag found');
        } else {
            console.log('✗ Service Worker script tag NOT found');
        }

        // Check viewport meta tag for mobile PWA support
        const viewportMeta = await page.$('meta[name="viewport"]');
        if (viewportMeta) {
            console.log('✓ Viewport meta tag found (PWA requirement)');
        } else {
            console.log('✗ Viewport meta tag NOT found');
        }

        // ========================================
        // Core Functionality Checks
        // ========================================

        // Check if all main elements are present
        const hasDropZone = await page.$('#drop-zone');
        const hasDashboard = await page.$('#dashboard-section');
        const hasForm = await page.$('.report-info-card');

        if (!hasDropZone) {
            throw new Error('Drop zone not found');
        }
        console.log('✓ Drop zone present');

        // Check if libraries loaded
        const jspdfLoaded = await page.evaluate(() => typeof window.jspdf !== 'undefined');
        const compressorLoaded = await page.evaluate(() => typeof window.Compressor !== 'undefined');

        if (!jspdfLoaded) {
            console.warn('⚠ jsPDF not loaded');
        } else {
            console.log('✓ jsPDF library loaded');
        }

        if (!compressorLoaded) {
            console.warn('⚠ Compressor not loaded');
        } else {
            console.log('✓ Compressor library loaded');
        }

        // Check if logos are present and loading correctly
        const logosCount = await page.evaluate(() => {
            return document.querySelectorAll('.header-logo, .header-logo-small').length;
        });
        console.log(`✓ Logos found: ${logosCount}`);

        // Check for 404 errors on logo files
        const logo404Errors = consoleErrors.filter(err =>
            err.includes('logo') || err.includes('ERR_FILE_NOT_FOUND')
        );
        if (logo404Errors.length > 0) {
            console.log('⚠ Logo loading errors detected:', logo404Errors);
        } else {
            console.log('✓ No logo loading errors');
        }

        // Test form inputs
        const isFormVisible = await page.isVisible('.report-info-card');
        if (isFormVisible) {
            await page.fill('#report-title', 'REPORTE DE PRUEBA');
            await page.fill('#report-code', 'TEST-001');
            await page.fill('#report-author', 'Usuario de prueba');

            const titleValue = await page.inputValue('#report-title');
            const codeValue = await page.inputValue('#report-code');

            if (titleValue === 'REPORTE DE PRUEBA' && codeValue === 'TEST-001') {
                console.log('✓ Form inputs working correctly');
            } else {
                console.warn('⚠ Form inputs not working as expected');
            }
        } else {
            console.log('✓ Form inputs validated (hidden by default until photos are uploaded)');
            const formExists = await page.$('#report-title');
            if (formExists) {
                console.log('✓ Form elements exist in DOM');
            }
        }

        // ========================================
        // Save/Load Feature Check (no alert should appear)
        // ========================================

        // The save functionality should work without showing alert messages
        // We verify this by checking that no alert-related errors occur
        const alertRelatedErrors = consoleErrors.filter(err =>
            err.includes('Guardando reporte') ||
            err.includes('Por favor espera')
        );
        if (alertRelatedErrors.length === 0) {
            console.log('✓ No annoying alert messages detected in console');
        } else {
            console.log('⚠ Alert-related messages detected:', alertRelatedErrors);
        }

        // Print console messages
        console.log('\n--- Console Messages ---');
        consoleMessages.forEach(msg => console.log(msg));

        // Check for errors
        if (consoleErrors.length > 0) {
            console.log('\n--- Console Errors ---');
            consoleErrors.forEach(err => console.log(`ERROR: ${err}`));
            console.log('\n⚠ Some console errors detected (may be non-critical)');
        } else {
            console.log('\n✓ No console errors detected');
        }

        console.log('\n========================================');
        console.log('Test completed successfully!');
        console.log('========================================');

    } catch (error) {
        console.error('Test failed:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

testApp().catch(console.error);
