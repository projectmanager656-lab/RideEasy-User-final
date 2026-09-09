const { exec } = require('child_process');

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve({ stdout, stderr });
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPassengerApp() {
  console.log('=== Testing Passenger App ===\n');
  
  // Launch Passenger
  console.log('1. Launching Passenger app...');
  await execPromise('adb -s INIJMR5XQ4IRQW8P shell am start -n com.rideeasy.passenger/.MainActivity');
  await sleep(5);
  
  // Take screenshot
  console.log('2. Taking screenshot...');
  await execPromise('adb -s INIJMR5XQ4IRQW8P shell screencap -p /sdcard/passenger-screenshot.png');
  await execPromise('adb -s INIJMR5XQ4IRQW8P pull /sdcard/passenger-screenshot.png');
  console.log('Screenshot saved: passenger-screenshot.png');
  
  // Check for crashes
  console.log('3. Checking for crashes...');
  const logcat = await execPromise('adb -s INIJMR5XQ4IRQW8P logcat -d -t 20');
  if (logcat.stdout.includes('FATAL') || logcat.stdout.includes('AndroidRuntime')) {
    console.log('CRASH DETECTED in logcat');
  } else {
    console.log('No crashes detected');
  }
  
  console.log('\n=== Passenger App Test Complete ===\n');
}

async function testDriverApp() {
  console.log('=== Testing Driver App ===\n');
  
  // Launch Driver
  console.log('1. Launching Driver app...');
  await execPromise('adb -s INIJMR5XQ4IRQW8P shell am start -n com.rideeasy.driver/.MainActivity');
  await sleep(5);
  
  // Take screenshot
  console.log('2. Taking screenshot...');
  await execPromise('adb -s INIJMR5XQ4IRQW8P shell screencap -p /sdcard/driver-screenshot.png');
  await execPromise('adb -s INIJMR5XQ4IRQW8P pull /sdcard/driver-screenshot.png');
  console.log('Screenshot saved: driver-screenshot.png');
  
  // Check for crashes
  console.log('3. Checking for crashes...');
  const logcat = await execPromise('adb -s INIJMR5XQ4IRQW8P logcat -d -t 20');
  if (logcat.stdout.includes('FATAL') || logcat.stdout.includes('AndroidRuntime')) {
    console.log('CRASH DETECTED in logcat');
  } else {
    console.log('No crashes detected');
  }
  
  console.log('\n=== Driver App Test Complete ===\n');
}

async function testADBSetup() {
  console.log('=== ADB Environment Test ===\n');
  
  console.log('1. Checking ADB devices...');
  const devices = await execPromise('adb devices');
  console.log(devices.stdout);
  
  console.log('2. Checking installed packages...');
  const packages = await execPromise('adb -s INIJMR5XQ4IRQW8P shell pm list packages | findstr rideeasy');
  console.log(packages.stdout);
  
  console.log('\n=== ADB Environment Test Complete ===\n');
}

async function runAllTests() {
  try {
    await testADBSetup();
    await testPassengerApp();
    await testDriverApp();
    console.log('\n=== ALL TESTS COMPLETE ===');
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
  }
}

runAllTests();
