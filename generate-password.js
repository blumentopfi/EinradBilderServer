#!/usr/bin/env node
/**
 * Password Hash Generator
 *
 * Usage: node generate-password.js [password]
 * If no password provided, will prompt for one
 */

const bcrypt = require('bcrypt');
const readline = require('readline');

async function generateHash(password) {
  try {
    const hash = await bcrypt.hash(password, 10);
    console.log('\n✅ Password hash generated successfully!\n');
    console.log('Copy this hash to your .env file:');
    console.log('━'.repeat(80));
    console.log(hash);
    console.log('━'.repeat(80));
    console.log('\nAdd to .env file as:');
    console.log(`PASSWORD_HASH=${hash}\n`);
  } catch (error) {
    console.error('❌ Error generating hash:', error.message);
    process.exit(1);
  }
}

function promptForPassword() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Hide password input
  const stdin = process.openStdin();
  process.stdin.on('data', char => {
    char = char + '';
    switch (char) {
      case '\n':
      case '\r':
      case '\u0004':
        stdin.pause();
        break;
      default:
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write('Password: ' + '*'.repeat(rl.line.length));
        break;
    }
  });

  rl.question('Password: ', async (password) => {
    console.log();

    if (!password) {
      console.error('❌ Password cannot be empty');
      process.exit(1);
    }

    if (password.length < 8) {
      console.warn('⚠️  Warning: Password is shorter than 8 characters');
      console.warn('   Recommended: 12+ characters with mixed case, numbers, and symbols\n');
    }

    await generateHash(password);
    rl.close();
  });
}

// Main
const args = process.argv.slice(2);

if (args.length > 0) {
  // Password provided as argument
  generateHash(args[0]);
} else {
  // Prompt for password
  console.log('🔐 Password Hash Generator\n');
  promptForPassword();
}
